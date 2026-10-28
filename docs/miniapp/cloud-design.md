# 云端后台设计（CloudBase / 微信云开发）

> 依赖：用户需在云开发控制台创建环境，拿到**完整 EnvId**（形如 `prod-xxxxxxxx`）。
> 本文件是部署前的规格；云函数代码在 `cloudfunctions/`，需在目标环境部署后才能调用。

## 身份与权限模型

- 微信身份由 `cloud.getWXContext().OPENID` 在云函数内可信获取，**前端不持有 openid，也不把 openid 作为授权依据**。
- 管理员名单在 `admin_users` 集合：`superadmin`（可转让、可管理 editor）与 `editor`。
- 所有写操作（猫咪增改归档、近况、管理员管理）必须在云函数内先 `checkAdmin` 校验角色，再校验字段；客户端调用只提交业务字段。
- 所有**读**操作也必须经云函数：集合权限统一设为**私有（所有用户不可读写）**，杜绝客户端直接 `db.collection().get()` 读取原始文档、绕过云函数拿到 `operatorOpenid` 等敏感字段。云函数以环境管理员身份运行，自动绕过集合权限完成读写。
- 客户端初始化：`app.js` 调用 `wx.cloud.init({ env: EnvId })`；云函数内用 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })` 锁定当前环境。

## 集合与权限

| 集合 | 字段 | 客户端读 | 客户端写 | 说明 |
| --- | --- | --- | --- | --- |
| `cats` | name, aliases[], coatColor, gender, sterilizationStatus, sterilizedAt, personalityTags[], usualLocations[], healthNotes, latestNote, lifeStatus, isAdoptable, photos[](云存储地址，最多9张), voice(**仅 mp3/wav** 云存储地址), published, createdAt, updatedAt, operatorOpenid | **否（仅经云函数，函数内剔除 operatorOpenid 后返回）** | 否（仅云函数 admin SDK 写） | 档案主表；`published=false` 表示归档；**客户端不得直读，否则可绕过函数拿到 operatorOpenid** |
| `cat_updates` | catId, content, createdAt, operatorOpenid | **否（仅经云函数）** | 否 | 近况时间线 |
| `admin_users` | openid(唯一), role, realName, major, className, dorm, note, createdAt, createdBy | 否（仅管理员经云函数读） | 否（仅 super 经云函数写） | 管理员名单；realName/major/className/dorm/note 仅管理员间可见 |
| `admin_audit_logs` | operatorOpenid, action, target, detail, createdAt | 否（仅管理员经云函数读） | 否 | 审计日志 |
| `admin_applications` | openid, realName, major, className, dorm, note, status(pending/approved/rejected), createdAt | 否（仅 super 经云函数读） | 否（仅 adminApply 写、adminManage 改） | 管理员申请待审池；通过后写 `admin_users`(editor) 并标记 approved |
| `cat_submissions` | name, aliases[], coatColor, gender, sterilizationStatus, sterilizedAt, personalityTags[], usualLocations[], healthNotes, latestNote, lifeStatus, isAdoptable, photos[], voice, status(pending/approved/rejected), submitterOpenid, createdAt | **否** | 否（仅 catSubmit 写、submissionManage 读/改） | 游客投稿待审池；采纳后写入 `cats` 并标记 approved |

集合权限（CloudBase 安全规则）：六张表统一设为 **“所有用户不可读写”**（即 `read:false`、`write:false`）。
- 原因：所有数据访问都走云函数（catList/catDetail/checkAdmin/adminList 等），云函数以**环境管理员身份**运行，自动绕过集合权限规则完成读写；而客户端（含潜在恶意用户）因此**无法直接读取原始文档**，杜绝绕过云函数拿到 `operatorOpenid` 等敏感字段。
- `cats` / `cat_updates`：客户端读=否、写=否（仅云函数读/写，且函数内对返回结果剔除 `operatorOpenid`）。
- `admin_users` / `admin_audit_logs`：读=否、写=否（一律经云函数，且函数内校验角色）。

索引建议：`cats.lifeStatus`、`cats.published`、`cats.name`（查询用）；`admin_users.openid`（唯一）；`admin_applications.openid` 与 `admin_applications.status`（查重与列表用）。

## 云函数清单

| 函数 | 调用方 | 权限 | 行为 |
| --- | --- | --- | --- |
| `initAdmin` | 首次 setup | 仅当 `admin_users` 为空 | 把当前 openid 设为首位 superadmin，写入备注资料 |
| `checkAdmin` | 所有需鉴权页 | 公开 | 查 `admin_users`，返回 `{isAdmin, role, profile}` 或 `{isAdmin:false}` |
| `catList` | 首页（公开） | 公开 | 按 `lifeStatus` 查已发布档案，排除 operatorOpenid |
| `catDetail` | 详情（公开） | 公开 | 按 id 查，排除 operatorOpenid |
| `catManage` | 管理台 | admin | action: `create`/`update`/`archive`；校验字段、写 operatorOpenid、记审计 |
| `updateCreate` | 管理台 | admin | 向 `cat_updates` 追加时间线并更新 `latestNote`/`updatedAt` |
| `adminList` | 管理台 | super | 返回管理员名单（含 openid，供转让/撤权定位目标；服务端仍以调用者身份重校验，非 super 调用直接拒绝） |
| `adminManage` | 管理台 | super | action: `add`/`remove`/`transfer`/`listApply`/`approveApply`/`rejectApply`；校验后写 `admin_users` 并审计 |
| `adminApply` | 申请页 / 关于页（公开） | 公开 | action: `submit`（写入 `admin_applications`，openid 由云端 getWXContext 取）、`mine`（查自己待审申请）；任何人可申请，无需提供 openid；服务端独立校验必填项：姓名/专业/班级/宿舍 |
| `catSubmit` | 投稿页（公开） | 公开 | 游客提交猫咪资料，写入 `cat_submissions`（status=pending），不直发公开页 |
| `submissionManage` | 管理台 | admin | action: `list`/`approve`/`reject`；list 返回待审投稿，approve 将其转为 `cats` 并标记 approved，reject 标记 rejected |

## 字段校验（服务端，catManage 内）

- `name`：必填，1–20 字。
- `coatColor`：自由文本（≤20 字）；预设为 橘白/黑白/狸花/白/其他/未知，但允许管理员与投稿填写任意毛色描述。
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
- 切换云端后需：部署 11 个云函数、在目标环境创建 6 个集合并设置上述权限/索引、上传首个 superadmin（`initAdmin`）。
