# 云函数目录

V1.0 云函数（需在云开发控制台创建环境后部署；设计见 `docs/miniapp/cloud-design.md`）：

| 函数 | 权限 | 作用 |
| --- | --- | --- |
| `initAdmin` | 仅首次 | 把当前 openid 设为首位超级管理员 |
| `checkAdmin` | 公开 | 校验管理员身份，返回角色与可见备注 |
| `catList` | 公开 | 按状态取已发布档案 |
| `catDetail` | 公开 | 按 id 取档案 + 近况时间线 |
| `catManage` | admin | 新增 / 更新 / 归档（服务端校验字段与角色） |
| `updateCreate` | admin | 追加近况时间线 |
| `adminList` | super | 管理员名单 |
| `adminManage` | super | 增删 / 转让管理员 |

部署前还需在目标环境创建集合 `cats` / `cat_updates` / `admin_users` / `admin_audit_logs` 并设置权限与索引（见 cloud-design.md）。

客户端通过 `miniprogram/utils/service.js` 调用；`USE_CLOUD=false` 时返回本地模拟数据，便于无云端时预览 UI。
