# 校园猫咪档案馆 · 设计系统（V1.0）

> 本文件记录已选定的 UI 方向、设计 token、组件映射与 WXML/WXSS 可落地检查。
> 来源优先级：微信官方小程序设计指南 > 项目已有资产 > TDesign MiniProgram > 其他。
> **HTML 原型仅用于确认视觉与流程，不是最终小程序；最终以微信开发者工具与安卓/iPhone 真机为准。**

## 1. 方案来源与选型
- **选定方向**：B · 品牌定制（蓝底 + 卡片化 + 分段状态标签），参考用户提供的「北大猫咪图鉴」信息架构。
- **主组件库**：TDesign MiniProgram（一个项目只选一个主组件库，设计阶段仅记录选型，开发阶段再安装）。
  - 来源：https://tdesign.tencent.com/miniprogram/overview
  - 版本 / 许可证：实现前在官网复核最新版本与开源许可证。
- **参考 UI**：用户提供的其他学校猫咪图鉴截图（结构参考：搜索 + 在校/毕业/休学/喵星 四标签 + 圆头像列表 + 查猫/关于 底栏）。

## 2. 画布与硬约束
- 画布基准：**375px** 竖屏（全项目统一）。
- 微信胶囊：预览固定显示；开发时用 `wx.getMenuButtonBoundingClientRect()` 动态计算避让，不硬编码真机位置。
- 顶部导航：标题居中、避让胶囊；自定义导航需说明返回路径与状态栏适配（本方案用原生导航）。
- 触控区域：关键按钮/列表操作 ≥ 88rpx（HTML 预览 ≥ 44px）。
- 底部安全区：固定底栏使用 `env(safe-area-inset-bottom)`，并在安卓/iPhone 真机检查。
- tabBar 图标：使用**项目内本地 PNG**（`iconPath` / `selectedIconPath`），不使用网络图、SVG、iconfont、emoji。
- 字体：使用微信运行环境系统字体；不依赖远程字体。

## 3. 设计 Token
| 类别 | 取值 | 说明 |
| --- | --- | --- |
| 主色 primary | `#2F6FDB` | 蓝；按钮、选中态、链接、徽标底色以外的主要强调 |
| 背景 bg | `#E9F1FC` | 浅蓝页面底 |
| 卡片 card | `#FFFFFF` | 列表/表单卡片 |
| 搜索框 field | `#FFFFFF` | 圆角白底 |
| 主文字 fg | `#182A44` | 标题、名字 |
| 次文字 sub | `#97A0AA` | 副信息、时间 |
| 分割线 line | `#EEF3FB` | 卡片内细分隔 |
| tabBar 底 | `#FFFFFF` | 边框 `#DCE7F7` |
| 标签底 tagBg | `#EAF1FD` | 标签文字 `#2F6FDB` |
| 待领养红 | `#FF4D4F` | 待领养徽标底色，白字 |
| 状态色 | 在校 `#2F6FDB`、毕业 `#52C41A`、休学 `#FAAD14`、喵星 `#8C8C8C` | 详情/徽标用，仅作语义色 |
| 字号 | 导航 17 / 名字 16 / 正文 14 / 副 12 / 底栏 11 | 系统字体 |
| 圆角 | 卡片 18 / 搜索 12 / 标签 10 / 头像 50(圆) | — |
| 间距 | 卡片内 padding 16，列表间距 12，页边 16 | — |
| 按下态 | `opacity: .85` 或 TDesign 自带 | — |

## 4. 主组件库与关键组件映射（WXML/WXSS 可落地表）
| 原型元素 | 小程序实现 | 组件来源 | 风险或降级 |
| --- | --- | --- | --- |
| 主按钮（保存/新增） | `t-button` / `button` | TDesign | 加载、禁用、按下态需验证 |
| 页面卡片 | `view` + WXSS | 原生/TDesign | 阴影/圆角在安卓真机检查，必要时降为 1px 描边 |
| 底部导航 | 原生 `tabBar` | app.json | 本地 PNG、选中态、安全区 |
| 顶部导航 | 原生导航栏 | 微信平台 | 胶囊动态避让 |
| 状态分段标签 | `view` + WXSS 或 `t-tabs` | TDesign | 选中填充态、四标签等分 |
| 头像列表项 | `view` + `image` | 原生 | 圆形裁剪；真实照片，占位图仅测试 |
| 待领养徽标 | `view` 红底白字 | 原生 | 仅 `isAdoptable=true` 且 在校 时显示 |
| 搜索框 | `t-search` / `view` | TDesign | 猫头图标用 TDesign 图标或本地 PNG |
| 表单 | `t-input`/`t-cell`/`t-radio`/`t-switch` | TDesign | 中文标签、必填/选填区分 |
| 时间线 | `view` 列表 | 原生 | 倒序、时间未确认显示「时间未确认」 |

## 5. tabBar 本地图标清单（真实构建时准备）
- `查猫`：`tab-cat.png` / `tab-cat-active.png`
- `关于`：`tab-about.png` / `tab-about-active.png`
- 规格：建议 81×81 px @2x / 108×108 @3x，透明底 PNG。

## 6. HTML 专用效果与降级
- 原型中猫头搜索图标用内联 SVG 仅作预览；真机用 TDesign 图标或本地 PNG。
- B 方向的卡片阴影在低版本安卓可能偏弱，真机验证；不可行则降级为浅描边。
- 头像圆形、徽标圆角、分段标签填充均可用 WXSS 实现，无特殊依赖。

## 7. 数据字段补充（相对项目书 5.1）
- 新增 `lifeStatus`：`onCampus`(在校) / `adopted`(毕业) / `missing`(休学) / `deceased`(喵星)。
- 新增 `gender`：公 / 母 / 未知。
- 新增 `sterilizedAt`：绝育时间（日期或空）。
- 新增 `isAdoptable`：布尔，仅 在校 时可有意义的「待领养」徽标。
- 保留项目书其余字段（name/aliases/coatColor/personalityTags/sterilizationStatus/healthNotes/usualLocations/latestNote/lastSeenAt/lastSeenLocation/recordStatus/审计字段等）。

## 8. 隐私（重申）
- `admin_users` 的 realName/major/className/dorm/note：仅管理员（superadmin + editor）之间可见，公开读取接口不返回。

## 9. 未验证项
- TDesign MiniProgram 当前版本号、许可证、与基础库最低版本兼容性（实现前复核）。
- 卡片阴影在低端安卓真机的实际表现。
- 个人主体下「校园猫咪档案」可归属的服务类目（上线前在公众平台逐项核验）。
