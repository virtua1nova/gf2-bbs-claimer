# 少前2bbs自动兑换物品脚本

由于觉得少前2论坛的兑换物品功能比较繁琐，于是萌生了写个脚本以代替手工操作的想法，也就是本脚本的由来。

原本只想做兑换体力，其他的真就连看都不想看，打发叫花子都嫌少的类型，但后面发现完成论坛每日任务所获取的积分足以换取所有物品后，索性全部加上，蚊子腿再小也是肉.jpg（笑），反正也不用动手，交给脚本就完事了。

脚本基于论坛的api开发，但也已经将流程调整至比较接近人类的行为，所以理论上不会对服务器的正常运行造成影响。

在安装了脚本，并为之配置环境后(可选)，打开论坛时，脚本会自动执行，频率为每日一次，**共分为两个阶段**：

**1、执行中**

该阶段会完成以下事件：

- 签到
- 论坛每日(点赞、浏览、分享)
- 兑换物品

默认情况下，此时论坛右上角会显示“执行中”的字样，表示程序正在运行，此过程会持续数秒。

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/6A6AA36260B4B8EA423FF0B179601A33.png)

*图1 脚本执行中通知*

**2、执行完成**

在相同的位置，出现“执行完成”字样的通知，表示程序执行完成，并将结果缓存于浏览器，直至下一天。

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/CBB10DB9D72BF383692A5F65303BD967.png)

*图2 脚本执行完成后通知*

随后在游戏内领取物件。

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/24FA9D8C8B948DD4729EFCAEA5B8C148.jpg)

*图3 兑换成功-1*

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/0993685B6B00F749BCD8CA60989BC3A9.jpg)

*图4 兑换成功-2*

## 一、在使用脚本之前(重要)...

有一点要提前告知的事项。

该脚本可与一个额外的配置文件协同运行：**该配置具有包括论坛账号&密码在内的数据(请放心，仅限于本地读取)**，因此需要做些许改动，若能提供的话，请按照后续章节进行操作；但若不想或懒得提供的话，后面就不用看了，直接安装使用即可。作为代替的是，当凭证过期时，由于没有账号信息，本程序无法自动完成登录，需要自己手动进行操作。

## 二、配置脚本运行环境

本章节虽需要动手，但并不多。

**可以简单概括为两步：1）新建配置文件；2）将文件的路径同步至脚本中**。

### 1、创建配置文件

在本地创建一个文件，可命名为config.json（或其他别的名字，只需要保证路径正确），其格式如下：

```json
{
    "account": "你的账号",
    "password": "你的密码",
    "notification": 1,
    "threshold": 600,
    "network_delay": 600
}
```

将以上文本复制并粘贴到新文件中，除了需要输入自己的账号&密码外，其他配置属性均可采用默认值，完成后保存文件。

> notification表示是否开启通知（为0时表示关闭）；threshold表示判断令牌是否过期阈值（单位秒）；network_delay表示网络请求延迟（单位毫秒）。

### 2、修改脚本源码

这一步主要是将上述的配置文件的路径应用于脚本中，以供读取。

> 下面以chrome为例，如果没安装油猴插件的话，请自行安装，无论是百度，还是谷歌，或别的什么都行，都能搜出一大堆教程。

#### 2.1 在右上角点击“拓展程序”，找到“篡改猴”，并点击

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/4C68A4C90B5E8363D3F5B64FF11142C2.png)

*图2-1 点击“篡改猴”*

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/0E42107121FE5FDA30DF31FF5A48C0FE.png)

*图2-2 点击“管理面板”*

#### 2.2 找到本脚本，点击编辑

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/B35D60B6D3BEA8BBDC617DC73944F123.png)

*图2-3 编辑脚本*

#### 2.3 修改配置文件路径

在源码头部找到如下位置：

```text
// ==UserScript==
略...
// @grant        GM_getResourceText
// @resource     config http://your/path/to/config.json
// @license      MIT
// ==/UserScript==
```

将@resource项"config"字样后，以"http"开头的路径修改为你的路径（路径最好不包含中文，否则可能会有问题）。

且配置文件路径应该以文件协议开头，如现有路径“file:///D:/xxx/MyApp.localized/gf2-bbs-claimer/config.json”时，则应该修改为：


```text
// ==UserScript==
略...
// @grant        GM_getResourceText
// @resource     config file:///D:/xxx/MyApp.localized/gf2-bbs-claimer/config.json
// @license      MIT
// ==/UserScript==
```

这里有个比较简单的做法：将已创建好的配置文件拖至浏览器打开后，将搜索栏的路径复制粘贴到此处即可。

最后别忘了保存。

### 3、授权油猴插件读取文件权限

> 如果已经授权过，该步骤可忽略

出于安全问题，默认情况下，油猴插件没有读取本地文件的权限，需要手动赋予。

#### 3.1 在浏览器输入：chrome://extensions/

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/3B7B1727C36341E6143498AFFE3F1F26.png)

*图2-4 打开拓展程序管理面板*

#### 3.2 找到油猴插件，并点击“详情”

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/0192D19DA6DE6DAF630D0556D01B1AF0.png)

*图2-5 油猴插件*

#### 3.3 点击启用权限

> 未启用时为灰色

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/4E7129E3A62AECF6F51424FB2D081562.png)

*图2-6 允许油猴插件访问文件网址*

***

至此，前置工作已经全部完成💊，脚本应该可以正常运行了🎉🎉。

如果觉得还不错的话，可以分享给需要的人，或者有什么问题和建议时，尽管呼我。

## 更新日志

### 202602

#### 1、优化了弹窗提示

只会在首页出现，且每日有次数上限。

### 202506

#### 1、优化了执行流程

当前令牌已过期时，同样会进入等待登录状态。

#### 2、优化了提示

当令牌过期且不前往登录时，会导致多次提示（每次刷新页面），现已处理了该问题。

### 202505

#### 1、优化了判断令牌是否过期的逻辑

由原本请求接口判断改为获取jwt的载荷数据进行判断。

#### 2、优化了兑换物品的逻辑

删除了没必要的排序。

#### 3、优化了通知

若未获取到通知节点的预定父节点时(有时因未渲染完成会引发该情况)，改为向docuemnt.body添加通知节点。

### 202504

#### 1、删除了物品id配置项

修改策略为积分足够时，兑换全部物品。

#### 2、新增了服务器版本

现已支持在服务器上运行。

在服务器安装了nodejs的情况下，前往[仓库](https://github.com/virtua1nova/gf2-bbs-claimer)获取gf2-bbs-claimer-for-server.js脚本，推荐配合一些定时任务使用，如crontab、pm2等。

注：由于脚本中使用到fetch模块，所以node版本需要在18以上。

以crontab为例：

```text
# 打开编辑面板，添加定时任务，如每天凌晨、中午12点10分执行（增加容错）
crontab -e
# 将"10 0,12 * * * /usr/local/bin/node /your/path/to/gf2-bbs-claimer-for-server.js >> /your/path/to/gf2-bbs-claimer-for-server.log 2>&1"粘贴进去，并保存退出
```

**注意，服务器版本，必须提供配置文件，放在与脚本同一目录即可。**

### 202503

#### 1、新增了移动端适配

> 现在本脚本已经可以在移动端上运行，时机为：从游戏内点开论坛，等待登录完成后

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/F17B0F02A8CD5462C4D41820B6ECBF9B.jpg)

*图5 移动端适配-1*

![image](https://cdn.jsdelivr.net/gh/virtua1nova/gf2-bbs-claimer/images/26D4BC4755F4E7D8AF2C424C8B1A5CA7.jpg)

*图6 移动端适配-2*