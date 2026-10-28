# 云端接入实测（2026-10-28）

## 结论

微信开发者工具中已运行USE_CLOUD=true，cloudEnv=cloud1-d0gowrero76a516dd，但尚未完成云端业务接通。不能将首页可见数据判定为云端读取成功。

## 真实运行验证

使用Windows computer-use技能操作现有微信开发者工具，在小程序调试Console执行只读检查，没有修改云数据、初始化管理员、上传文件、归档档案或调整权限。

1. getApp().globalData确认cloudEnv和USE_CLOUD已设置，页面路由为pages/index/index。
2. 首页data.all仍包含本地模拟记录c1至c8（小橘、煤球等），不代表云数据库读取成功。
3. 直接wx.cloud.callFunction检查catList、checkAdmin、submissionManage(action:list)、adminManage(action:listApply)、adminList、adminApply(action:mine)，调用未成功，控制台出现-501000、FunctionName parameter could not be found、FUNCTION_NOT_FOUND。
4. 又显式指定config.env=cloud1-d0gowrero76a516dd，检查catList、checkAdmin、catDetail（空参数探测）、submissionManage、adminManage、adminList、adminApply，七项均失败。独立再次调用catList确认返回-501000 / FUNCTION_NOT_FOUND。
5. 云开发控制台云函数列表持续显示加载中，不能据其“共0条”占位文字认定实际函数数量；函数可用性结论以上述调用错误为依据。

需要核对这11个函数是否已以准确名称部署到指定环境：initAdmin、checkAdmin、catList、catDetail、catManage、updateCreate、adminList、adminManage、adminApply、catSubmit、submissionManage。确认环境ID并不等于完成函数部署。

## 本地代码验证（不是云端实测）

### 服务层可能提前固定为模拟模式

位置：miniprogram/utils/service.js:4–5；miniprogram/app.js的onLaunch。

服务模块顶层立即getApp()并用const保存USE_CLOUD，app.onLaunch又立即require该服务。如果首次加载时拿不到已注册App，就会永久保存false，后续globalData.USE_CLOUD=true也不改变该模块。

隔离VM验证：先以getApp()返回undefined加载服务，随后提供USE_CLOUD=true的App，再调用getCats；实际云调用次数为0，返回首个ID为c1。与现场“全局true、首页模拟记录、直接云调用失败”的现象相符；启动时序是根因候选，尚未用真实运行断点追踪最终确认。

建议在每次服务调用时读取有效配置，并对云模式初始化失败显式报错，不静默使用模拟数据。

### 媒体上传失败仍继续保存临时路径

位置：miniprogram/utils/service.js:188。

当前已新增uploadFile，较旧检查报告有进展。但uploadOne使用catch(()=>p)，失败时仍返回原本地路径。

隔离VM模拟上传失败，catManage仍调用成功替身，并把wxfile://temp.jpg传给写入接口。真实云端未进行任何上传或写入。应让上传失败终止提交并提示重试，禁止把不可跨设备使用的临时路径当成功结果写入。

## 尚未验证及下一步

- 真实列表、详情、搜索、当前账号鉴权：被函数调用失败阻塞。
- 新增/编辑/近况/投稿/采纳/申请审批/媒体：未做真实写入测试；不能标为通过。
- 管理员转让、撤权、归档：未执行真实操作。
- 数据库六集合、索引、实际读写权限、云存储权限：未核验。
- 安卓/iPhone、跨设备媒体、分享：未验证。

建议先完成函数部署核对和服务层配置时序修复，再做只读冒烟测试；通过后用明确标识的测试档案验证写入、刷新、重启恢复和媒体读取。身份转让等操作单独安排，避免影响现有管理员。

本次只新增此记录，未修改业务代码和线上配置。
