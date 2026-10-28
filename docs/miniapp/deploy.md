# 云端部署与首次使用指南

环境信息（已写入 `miniprogram/app.js`）

```
cloudEnv: 'cloud1-d0gowrero76a516dd'
USE_CLOUD: true
```

回退本地预览：把 `USE_CLOUD` 改回 `false` 即可（使用 `utils/service.js` 的本地模拟数据，不需要云端）。

---

## 一、部署 11 个云函数

1. 微信开发者工具 → 工具栏「云开发」→ 确认当前环境 ID 为 `cloud1-d0gowrero76a516dd`
2. 左侧文件树展开 `cloudfunctions/`，对下面每个目录**右键 →「上传并部署：云端安装依赖（不上传 node_modules）」**：

| 云函数 | 用途 | 谁可调用 |
|---|---|---|
| `catList` | 首页列表 | 公开 |
| `catDetail` | 猫咪详情 | 公开 |
| `catManage` | 新增/编辑/归档 | 管理员 |
| `updateCreate` | 补充近况（时间线） | 管理员 |
| `catSubmit` | 游客投稿 | 公开 |
| `submissionManage` | 投稿审核（list/approve/reject） | 管理员 |
| `checkAdmin` | 身份校验 | 公开 |
| `initAdmin` | 初始化首位超管 | 仅 `admin_users` 为空时 |
| `adminList` | 管理员名单 | 超级管理员 |
| `adminManage` | 增删/转让/申请审批 | 超级管理员 |
| `adminApply` | 提交/查询管理员申请 | 公开 |

3. 部署后在「云开发控制台 → 云函数」应看到 11 个，状态正常。

> 提示：`adminApply` 目录需包含 `package.json`（已在仓库中），否则依赖安装会失败。

---

## 二、创建 6 个集合

云开发控制台 → 数据库 → 新建集合：

| 集合 | 内容 |
|---|---|
| `cats` | 猫咪档案主表 |
| `cat_updates` | 近况时间线 |
| `cat_submissions` | 游客投稿待审池 |
| `admin_users` | 管理员名单 |
| `admin_applications` | 管理员申请待审池 |
| `admin_audit_logs` | 操作审计日志 |

**权限设置（重要）**：每个集合 →「权限设置」→ 选择**自定义安全规则**，设为：

```json
{ "read": false, "write": false }
```

即所有用户不可读写。理由：数据一律经云函数读写，客户端不能直连数据库，否则游客可直接读到 `operatorOpenid`、绕过审核流程。

---

## 三、索引建议

数据库 → 对应集合 → 索引管理 → 添加：

- `cats`：`lifeStatus`、`published`、`name`
- `cat_updates`：`catId`
- `cat_submissions`：`status`
- `admin_users`：`openid`（**必须勾选「唯一」**——它是并发重复初始化/重复添加的兜底约束）
- `admin_applications`：`openid`、`status`

---

## 四、云存储

无需额外配置，保持默认权限（所有用户可读、仅创建者可写）。

照片与音频由客户端上传到 `cats/` 目录，返回的 `cloud://` fileID 存入 `cats.photos` / `cats.voice`。
详情页 `<image>` 可直接显示 `cloud://`；播放叫声时会先 `wx.cloud.downloadFile` 转临时文件再播放（已处理）。

---

## 五、首次运行：成为超级管理员

1. 重新编译运行小程序
2. 关于页 → 「管理员入口」
3. 云端 `admin_users` 为空 → `initAdmin` 成功 → **你成为首位超级管理员**，弹窗提示后进入管理台
4. 之后再有人点同样入口 → 系统已有超管，初始化被拒 → 走「填写管理员申请」→ 你在管理台「待认领申请」点「通过」→ 对方成为普通管理员

> `initAdmin` 用事务保证只在无 superadmin 时成功，后来者无法篡权。若想重新初始化，清空 `admin_users` 集合即可。

---

## 六、录入数据

- 管理台 → 猫咪管理 →「＋ 新增」：名字必填（≤20 字），其余可选；选照片会自动上传云存储
- 游客在关于页「我要提供猫咪数据」投稿 → 管理台「待审投稿」查看/采纳
- 补充近况走管理台，会同时更新 `latestNote` 并向时间线追加一条

---

## 七、常见问题排查

| 现象 | 原因 / 处理 |
|---|---|
| 首页空白、无数据 | 集合未建或云函数未部署；打开云开发控制台 → 云函数 → 查看调用日志的错误信息 |
| 保存失败弹窗 | 看云函数日志；常见是目标集合不存在或参数校验未过 |
| 照片不显示 | 确认 `cats.photos` 存的是 `cloud://` fileID；若为本地临时路径说明上传失败 |
| 进不去管理台 | `admin_users` 是否已有 superadmin；无则走步骤五重新初始化 |
| 一直提示「还不是管理员」 | 你不是超管且没有待审申请；提交申请后等超管通过 |
| 云函数调用报 -501000 | 环境 ID 与 `app.js` 的 `cloudEnv` 不一致 |
