# 云端后台设计（CloudBase / 微信云开发）

> 依赖：用户需在云开发控制台创建环境，拿到**完整 EnvId**（形如 `prod-xxxxxxxx`）。
> 本文件是部署前的规格；云函数代码在 `cloudfunctions/`，需在目标环境部署后才能调用。

## 身份与权限模型

- 微信身份由 `cloud.getWXContext().OPENID` 在云函数内可信获取，**前端不持有 openid，也不把 openid 作为授权依据**。
- 管理员名单在 `admin_users` 集合：`superadmin`（可转让、可管理 editor）与 `editor`。
- 所有写操作（猫咪增改归档、近况、管理员管理）必须在云函数内先 `checkAdmin` 校验角色，再校验字段；客户端调用只提交业务字段。
- 客户端初始化：`app.js` 调用 `wx.cloud.init({ env: EnvId })`；云函数内用 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })` 锁定当前环境。

## 集合与权限

| 集合 | 字段 | 客户端读 | 客户端写 | 说明 |
| --- | --- | --- | --- | --- |
| `cats` | name, aliases[], coatColor, gender, sterilizationStatus, sterilizedAt, personalityTags[], usualLocations[], healthNotes, latestNote, lifeStatus, isAdoptable, photos[], voice, published, createdAt, updatedAt, operatorOpenid | 公开（排除 operatorOpenid） | 否（仅云函数 admin SDK 写） | 档案主表；`published=false` 表示归档 |
| `cat_updates` | catId, content, createdAt, operatorOpenid | 公开 | 否 | 近况时间线 |
| `admin_users` | openid(唯一), role, realName, major, className, dorm, note, createdAt, createdBy | 否（仅管理员经云函数读） | 否（仅 super 经云函数写） | 管理员名单；realName/major/className/dorm/note 仅管理员间可见 |
| `admin_audit_logs` | operatorOpenid, action, target, detail, createdAt | 否（仅管理员经云函数读） | 否 | 审计日志 |

集合权限（CloudBase 安全规则，自定义）：
- `cats`：`read: true`（公开），`write: false`（客户端不可写；云函数 admin SDK 绕过规则写）。
- `cat_updates`：同 `cats`。
- `admin_users` / `admin_audit_logs`：`read: false`，`write: false`（一律经云函数，且函数内校验角色）。

索引建议：`cats.lifeStatus`、`cats.published`、`cats.name`（查询用）；`admin_users.openid`（唯一）。

## 云函数清单

| 函数 | 调用方 | 权限 | 行为 |
| --- | --- | --- | --- |
| `initAdmin` | 首次 setup | 仅当 `admin_users` 为空 | 把当前 openid 设为首位 superadmin，写入备注资料 |
| `checkAdmin` | 所有需鉴权页 | 公开 | 查 `admin_users`，返回 `{isAdmin, role, profile}` 或 `{isAdmin:false}` |
| `catList` | 首页（公开） | 公开 | 按 `lifeStatus` 查已发布档案，排除 operatorOpenid |
| `catDetail` | 详情（公开） | 公开 | 按 id 查，排除 operatorOpenid |
| `catManage` | 管理台 | admin | action: `create`/`update`/`archive`；校验字段、写 operatorOpenid、记审计 |
| `updateCreate` | 管理台 | admin | 向 `cat_updates` 追加时间线并更新 `latestNote`/`updatedAt` |
| `adminList` | 管理台 | super | 返回管理员名单（不含 openid 原文，仅管理员间可见备注） |
| `adminManage` | 管理台 | super | action: `add`/`remove`/`transfer`；校验后写 `admin_users` 并审计 |

## 字段校验（服务端，catManage 内）

- `name`：必填，1–20 字。
- `coatColor`：枚举（橘白/黑白/狸花/白/其他/未知）。
- `gender`：枚举（公/母/未知）。
- `sterilizationStatus`：枚举（已绝育/未绝育/未知）。
- `sterilizationStatus=已绝育` 时 `sterilizedAt` 建议填；非必填。
- `lifeStatus`：枚举（在校/毕业/休学/喵星）。
- `isAdoptable`：布尔；仅 `lifeStatus=在校` 时有意义。
- 文本做必要规范化；超长截断；内容安全交由微信内容安全（接入时补 `security.msgSecCheck`）。
- `createTime`/`updatedAt`/`operatorOpenid` 由服务端生成。

## 客户端连接（待 EnvId）

- `app.js`：`globalData.cloudEnv` 填完整 EnvId，`USE_CLOUD=true` 后启用 `wx.cloud.init`。
- `utils/service.js`：`USE_CLOUD` 开关；为 false 时返回本地模拟数据，为 true 时 `wx.cloud.callFunction`。
- 切换云端后需：部署 8 个云函数、在目标环境创建 4 个集合并设置上述权限/索引、上传首个 superadmin（`initAdmin`）。
