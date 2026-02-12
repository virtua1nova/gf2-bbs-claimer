const path = require('path');
const fs = require('fs');

const PERFORMED = "performed", SIGNED = "signed", EXCHANGED = "exchanged";
const TASK_1 = "点赞帖子", TASK_2 = "分享帖子", TASK_3 = "浏览帖子";
const DEFAULT = {
    notification: 1,
    base_url: 'https://gf2-bbs-api.exiliumgf.com',
    threshold: 600, // 判断token是否过期阈值（单位秒）
    network_delay: 600 // 请求延迟（单位毫秒）
};
const configPath = path.resolve(__dirname, './config.json');
const _config = getConfig(configPath);
const config = Object.assign({}, DEFAULT, _config);
const SCRIPT_NAME = config.name || "少前2bbs自动兑换物品脚本";
let timer;
log(`开始执行${SCRIPT_NAME}...`);
const states = {
    [SIGNED]: getKey(SIGNED),
    [PERFORMED]: getKey(PERFORMED),
    [EXCHANGED]: getKey(EXCHANGED)
};
if (states[SIGNED] && states[PERFORMED] && [EXCHANGED]) {
    log('今日已执行.');
    return;
}
const BASE_URL = config.base_url, OK = "OK";
// 获取配置；
function getConfig(path) {
    return require(path);
}
// 账号登录；返回一个令牌
async function login(account, password) {
    if (!account || !password) {
        throw new Error("账号密码不能为空");
    }
    const pattern = /^1[3456789]\d{9}$/;
    let source;
    if (pattern.test(account)) {
        source = "phone";
    }
    else if (account.includes("@")) {
        source = "email";
    }
    else {
        throw new Error("账号格式错误");
    }
    const resp = await fetch(`${BASE_URL}/login/account`, {
        method: "post",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: account, passwd: encrypt(password), source })
    });
    return (await resp.json()).data.account.token;
}
// 获取现在到凌晨毫秒，作为config[key]的值，也为对应key的有效期；
function getExpiration() {
    const date = new Date();
    const millseconds = date.getTime();
    const ms2 = date.setHours(24, 0, 0, 0);
    return ms2 - millseconds;
}
// 是否已经签到
async function signed(token) {
    const resp = await (await fetch(`${BASE_URL}/community/task/get_current_sign_in_status`, {
        headers: { Authorization: token, "Content-Type": "application/json" }
    })).json();
    return resp.data.has_sign_in;
}
function successful(resp) {
    return resp.Message === OK;
}
// 签到
async function signIn(token, _signed) {
    log(signIn.name);
    // 一共两次判断，一次为本地判断，另一次为从服务器获取数据判断，兑换和执行每日任务同理
    if (_signed || (await signed(token))) {
        console.log('今日已签到');
        return { [SIGNED]: setKey(SIGNED) };
    }
    let resp = await fetch(`${BASE_URL}/community/task/sign_in`, {
        method: "post",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: "{}"
    });
    resp = await resp.json();
    successful(resp) && (resp[SIGNED] = setKey(SIGNED));
    return resp;
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function like(token, topicId) {
    return await (await fetch(`${BASE_URL}/community/topic/like/${topicId}?id=${topicId}`, {
        headers: { Authorization: token, "Content-Type": "application/json" }
    })).json();
}
// 点赞(三个帖子)；
// 如果帖子为"点赞"状态，则需要先取消点赞，再重新点赞
async function task1(token, posts) {
    let resps = [], index = 0;
    while (index < posts.length) {
        const item = posts[index++];
        resps.push(await like(token, item.topic_id));
        await delay(config.network_delay);
        if (item.is_like) {
            item.is_like = false;
            index--;
        }
    }
    return resps;
}
// 分享
async function task2(token, posts) {
    const topicId = posts[0].topic_id;
    const resp = await fetch(`${BASE_URL}/community/topic/share/${topicId}?id=${topicId}`, {
        headers: { Authorization: token, "Content-Type": "application/json" }
    });
    return await resp.json();
}
// 浏览
async function task3(token, posts) {
    const resps = [];
    for(const item of posts) {
        const topicId = item.topic_id;
        const resp = await fetch(`${BASE_URL}/community/topic/${topicId}?id=${topicId}`, {
            headers: { Authorization: token, "Content-Type": "application/json" }
        });
        resps.push(await resp.json());
        await delay(config.network_delay);
    }
    return resps;
}
// 兑换物品；根据配置文件中的数据进行兑换；
// 1->情报拼图，2->萨狄斯金，3->战场报告，4->解析图纸，5->基原信息核，此外，还有不定时加入的限定物品；
// 每日都完成任务时，不会存在积分不足的问题。
async function exchange(token, exchanged) {
    log(exchange.name);
    if (exchanged) {
        console.log('今日已兑换');
        return null;
    }
    const result = {};
    const [exchangeList, memberInfoResp] = await Promise.all([getExchangeList(token), getInfo(token)]);
    let score = (await memberInfoResp.json()).data.user.score;
    for (const item of exchangeList) {
        const id = item.exchange_id;
        while (score >= item.use_score && (item.exchange_count < item.max_exchange_count)) {
            const resp = await fetch(`${BASE_URL}/community/item/exchange`, {
                method: 'post',
                headers: { Authorization: token, "Content-Type": "application/json" },
                body: JSON.stringify({ exchange_id: id })
            });
            item.exchange_count++;
            score -= item.use_score;
            result[id] = await resp.json();
            await delay(config.network_delay);
        }
    }
    Object.values(result).every(successful) && setKey(EXCHANGED);
    return result;
}
async function getPost(token) {
    const resp = await fetch(`${BASE_URL}/community/topic/list?sort_type=1&category_id=1&query_type=1&last_tid=0&pub_time=0&reply_time=0&hot_value=0`, {
        headers: { Authorization: token, "Content-Type": "application/json" },
    });
    const _resp = await resp.json();
    return _resp.data.list;
}
/**
 * 获取兑换列表
 * @param {String} token
 * @returns {Array}
 */
async function getExchangeList(token) {
    const resp = await fetch(`${BASE_URL}/community/item/exchange_list`, {
        headers: { Authorization: token, "Content-Type": "application/json" },
    });
    return (await resp.json()).data.list;
}
/**
 * 过滤已点赞帖子
 * @param {*} list posts
 * @returns {Array}
 */
function notLikeFilter(list) {
    return list.filter(item => !item.is_like);
}
async function getTask(token) {
    const resp = await (await fetch(`${BASE_URL}/community/task/get_current_task_list`, {
        headers: { Authorization: token, "Content-Type": "application/json" }
    })).json();
    return resp.data.daily_task;
}
// 过期时，返回空值
function getKey(key) {
    const v = config[key];
    if (v) {
        if (Date.now < +v) {
            return v;
        }
        config[key] = "";
        saveConfig();
        return config[key];
    }
    return "";
}
function setKey(key) {
    let value;
    if (!(value = config[key])) {
        value = getExpiration();
        config[key] = value;
        saveConfig();
    }
    return value;
}
// 执行每日任务
async function performTask(token, performed) {
    log(performTask.name);
    if (performed) {
        console.log('今日已完成任务');
        return null;
    }
    const results = {};
    const tasks = await getTask(token);
    // 待执行任务列表；当key存在时表示需要执行
    const pending = {};
    for (const item of tasks) {
        if (item.complete_count < item.max_complete_count) {
            pending[item.task_name] = "1";
        }
    }
    const keys = Object.keys(pending);
    if (!keys.length) {
        results[PERFORMED] = setKey(PERFORMED);
        console.log('今日已完成任务');
        return results;
    }
    const posts = await getPost(token);
    let filtered = notLikeFilter(posts);
    // 如果没有或少于符合条件的数据，则使用原始数据填充（但估计会很少遇到，毕竟是极端情况）
    if (filtered.length < 3) {
        filtered.push(...posts.slice(0, (3 - filtered.length)));
    }
    const _posts = filtered.slice(0, 3);
    pending[TASK_1] && (pending[TASK_1] = task1(token, _posts));
    pending[TASK_2] && (pending[TASK_2] = task2(token, _posts));
    pending[TASK_3] && (pending[TASK_3] = task3(token, _posts));
    const responses = await Promise.all(Object.values(pending));

    for (let i=0; i<keys.length; i++) {
        const key = keys[i];
        const resp = responses[i];
        results[key] = resp;
    }
    responses
        .flat()
        .every(successful) && setKey(PERFORMED);
    return results;
}
async function runner(token, states) {
    const resp2signIn = await signIn(token, states[SIGNED]);
    if (resp2signIn) {
        console.log(resp2signIn);
    }
    const resp2performTask = await performTask(token, states[PERFORMED]);
    resp2performTask && console.log(resp2performTask);
    const resp2exchange = await exchange(token, states[EXCHANGED]);
    resp2exchange && console.log(resp2exchange);
}
// (md5)加密
function encrypt(input) {
    return ke(input);
}
async function getInfo(token) {
    return await fetch(`${BASE_URL}/community/member/info`, {
        method: 'post',
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: "{}"
    });
}
function atob(input) {
    const buffer = Buffer.from(input, 'base64');
    return buffer.toString('binary');
}
// 获取用户信息(其实是用于检查令牌是否有效)；
// 测试发现，只要令牌未过期，都可获取到数据，即可存在多个令牌（服务器不记录状态）；
// 当response.status为401时，表示令牌过期；
// 运行一段时间之后，感觉这个校验方式不准确，常出现《前一秒校验还通过，后一秒就过期》的诡异现象，故更改判断方式，
// 具体为解析jwt中的载荷数据作为依据，如果过期时间与当前时间的差值小于等于10分钟时，判断为过期
async function checkToken(token) {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.exp - (Date.now() / 1000)) > config.threshold;
}
function saveConfig() {
    if (timer) {
        clearTimeout(timer);
    }
    timer = setTimeout(() => {
        let str = JSON.stringify(config);
        log('保存配置文件');
        log(str);
        fs.writeFileSync(configPath, str);
        clearTimeout(timer);
        timer = null;
    }, 5000);
}
function saveToken(token) {
    config['token'] = token;
    saveConfig();
}
function log(msg, level='log') {
    console[level](`[${new Date().toLocaleString()} ${msg}]`);
}
function errorHandler(ev) {
    log(`${SCRIPT_NAME}执行出现错误：`, 'error');
    console.error(ev);
    console.warn("若未完成兑换时，请手动处理.");
    notice3(config);
}
function notice(message, duration, _delay=50) {
    log(message);
}
function notice1(config) {
    if (+config.notification) {
        notice(`脚本执行完成.`, 3000);
    }
}
function notice2(config) {
    if (+config.notification) {
        notice(`脚本执行中...`, -1, 100);
    }
}
function notice3(config) {
    if (+config.notification) {
        notice(`脚本执行出现错误.`, 3000);
    }
}
// -----------------加密相关(无需理会)-----------------
function Ht(t) {
    for (var e = 0; e < t; e++)
        this[e] = 0;
    this.length = t
}
function Dt(t) {
    return t % 4294967296
}
function Bt(t, e) {
    return t = Dt(t),
    e = Dt(e),
    t - 2147483648 >= 0 ? (t %= 2147483648,
    t >>= e,
    t += 1073741824 >> e - 1) : t >>= e,
    t
}
function Nt(t) {
    return t %= 2147483648,
    !0 & t ? (t -= 1073741824,
    t *= 2,
    t += 2147483648) : t *= 2,
    t
}
function Et(t, e) {
    t = Dt(t),
    e = Dt(e);
    for (var s = 0; s < e; s++)
        t = Nt(t);
    return t
}
function Mt(t, e) {
    t = Dt(t),
    e = Dt(e);
    var s = t - 2147483648
        , i = e - 2147483648;
    return s >= 0 ? i >= 0 ? 2147483648 + (s & i) : s & e : i >= 0 ? t & i : t & e
}
function Pt(t, e) {
    t = Dt(t),
    e = Dt(e);
    var s = t - 2147483648
        , i = e - 2147483648;
    return s >= 0 ? i >= 0 ? 2147483648 + (s | i) : 2147483648 + (s | e) : i >= 0 ? 2147483648 + (t | i) : t | e
}
function Zt(t, e) {
    t = Dt(t),
    e = Dt(e);
    var s = t - 2147483648
        , i = e - 2147483648;
    return s >= 0 ? i >= 0 ? s ^ i : 2147483648 + (s ^ e) : i >= 0 ? 2147483648 + (t ^ i) : t ^ e
}
function Rt(t) {
    return t = Dt(t),
    4294967295 - t
}
var Ut = new Ht(4)
    , Gt = new Ht(2);
Gt[0] = 0,
Gt[1] = 0;
var Ft = new Ht(64)
    , Vt = new Ht(16)
    , qt = new Ht(16)
    , Kt = 7
    , Qt = 12
    , Xt = 17
    , Yt = 22
    , Jt = 5
    , Wt = 9
    , $t = 14
    , te = 20
    , ee = 4
    , se = 11
    , ie = 16
    , ne = 23
    , ae = 6
    , oe = 10
    , ce = 15
    , le = 21;
function re(t, e, s) {
    return Pt(Mt(t, e), Mt(Rt(t), s))
}
function ge(t, e, s) {
    return Pt(Mt(t, s), Mt(e, Rt(s)))
}
function ue(t, e, s) {
    return Zt(Zt(t, e), s)
}
function he(t, e, s) {
    return Zt(e, Pt(t, Rt(s)))
}
function me(t, e) {
    return Pt(Et(t, e), Bt(t, 32 - e))
}
function de(t, e, s, i, n, a, o) {
    return t = t + re(e, s, i) + n + o,
    t = me(t, a),
    t += e,
    t
}
function Ae(t, e, s, i, n, a, o) {
    return t = t + ge(e, s, i) + n + o,
    t = me(t, a),
    t += e,
    t
}
function _e(t, e, s, i, n, a, o) {
    return t = t + ue(e, s, i) + n + o,
    t = me(t, a),
    t += e,
    t
}
function fe(t, e, s, i, n, a, o) {
    return t = t + he(e, s, i) + n + o,
    t = me(t, a),
    t += e,
    t
}
function pe(t, e) {
    var s = 0
        , i = 0
        , n = 0
        , a = 0
        , o = Vt;
    s = Ut[0],
    i = Ut[1],
    n = Ut[2],
    a = Ut[3];
    for (var c = 0; c < 16; c++) {
        o[c] = Mt(t[4 * c + e], 255);
        for (var l = 1; l < 4; l++)
            o[c] += Et(Mt(t[4 * c + l + e], 255), 8 * l)
    }
    s = de(s, i, n, a, o[0], Kt, 3614090360),
    a = de(a, s, i, n, o[1], Qt, 3905402710),
    n = de(n, a, s, i, o[2], Xt, 606105819),
    i = de(i, n, a, s, o[3], Yt, 3250441966),
    s = de(s, i, n, a, o[4], Kt, 4118548399),
    a = de(a, s, i, n, o[5], Qt, 1200080426),
    n = de(n, a, s, i, o[6], Xt, 2821735955),
    i = de(i, n, a, s, o[7], Yt, 4249261313),
    s = de(s, i, n, a, o[8], Kt, 1770035416),
    a = de(a, s, i, n, o[9], Qt, 2336552879),
    n = de(n, a, s, i, o[10], Xt, 4294925233),
    i = de(i, n, a, s, o[11], Yt, 2304563134),
    s = de(s, i, n, a, o[12], Kt, 1804603682),
    a = de(a, s, i, n, o[13], Qt, 4254626195),
    n = de(n, a, s, i, o[14], Xt, 2792965006),
    i = de(i, n, a, s, o[15], Yt, 1236535329),
    s = Ae(s, i, n, a, o[1], Jt, 4129170786),
    a = Ae(a, s, i, n, o[6], Wt, 3225465664),
    n = Ae(n, a, s, i, o[11], $t, 643717713),
    i = Ae(i, n, a, s, o[0], te, 3921069994),
    s = Ae(s, i, n, a, o[5], Jt, 3593408605),
    a = Ae(a, s, i, n, o[10], Wt, 38016083),
    n = Ae(n, a, s, i, o[15], $t, 3634488961),
    i = Ae(i, n, a, s, o[4], te, 3889429448),
    s = Ae(s, i, n, a, o[9], Jt, 568446438),
    a = Ae(a, s, i, n, o[14], Wt, 3275163606),
    n = Ae(n, a, s, i, o[3], $t, 4107603335),
    i = Ae(i, n, a, s, o[8], te, 1163531501),
    s = Ae(s, i, n, a, o[13], Jt, 2850285829),
    a = Ae(a, s, i, n, o[2], Wt, 4243563512),
    n = Ae(n, a, s, i, o[7], $t, 1735328473),
    i = Ae(i, n, a, s, o[12], te, 2368359562),
    s = _e(s, i, n, a, o[5], ee, 4294588738),
    a = _e(a, s, i, n, o[8], se, 2272392833),
    n = _e(n, a, s, i, o[11], ie, 1839030562),
    i = _e(i, n, a, s, o[14], ne, 4259657740),
    s = _e(s, i, n, a, o[1], ee, 2763975236),
    a = _e(a, s, i, n, o[4], se, 1272893353),
    n = _e(n, a, s, i, o[7], ie, 4139469664),
    i = _e(i, n, a, s, o[10], ne, 3200236656),
    s = _e(s, i, n, a, o[13], ee, 681279174),
    a = _e(a, s, i, n, o[0], se, 3936430074),
    n = _e(n, a, s, i, o[3], ie, 3572445317),
    i = _e(i, n, a, s, o[6], ne, 76029189),
    s = _e(s, i, n, a, o[9], ee, 3654602809),
    a = _e(a, s, i, n, o[12], se, 3873151461),
    n = _e(n, a, s, i, o[15], ie, 530742520),
    i = _e(i, n, a, s, o[2], ne, 3299628645),
    s = fe(s, i, n, a, o[0], ae, 4096336452),
    a = fe(a, s, i, n, o[7], oe, 1126891415),
    n = fe(n, a, s, i, o[14], ce, 2878612391),
    i = fe(i, n, a, s, o[5], le, 4237533241),
    s = fe(s, i, n, a, o[12], ae, 1700485571),
    a = fe(a, s, i, n, o[3], oe, 2399980690),
    n = fe(n, a, s, i, o[10], ce, 4293915773),
    i = fe(i, n, a, s, o[1], le, 2240044497),
    s = fe(s, i, n, a, o[8], ae, 1873313359),
    a = fe(a, s, i, n, o[15], oe, 4264355552),
    n = fe(n, a, s, i, o[6], ce, 2734768916),
    i = fe(i, n, a, s, o[13], le, 1309151649),
    s = fe(s, i, n, a, o[4], ae, 4149444226),
    a = fe(a, s, i, n, o[11], oe, 3174756917),
    n = fe(n, a, s, i, o[2], ce, 718787259),
    i = fe(i, n, a, s, o[9], le, 3951481745),
    Ut[0] += s,
    Ut[1] += i,
    Ut[2] += n,
    Ut[3] += a
}
function ve() {
    Gt[0] = Gt[1] = 0,
    Ut[0] = 1732584193,
    Ut[1] = 4023233417,
    Ut[2] = 2562383102,
    Ut[3] = 271733878;
    for (var t = 0; t < qt.length; t++)
        qt[t] = 0
}
function ze(t) {
    var e;
    e = Mt(Bt(Gt[0], 3), 63),
    Gt[0] < 4294967288 || (Gt[1]++,
    Gt[0] -= 4294967296),
    Gt[0] += 8,
    Ft[e] = Mt(t, 255),
    e >= 63 && pe(Ft, 0)
}
function ye() {
    var t, e = new Ht(8), s = 0, i = 0, n = 0;
    for (s = 0; s < 4; s++)
        e[s] = Mt(Bt(Gt[0], 8 * s), 255);
    for (s = 0; s < 4; s++)
        e[s + 4] = Mt(Bt(Gt[1], 8 * s), 255);
    i = Mt(Bt(Gt[0], 3), 63),
    n = i < 56 ? 56 - i : 120 - i,
    t = new Ht(64),
    t[0] = 128;
    for (s = 0; s < n; s++)
        ze(t[s]);
    for (s = 0; s < 8; s++)
        ze(e[s]);
    for (s = 0; s < 4; s++)
        for (var a = 0; a < 4; a++)
            qt[4 * s + a] = Mt(Bt(Ut[s], 8 * a), 255)
}
function be(t) {
    for (var e = "0123456789abcdef", s = "", i = t, n = 0; n < 8; n++)
        s = e.charAt(Math.abs(i) % 16) + s,
        i = Math.floor(i / 16);
    return s
}
var Te = "01234567890123456789012345678901 !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const ke = function(t) {
    var e, s, i, n, a, o;
    ve();
    for (var c = 0; c < t.length; c++)
        e = t.charAt(c),
        ze(Te.lastIndexOf(e));
    ye(),
    i = n = a = o = 0;
    for (var l = 0; l < 4; l++)
        i += Et(qt[15 - l], 8 * l);
    for (l = 4; l < 8; l++)
        n += Et(qt[15 - l], 8 * (l - 4));
    for (l = 8; l < 12; l++)
        a += Et(qt[15 - l], 8 * (l - 8));
    for (l = 12; l < 16; l++)
        o += Et(qt[15 - l], 8 * (l - 12));
    return s = be(o) + be(a) + be(n) + be(i),
    s
};
// ----------------------------------
function getToken() {
    return config['token'] || "";
}
process.on('uncaughtException', errorHandler);
process.on('unhandledRejection', errorHandler);
let token;
if ((token = getToken())) {
    notice2(config);
    checkToken(token)
        .then(async valid => {
            if (!valid) {
                token = await login(config.account, config.password);
                saveToken(token);
            }
            await runner(token, states);
            log(`${SCRIPT_NAME}执行完成.`);
            notice1(config);
        })
        .catch(errorHandler);
}
else {
    notice2(config);
    login(config.account, config.password)
        .then(async token => {
            saveToken(token);
            await runner(token, states);
            log(`${SCRIPT_NAME}执行完成.`);
            notice1(config);
        })
        .catch(errorHandler);
}