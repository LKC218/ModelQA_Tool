# UIUX 重构实施计划 V1.0

> 本文档自包含，新会话可直接按此执行，无需其他讨论上下文。
> 执行前请先阅读 `docs/工具化/README.md` 与 `docs/apps-code-map.md` 了解项目背景。

## 1. 项目背景（一段话）

ModelQA Tool 是面向 3D 课程模型的双端离线审核工具：

- **开发者编辑端**（`tool/src/editor/main-implementation.js`，入口壳 `main.js`）：导入 GLB、课程归类/拖放/删除、配置审核要求、绑定零件 `persistentNodeId`、导出审核包（单 HTML ≤20MB / ZIP）。
- **审核者离线端**（`tool/src/reviewer/reviewer-implementation.js`，入口壳 `reviewer-entry.js`）：由 `tool/scripts/build/build-reviewer.mjs` 用 esbuild 打包为 IIFE 内联运行时（`tool/src/generated/reviewer-runtime.js`，构建产物，不入库），开发端通过 `?raw` 引入并在导出时拼进 HTML。审核端加载审核包 → 逐模型记录模型级/零件级 Issue（`review.byModel[modelId]`）→ 导出审核结果 JSON。
- 技术栈：Vite 7 + Three.js 0.180，**零框架**，UI 用 DOM 字符串模板 + 事件绑定。审核端 CSS 以字符串内嵌在实现文件里，与开发端 `tool/src/editor/styles.css` 靠人工保持一致（现状痛点）。
- 约束（不可破坏）：双端产物**离线自包含**（审核包不依赖 CDN/外部文件）；不引入任何前端框架/运行时依赖；保持全部现有功能与数据格式（`schemaVersion: 2`、`review.byModel`）不变。

## 2. 目标与非目标

**目标**：

1. 重构整体 UIUX 骨架：更直观、更美观，形成"工作台"式统一观感。
2. 双端 UIUX 结构性一致：骨架与组件同源代码，一致性靠构建保证，不靠人工同步。
3. 消灭双端 CSS 重复维护（现状：审核端内嵌 CSS 字符串需整段对照 `styles.css` 手工改写）。

**非目标**：

- 不改任何业务逻辑（导入/导出/节点定位/Issue 存储/草稿等行为不变）。
- 不引入框架、构建工具不变（仍 Vite + esbuild）。
- 不做移动端适配（保持 PC 优先，仅保证现有断点不劣化）。

## 3. 核心设计决策

### 3.1 三层一致性模型

| 层 | 内容 | 策略 |
|---|---|---|
| 骨架层 | 顶栏 + 课程条 + 三栏布局 + 3D 视口 + HUD/工具条 | 双端完全一致，同源代码 |
| 组件层 | 按钮/面板/课程卡片/层级树/表单/空态/徽章 | 双端完全一致，同源代码 |
| 内容层 | 左栏列表行为、右栏面板内容 | 各端定制，只准填内容，不准改共享样式 |

### 3.2 一致性机制（结构性保证，非约定）

1. **新建 `tool/src/shared/shared-ui.css`**：Design Token + 骨架 + 全部通用组件样式，只此一份。
   - 开发端：`main-implementation.js` 直接 `import './shared-ui.css'`。
   - 审核端：`build-reviewer.mjs` 构建时读取该文件内容，以 `<style>` 注入运行时（参考现有 HDR 的 `globalThis.__AN_HDR_SOURCE__` 注入手法，可新增 `globalThis.__AN_SHARED_CSS__`，在 `reviewer-implementation.js` 开头 append 到 `document.head`）。
   - 审核端原内嵌的 `css` / `responsiveCss` 字符串删除，仅保留审核端**独有**的少量样式（issue 卡片、状态色等），同样迁移进 shared 或独立小段。
2. **共享渲染函数**：新建 `tool/src/shared/shared-components.js`（纯函数模块，无副作用），至少包含：
   - `renderCourseRail(options)`：顶部课程卡片条 + 左右滚动按钮 + 模型快速导航浮层（搜索/切换/删除，开发端多删除按钮、审核端徽章为"已审核/总数"）。用 options 注入差异回调（`onSelectCourse`、`onOpenModel`、`onDeleteModel` 等）与数据适配。
   - `renderTree(container, scene, options)`：模型层级树（缩进连线、mesh/group/Empty 图标、选中态、Empty 徽标）。
   - `renderPanelShell()` / `emptyState(icon, title, hint)`：面板骨架与统一空态模板。
   - 注意：该模块会被 esbuild 打进审核运行时，**不得** import DOM 之外的重依赖，保持纯 DOM 操作。
3. **类名规范**：共享组件类名统一（可保留现有 `course-rail` / `tree-node` 等命名），双端差异只用 modifier 类 `.is-editor` / `.is-reviewer`，**禁止**再出现整段复制后加 `review-` 前缀的模式。
4. **允许的端差异清单**（写死，发现清单外差异应下沉到共享层）：
   - 开发端独有：课程管理入口、拖放移动模型、导入按钮、审核包导出、项目设置。
   - 审核端独有：Issue 表单、审核状态色（pass/risk/block）、审核结果导出。

### 3.3 Design Token（写入 `shared-ui.css` `:root`）

```css
:root{
  /* 色板：延续现有暗色 + 琥珀主色基因 */
  --bg:#080909; --bg-raise:#0d0f0f;
  --panel:#171a1a; --card:#252a29; --card-hover:#1e2221;
  --line:#3a423f; --line-soft:rgba(255,255,255,.08);
  --text:#f3f5ef; --muted:#b7c0b8; --dim:#89938b;
  --accent:#f3b44e; --accent-soft:rgba(243,180,78,.13); --accent-line:rgba(243,180,78,.45);
  --success:#69d6ad; --danger:#ff6b5f;
  /* 几何 */
  --radius:10px; --radius-sm:6px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px;
  --font-ui:"Microsoft YaHei UI","Segoe UI",sans-serif;
  --ease-out:cubic-bezier(.16,1,.3,1);
  /* 动效：只用 opacity/transform，prefers-reduced-motion 降级 */
}
```

规则：全站禁用组件级硬编码色值（Token 之外的颜色一律进 Token 或作为 Token 的 alpha 变体）；间距只用 8pt 栅格档位。

### 3.4 目标骨架（双端同构）

```
┌──────────────────────────────────────────────────────┐
│ 顶栏 64px：项目标题 | 操作按钮（右对齐）                 │
├──────────────────────────────────────────────────────┤
│ 课程条 88px：「选课」标签 + ‹ 卡片横向滚动带 › + 弹出导航  │
├──────────┬───────────────────────────┬───────────────┤
│ 左栏      │ 3D 视口（常驻，占满）        │ 右栏 340~360px │
│ 280px    │ · 左上 HUD：模型名/进度      │ 面板卡片堆叠    │
│ 模型列表  │ · 右下浮动工具条：适配/线框   │ （各端内容）    │
│ +层级树   │ · 开发端：项目设置=滑出 Drawer│               │
└──────────┴───────────────────────────┴───────────────┘
│ 底栏 36px：状态/草稿信息                                │
```

骨架关键变化（相对现状）：

1. **3D 视口常驻**：删除开发端"配置视图 / 查看器视图"整块切换；项目设置（项目标题/编号/名称/版本、课程编辑器）改为右侧滑出 Drawer（或浮层面板），不占主工作区。审核端本就视口常驻，向此骨架对齐。
2. **课程条独立成行**：双端统一为顶栏下方的"选课"行（现状开发端已有 `course-rail`，审核端已有 `review-course-rail`，两者 DOM/CSS 合并为共享组件）。
3. **左栏 = 模型列表 + 层级树**，右栏 = 面板卡片堆叠；卡片化面板：`--radius` 圆角、细边框、统一 8pt 内边距，减少边框密度、用留白与背景深浅分层。
4. **状态前置**：课程卡片徽章（开发端=模型数，审核端=已审核/总数）、模型行加审核状态小圆点（审核端：pending/pass/risk/block 四色）。
5. **操作收拢**：删除等破坏性操作用行尾图标 + 悬停显现，替代常驻按钮。
6. **空态统一**：`emptyState()` 模板（图标 + 标题 + 提示 + 可选主操作按钮），双端所有空区域复用。

## 4. 分阶段任务与验收

> 原则：每步完成后双端均可运行、功能不回退，再进入下一步。每步结束运行 `cd tool && npm run build` 确认构建通过，并手工冒烟核心流程。

### 阶段 1：Design Token + shared-ui.css（消灭 CSS 双份维护）

任务：

1. 新建 `tool/src/shared/shared-ui.css`，内容 = Design Token + 骨架（topbar/course-rail/workspace 三栏/stage/footer/scrollbar）+ 通用组件（button/panel/course-card/course-menu/tree-node/field/empty-state/transition + `prefers-reduced-motion` 降级）。
2. `main-implementation.js` 引入 `shared-ui.css`；`styles.css` 仅保留开发端独有样式（如 Drawer、拖放态），能迁尽迁，目标是最终只剩极少量。
3. `build-reviewer.mjs`：读取 `shared-ui.css`，以 `globalThis.__AN_SHARED_CSS__`（或直接拼字符串）注入运行时；`reviewer-implementation.js` 删除内嵌 `css`/`responsiveCss` 大段字符串，改为启动时注入共享 CSS + 审核端独有小段（issue 卡片、状态色）。
4. 更新 `docs/apps-code-map.md` 与工具化 README 中的样式条目。

验收：

- 全仓库搜索不到成对的重复课程条/树样式段。
- 双端视觉与现状等价（允许细节更精致），所有现有交互态（hover/active/selected/disabled）不丢。
- `npm run build` 通过；导出的单 HTML 审核器离线打开样式完整。

### 阶段 2：骨架改版（视口常驻 + 课程条入共享层）

任务：

1. 开发端删除配置/查看器视图切换，3D 视口常驻；项目设置 + 课程编辑器迁入右侧滑出 Drawer（Esc/点击遮罩关闭）。
2. 双端顶栏 + 课程条按 3.4 骨架重排；课程条 DOM 结构双端统一。
3. 右栏改为面板卡片堆叠，统一面板样式。
4. ResizeObserver/resize 逻辑适配视口常驻后的尺寸变化（开发端视口从"切换显示"变为"常驻"，注意初次渲染尺寸为 0 的坑）。

验收：

- 开发端：进入页面即见 3D 视口；项目设置可从 Drawer 打开/关闭，编辑后保存草稿功能不变。
- 双端布局像素级同构（除右栏内容与端差异清单项）。
- 课程选择前置逻辑不变：未选课程不能导入（开发端）。

### 阶段 3：组件化抽取（共享渲染函数）

任务：

1. 新建 `tool/src/shared/shared-components.js`，抽取 `renderCourseRail` / `renderTree` / `emptyState`（签名见 3.2）。
2. 开发端 `refreshCourseRail` + `refreshModelsBase` 中课程卡片部分、`appendTreeNode`/`refreshTree` 改为调用共享函数，差异通过 options 传入。
3. 审核端 `renderReviewCourseRail`、`appendTreeNode`/`renderTree` 同样改造。
4. 删除两端的重复实现；`main.js` / `reviewer-entry.js` 注释壳维持现状（或顺手清理 main.js 中旧版注释实现，见第 5 节）。
5. 顺手处理审核端 `MutationObserver` 监听 `#models` 触发课程条重渲染的隐式耦合：改为在 `renderModels()` 内显式调用课程条渲染后移除 observer。

验收：

- 双端课程条/层级树行为与阶段 2 结束时一致（回归：选课、展开导航、搜索、拖放移动、删除确认、树选中双向同步、面包屑）。
- `reviewer-implementation.js` 中不再存在与开发端重复的课程条/树渲染代码。
- 审核运行时体积无明显增长（esbuild minify 后对比记录）。

### 阶段 4：直观性收尾

任务：

1. 课程卡片徽章：开发端=模型数，审核端=`已审核/总数`（现有逻辑迁入共享组件 options）。
2. 审核端模型行加审核状态圆点（pending 灰 / pass 绿 / risk 琥珀 / block 红），数据源 `review.byModel[modelId].modelStatus`。
3. 行尾危险操作（删除模型）改悬停显现图标；确认弹窗逻辑不变。
4. 全部空区域换用统一空态模板；按钮/卡片/树节点动效复查（仅 opacity/transform，reduced-motion 降级）。
5. 更新文档：`docs/apps-code-map.md`、工具化 README（新增"双端共享 UI 层"章节，写明 3.1 三层模型与允许差异清单）。

验收：

- 审核进度一屏可见（徽章 + 圆点）。
- 全流程冒烟：开发端导入→归类→配置→导出单 HTML 与 ZIP→审核端打开→逐模型审核→定位零件→导出结果 JSON，全通过。

## 5. 顺手清理项（低风险，随阶段 3 处理）

- `tool/src/editor/main.js` 中整段注释的旧版实现（约 50 行超长注释）删除，文件仅保留 `import './main-implementation.js'`。
- `docs/apps-code-map.md` 第 19 行"Penguin Museum HDR"笔误 → 改为 "Brown Photo Studio HDR"（与实际文件 `brown_photostudio_02` 一致）。
- `main-implementation.js:213` 文件末尾捕获阶段拦截器与 `refreshModelsBase` 内的 `data-course-toggle` onclick 是两套重叠的点击处理，阶段 3 组件化时统一为一条路径。

## 6. 风险与注意

1. **审核运行时注入顺序**：共享 CSS 注入必须发生在 `reviewer-implementation.js` 首个 `document.head.append` 之前；注意审核端当前有三段 `<style>` 注入，全部收敛为一处。
2. **视口常驻后的尺寸初始化**：开发端 canvas 尺寸从"切换时可见"变为"页面加载即可见"，检查 `ResizeObserver` 首帧与 `fit()` 调用时机。
3. **`?raw` 体积**：共享 CSS + 组件代码进入审核运行时会增大导出 HTML 基线体积，阶段 3 结束记录 minify 后体积对比，预期增幅 < 30KB。
4. **不要动数据结构**：`payload`（`schemaVersion: 2`、`base64Chunks`、`review.byModel`）与 ZIP 目录结构（`审核器.html`/`project.json`/`models/`/`review/issues.json`）保持不变。
5. **每个阶段独立提交**（当前工作区已有约 654 行未提交改动，执行前先与用户确认这批改动如何处理——先行提交或纳入重构基准）。

## 7. 相关文件地图

| 文件 | 角色 | 本计划影响 |
|---|---|---|
| `tool/src/shared/shared-ui.css` | （新建）Token + 骨架 + 组件样式 | 阶段 1 创建，1-4 阶段演进 |
| `tool/src/shared/shared-components.js` | （新建）共享渲染函数 | 阶段 3 |
| `tool/src/editor/styles.css` | 开发端现有样式（785 行） | 阶段 1 大幅瘦身 |
| `tool/src/editor/main-implementation.js` | 开发端实现 | 阶段 2/3/4 |
| `tool/src/reviewer/reviewer-implementation.js` | 审核端实现（含内嵌 CSS） | 阶段 1/3/4 |
| `tool/src/editor/main.js` / `reviewer-entry.js` | 入口壳 | 清理注释 |
| `tool/scripts/build/build-reviewer.mjs` | 审核运行时构建（含 HDR 注入） | 阶段 1 加 CSS 注入 |
| `tool/public/hdri/brown_photostudio_02_2k.hdr` | HDRI 资源（CC0，构建时 Base64 内嵌） | 不动 |
| `docs/apps-code-map.md`、`docs/.../工具化/README.md` | 文档索引 | 各阶段末更新 |
