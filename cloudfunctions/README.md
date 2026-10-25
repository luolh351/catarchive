# 云函数目录（待创建）

V1.0 的云函数将在环境准备完成后在此目录创建，至少包括：
- `initAdmin`：受控初始化首位 superadmin
- `checkAdmin`：校验当前 openid 是否在管理员白名单，返回角色
- `catCreate` / `catUpdate` / `catArchive`：猫咪档案的增改归档（服务端校验角色与字段）
- `updateCreate`：新增近况时间线
- `adminList` / `adminAdd` / `adminRemove` / `adminTransfer`：管理员名单管理（super 专属）

集合不会因 db.collection().add() 自动创建，需先在目标环境创建并设置权限。
