# 应用代码导航

## 3D 模型项目审核工具

### 实施方案

- [完整实施计划-V1.0](实施方案/完整实施计划-V1.0.md)：产品边界、技术路线、阶段任务与验收条件。
- [多模型审核工具化实施计划-V1.0](实施方案/多模型审核工具化实施计划-V1.0.md)：多 GLB 项目包、开发者端、审核端和分阶段交付方案。
- [UIUX重构实施计划-V1.0](实施方案/UIUX重构实施计划-V1.0.md)：双端 UIUX 骨架重构——Design Token、shared-ui.css 共享样式层、共享渲染组件、视口常驻骨架与四阶段执行步骤。
- [审核填写流与结论强化-实施计划-V1.0](实施方案/审核填写流与结论强化-实施计划-V1.0.md)：审核端右栏写读分离、三态分段按钮、视口/列表结论徽章、建议结论与 toast 撤销——P0～P2 交付与验收。
- [审核端导出已审HTML-实施计划-V1.0](实施方案/审核端导出已审HTML-实施计划-V1.0.md)：先交付 B——审核端重序列化导出「已审 HTML」供开发双击过缺陷；保留 JSON 契约；A（开发端导入 JSON）预留不实现。
- [审核端拖放文件夹加载-实施计划-V1.0](实施方案/审核端拖放文件夹加载-实施计划-V1.0.md)：ZIP 包打开 HTML 后拖入解压根目录一次授权；复用 `loadDirectory`；保留按钮回退；不实现页内解压 zip。
- [审核端导出已审ZIP-实施计划-V1.0](实施方案/审核端导出已审ZIP-实施计划-V1.0.md)：审核端新增「导出已审 ZIP」（壳+JSON+外置 GLB）；folder 隐藏已审 HTML；inline 仍可单 HTML。
- [审核端功能引导-实施计划-V1.0](实施方案/审核端功能引导-实施计划-V1.0.md)：首次聚光灯导览 7 步（拖包→选模型→模型层级→视口底部工具（G）→记问题→定结论→导出已审 ZIP）、四边挖洞高亮、「?」重播；P1 说明抽屉。**2026-09-11 调整：去掉「看过/跳过一次不再弹」的 localStorage 门禁，每次打开页面都自动完整播放一遍；完整 9 步仅 file:// 或 `__AN_ONB_FULL__`，http/https 从「选课程」开始。**
- [审核端功能引导可用性细化-实施计划-V1.1](实施方案/审核端功能引导可用性细化-实施计划-V1.1.md)：导览主按钮改「下一步/完成」；步骤目标先 scrollIntoView 再量高亮，防侧栏裁切（已实现）。
- [按钮文字居中修复-实施计划-V1.0](实施方案/按钮文字居中修复-实施计划-V1.0.md)：共享层 `.button`/`.icon-button` flex 居中；收敛 only-sm 对按钮 display 的覆盖；修移动端「更多」偏顶。
- [开发端云端持久化与审核包在线托管-实施计划-V1.0](实施方案/开发端云端持久化与审核包在线托管-实施计划-V1.0.md)：草稿升级云端长期项目（GLB hash 去重、本地双写防抖同步、旧草稿自动迁移）+ 审核包一键上传生成在线预览链接；Python 零依赖资源服务 + Nginx 反代，P0 服务端 / P1 云同步 / P2 一键上传。
- [云端模型库缩略图网格与文件夹树分类-实施计划-V1.0](实施方案/云端模型库缩略图网格与文件夹树分类-实施计划-V1.0.md)：库面板文本列表 → 缩略图网格（前端离屏渲染 + IndexedDB 按 hash 缓存）+ 密度切换；「按文件夹导入」携带 `X-ModelQA-Path`，服务端 `paths[]` 合并写回，前端推导两级文件夹树与状态筛选——P0 缩略图 / P1 树分类。V1.1 分类规则重构为项目制（`projects[]` 引用随 PUT/DELETE 维护）。
- [开发端顶栏精简-实施计划-V1.0](实施方案/开发端顶栏精简-实施计划-V1.0.md)：移除顶栏「导出审核包」快捷按钮（右栏导出区保留）与标题旁副标题（审核端同名结构与共享样式不动）。

### 原型

- [开发者工具-第一版验证](原型/开发者工具-第一版验证.html)：用于确认开发者端工作流、固定模板风格和审核包交付方式的交互原型。
- [审核页面-视觉预览](原型/审核页面-视觉预览.html)：审核端三栏工作台视觉基线。

### PoC

- [PoC 说明](PoC/README.md)：阶段 1 单 GLB 离线闭环边界与运行方式。
- [PoC 生成器](PoC/模型审核-PoC-生成器.html)：单 GLB 导入、层级选择、Issue 与结果 HTML 导出。
- [阶段 1 PoC 验收报告](PoC/阶段1-PoC验收报告.md)：已验证、待验证和阻断风险记录。

### 工具化

- [Three.js 工具化说明](工具化/README.md)：开发者编辑端、离线审核端、审核包格式、运行方式与验收边界。

### 源码（tool/src）

- [开发者编辑端入口](../tool/src/editor/main.js)：正式入口；委托给 `main-implementation.js`，负责课程选择前置、模型归类/拖放/删除、模型审核要求、问题定位和审核包重新序列化。
- [开发者编辑端实现](../tool/src/editor/main-implementation.js)：课程-模型状态、Three.js 查看、节点引用、跨课程移动、删除清理、单 HTML/ZIP 导出；多槽项目（防抖自动保存、启动恢复、新建/切换/另存/重命名/复制/删除，上限 50 条，旧 key 迁移）；**云端双写**（本地优先 + 防抖推云端、启动对账补拉/推送、项目双删、导入 GLB 即上传并记 `{hash,url,size}` 引用、恢复时从云端自动拉回模型、同步状态圆点与列表徽标）。
- [云端通信层](../tool/src/editor/cloud-sync.js)：开发端唯一 fetch 出口（listProjects / loadProject / saveProject / deleteProject / uploadModel / listModels / fetchModel / uploadReviewPackage / listReviews / deleteReview）；Token/基址经 vite define 注入（`tool/.env.local`，模板 `.env.example`），dev 走 vite proxy 同域转发。
- **云端模型库（在 `main-implementation.js`）**：「导入到 <课程>」菜单两路（本机 / 云端库）；模型库 modal（`openModelLibrary`/`renderLibraryList` 按文件名过滤、`importFromLibrary` fetch 后直记引用不再上传）；服务端配套 `GET /api/models/list` + `X-Model-Filename` 元数据（`G:\项目\服务器部署\modelqa-data-server.py`）。冒烟：`tool/scripts/smoke/smoke-model-library.py`。
- **审核包一键上传（P2，在 `main-implementation.js`）**：导出单 HTML 后 toast「上传到服务器」→ 在线预览链接 + 「复制链接」（含 execCommand 降级）；导出区「上传在线预览」重传最近产物（`an-review-last-package` 记文件名，产物内容仅存内存）；toast 组件与样式在 `styles.css`。冒烟：`tool/scripts/smoke/smoke-export-upload.py`。
- **在线预览链接管理与审核回传（P3）**：开发端「预览链接管理」面板（未审核/已审核页签，按服务端 `GET /api/reviews/list` 的 `reviewed` 字段过滤；打开/复制/删除，删除行内二次确认，软删除入 `reviews/_archive/`）；审核端「回传审核结果」按钮（`submitReviewed`，仅在线托管且 payload 含 `submitToken` 时显示，POST `/api/reviews/submit` → 服务端落盘 `<原名>-已审.html`）；回传 Token 经 `VITE_CLOUD_SUBMIT_TOKEN` 打包注入 payload，与服务端 `server-config.json.submitToken` 同值。计划见 [在线预览链接管理与审核回传-实施计划-V1.1](实施方案/在线预览链接管理与审核回传-实施计划-V1.1.md)。冒烟：`tool/scripts/smoke/smoke-review-links.py`。
- [开发者端工作台样式](../tool/src/editor/styles.css)：仅保留开发端独有样式——项目设置 Drawer、3D 视口容器、课程条导入按钮、拖放移动与悬停显现的行内删除、多槽项目列表下拉、云端同步状态圆点与列表同步徽标等端差异。
- [审核者离线入口](../tool/src/reviewer/reviewer-entry.js)：正式运行时入口；委托给 `reviewer-implementation.js`，负责课程树、模型独立审核、模型/零件 Issue、问题定位描边和审核结果导出。
- [审核者离线实现](../tool/src/reviewer/reviewer-implementation.js)：自包含审核端；骨架/课程条/层级树使用共享类名与共享渲染函数，启动时注入 `__AN_SHARED_CSS__` 共享样式与审核端独有样式（Issue 卡片、审核状态色、模型行状态圆点、文件夹拖放空态、移动端更多菜单）。导出侧主按钮「导出已审 ZIP」（壳 + JSON + 外置 GLB，fflate）、「导出已审 HTML」（仅 inline，folder 隐藏）与「JSON」；ZIP 可用性见 `canExportReviewedZip`。ZIP 包打开后可将含 `project.json` 的解压根目录拖入 stage，经 `collectDropFiles` → `loadDirectory` 一次授权加载。手机竖屏：顶栏精简 + 「更多」菜单 + 底部 `层级/审核` 抽屉；点选 `pointerup` + 8px 阈值。顶栏「?」触发功能引导重播；启动时经 `initReviewerOnboarding` 每次自动弹出。Chromium 优先 `showDirectoryPicker` 并记住目录 handle。
- [审核端目录 Handle 记忆](../tool/src/reviewer/reviewer-fs-handle.js)：File System Access + IndexedDB（`an-reviewer-fs` / `lastPackageDir`）；`showDirectoryPicker({ startIn: 'downloads' })`、递归收集文件、启动恢复与「打开上次文件夹/忘记」；`file://` 无 IDB 时降级为 localStorage 只记文件夹名。
- [审核端功能引导](../tool/src/reviewer/reviewer-onboarding.js)：聚光灯 **9 步**（拖包→选课程→选模型→模型层级→双击聚焦→看视口→记问题→定结论→导出 ZIP）、四边挖洞/描边高亮、第 1 步导入门禁、一句动作+一句 tip 极简文案、跳过引导/ESC、`prefers-reduced-motion`；**每次启动均自动弹出**（不读完成态）；完成/跳过仅关闭本轮；顶栏「?」可重播；第 1 步徽标旁挂「加载审核包」问号热点（`LOAD_PACKAGE_TOPIC`，z-index 1002）；零外部 npm 依赖，随审核 runtime 打入离线包。计划见 [审核端功能引导-实施计划-V1.0](实施方案/审核端功能引导-实施计划-V1.0.md)。

### 共享层（tool/src/shared）

- [双端共享样式层](../tool/src/shared/shared-ui.css)：Design Token（亮/暗双主题）、骨架（顶栏含标题旁选课副标题/课程条卡片带/三栏工作区/底栏含右侧 UI 版本号/滚动条）与通用组件（按钮/面板卡片/表单/课程卡片/左栏课程模型列表/层级树/空态/动效）的唯一来源；开发端直接 import，审核端由构建脚本注入。含审核端手机断点（≤900 单栏抽屉；≤400 超窄压缩；矮屏/横屏高度轨；桌面矮窗限制 `min-width:901`）。UI 版本源为 `tool/package.json`（当前 v1.2.0），经 Vite `define` / `build-reviewer.mjs` 注入 `__APP_VERSION__`。
- [双端共享渲染组件](../tool/src/shared/shared-components.js)：`renderCourseRail`（课程卡片带，选课状态显示在顶栏标题旁副标题）、`renderCourseModelList`（左栏当前课程模型列表，约 3 行内滚）、`renderTree`（模型层级树）、`emptyState`（统一空态模板）等纯 DOM 渲染函数；徽章文案、回调与拖放钩子经 options 注入，无外部依赖，可被 esbuild 打进审核运行时。
- [双端共享三维视口](../tool/src/shared/shared-viewer.js)：Three.js 场景/相机/OrbitControls/后处理描边、零件聚焦（非选中半透明）、`isInIsolated` 命中判断、线框与主题令牌；开发端与审核端共用。
- [功能热点弹层](../tool/src/shared/shared-help-hotspot.js)：可多实例的 `?` 热点（`instanceId` / `zIndex`）。内置两套 topic：「聚焦零件」挂「模型层级」标题右侧；「加载审核包」挂引导第 1 步卡片步进旁。hover/focus/click 弹出 GIF 说明（单图，无分帧）；图源为 `tool/src/generated/help-focus-frames.js`（`HELP_FRAMES` data URL 内嵌），源 GIF 在 `tool/public/help/focus-part/`，嵌入脚本 `tool/scripts/build/embed-focus-help.mjs`（目录内全部 `.gif`）。

### 资源与构建

- [Brown Photo Studio HDRI](../tool/public/hdri/brown_photostudio_02_2k.hdr)：Poly Haven `brown_photostudio_02` 环境资源（文件名保留历史 2k，内容已降采样为 384×192 旧格式 RGBE，约 288 KB），供开发端与离线审核端使用。降采样脚本见 `tool/scripts/build/downsample-hdr.py`。
- [审核运行时构建脚本](../tool/scripts/build/build-reviewer.mjs)：把审核端依赖、共享样式层（`shared-ui.css` → `__AN_SHARED_CSS__`）、Brown Photo Studio HDR 数据，以及可再拼壳的 runtime IIFE 源串（`__AN_REVIEWER_RUNTIME_SRC__`）打入固定离线运行时模板，供审核端导出已审 HTML。
- [审核端本地预览页](../tool/public/reviewer-preview.html)：内置样例审核包（示例 GLB + 预置 Issue）的本地预览入口，经 Vite 开发服务器 `/reviewer-preview.html` 访问；仅供预览，不入审核包。
- [开发者编辑端启动脚本](../tool/启动开发者编辑端.cmd)：Windows 双击启动 Vite 本地服务器并自动打开浏览器。

### 冒烟脚本

- [审核端手机竖屏冒烟](../tool/scripts/smoke/smoke-mobile.py)：多视口矩阵（320/360/390/430/横屏/桌面）校验无横向溢出、进度短文案、课程条压缩、抽屉与 tabs 高度。
- [审核端桌面回归冒烟](../tool/scripts/smoke/smoke-mobile-desktop-regression.py)：1440×900 确认三栏、导出按钮文案与 hide-sm/only-sm 未破坏桌面。
