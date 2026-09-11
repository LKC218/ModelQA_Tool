# 审核端导出已审 HTML 实施计划 V1.0

> 本文档自包含，新会话可直接按此执行。  
> 背景先读：`docs/apps-code-map.md`、`docs/工具化/README.md`、`docs/实施方案/完整实施计划-V1.0.md`。  
> 决策：先交付 **B（已审 HTML）**；**A（开发端导入 JSON）** 入口预留，本计划不实现。

## 1. 背景与问题

| 现状 | 说明 |
|---|---|
| 开发端导出 | 单 HTML / ZIP 待审包，固定 runtime + 重新序列化 |
| 审核端修改 | 只改内存 `state.payload.review` |
| 审核端导出 | 仅 `*-审核结果.json` |
| 开发方消费 | 需自己解析 JSON，无法「双击 HTML 过一遍缺陷」 |

讨论结论：

1. **先做 B**：审核方发回「已审 HTML」，开发双击打开，在 3D 里过模型缺陷。
2. **A 预留**：JSON 仍是唯一数据契约；开发端「导入审核结果」后续再细化，本计划不实现。
3. HTML 是**可转发的已审快照**，不是第二数据源；禁止用「读原文件再改写」实现。

## 2. 目标与非目标

**目标**

1. 审核端在既有「导出审核结果」旁增加（或并列为）**导出已审 HTML**。
2. 已审 HTML 与待审包同构：可切换课程/模型、查看层级、点 Issue 定位零件、读结论与问题清单。
3. 导出逻辑延续：**固定 runtime + 当前 payload（含最新 review）重新序列化**，绝不读取原 HTML。
4. 保留现有 JSON 导出；schema 与字段不变，供 A 后续接入。

**非目标**

- 不实现开发端「导入审核结果 JSON」。
- 不改 `schemaVersion`、`review.byModel` 枚举、Issue 字段名。
- 不做 ZIP 大项目（>20MB）的已审整包重导（见 §5 边界）。
- 不做截图/camera 回放、只读报告 Markdown、多人批注。
- 不改 Vite/esbuild 构建链、不引入框架。

## 3. 设计原则

1. **JSON 契约优先**：已审 HTML = `待审壳 + 最新 review 写回 payload`；开发端以后仍以 JSON 回流。
2. **重新序列化**：与开发端 `exportSingle` 同模式；审核端不持有原文件路径，只能从内存 payload 生成。
3. **文件名可辨**：必须与待审包区分，避免开发方误开旧包。
4. **单 HTML 优先**：内嵌 GLB 的 `mode: 'inline'` 才适合整包重导；folder/ZIP 降级。

## 4. 技术方案

### 4.1 数据流

```text
开发端 payload(inline)
  → window.__AN_REVIEW_PAYLOAD__ 嵌入 审核器.html
  → 审核端内存修改 state.payload.review
  → 导出已审 HTML：
       review = { ...state.payload.review, projectId, projectName,
                  projectConclusion: 原值或空, updatedAt: now(),
                  reviewedExportedAt: now() }   // 可选附加，不破坏既有字段
       html = 模板( runtime + JSON.stringify({ ...state.payload, review }) )
  → 下载 `项目名-已审.html`
```

### 4.2 与开发端 `reviewerHtml` 的关系

| 项 | 开发端 | 审核端 B |
|---|---|---|
| runtime 来源 | `reviewerRuntime`（`?raw` 生成物） | **同一份**已打进审核端运行时 |
| payload | 导出前 `payload(true)` | `state.payload` + 同步最新 review |
| 模板 | `reviewerHtml(data)` | 审核端内实现等价函数 `exportReviewedHtml()` |
| 模型数据 | `base64Chunks` 已在 payload | 原样保留，不重读磁盘 |

实现上：审核端运行时已在页面内，**无需再 import 开发端源码**。只需把「拼 HTML 壳」抽成与开发端一致的字符串模板（含 `<div id="app">`、payload script、runtime script）。若 runtime 已作为字符串存在于运行时作用域，直接复用；若当前运行时是「已执行的页面」而非可再拼的源字符串，则：

- **推荐**：构建时额外挂 `globalThis.__AN_REVIEWER_HTML_SHELL__` 或 `__AN_REVIEWER_RUNTIME_SRC__`（由 `build-reviewer.mjs` 注入完整 runtime 源码字符串），导出时拼壳。
- **禁止**：读取当前 `document.documentElement.outerHTML` 当导出结果（会混入运行时 DOM/临时状态，不可靠且难测）。

### 4.3 导出按钮与文案

| 项 | 约定 |
|---|---|
| 主按钮 | 「导出已审 HTML」（primary，取代或与原「导出审核结果」并列时：已审 HTML 为 primary） |
| 次按钮 | 「导出 JSON」（保留原行为，文件名仍 `*-审核结果.json`） |
| 文件名 | `${safeName(projectName)}-已审.html`；可选追加 `YYYYMMDD-HHmm` 便于多轮 |
| 底栏反馈 | 「已审 HTML 已导出」 |
| 未加载模型/无 payload | 保持 disabled，与现逻辑一致 |

建议顶栏：`[导出已审 HTML]` primary + `[JSON]` 次级，避免用户只点 JSON 却以为交了 HTML。

### 4.4 ZIP / folder 边界

| 场景 | 行为 |
|---|---|
| `payload.mode === 'inline'`（单 HTML，含 `base64Chunks`） | 允许导出已审 HTML |
| `payload.mode === 'folder'` 或无 `base64Chunks` 且依赖 `state.files` | **禁用**已审 HTML 按钮，title/提示：「ZIP 审核包请导出 JSON；大项目不重导整包 HTML」 |
| 超大体积 | 不在审核端强制加 20MB 校验（数据已在内存）；可选提示文件会较大 |

理由：folder 模式模型在 `models/`，把 GLB 再 base64 进 HTML 会撑爆体积且审核端未按该路径设计。

### 4.5 payload 写回规则

1. 只更新 `review` 段；`project`（含 models/courses/nodes/base64Chunks）原样复制。
2. `updatedAt` 刷新为导出时刻；`exportedAt` 可写在 review 根或 `reviewedExportedAt`，**不得删除**已有 `byModel` / `projectId` / `projectName`。
3. 不重置 `modelStatus` / `issues`；以当前内存为准（含未点过「导出 JSON」的改动）。
4. 序列化时对 `</script>` 做与开发端相同的 `<` → `\\u003c` 转义。

### 4.6 构建脚本改动（若需要）

| 文件 | 改动 |
|---|---|
| `tool/scripts/build/build-reviewer.mjs` | 在现有 `__AN_SHARED_CSS__` / `__AN_HDR_SOURCE__` 之外，增加把 **runtime 源文件全文**写入 `globalThis.__AN_REVIEWER_RUNTIME_SRC__`（或 shell 模板），供导出拼 HTML |
| `tool/src/generated/reviewer-runtime.js` | 构建产物，不入库；本地 build 会更新 |

若 esbuild 产物已是 IIFE 字符串，注意导出时使用的是 **源码文本**还是已执行对象——必须是可嵌入 `<script>` 的文本。

## 5. 落点文件

| 文件 | 影响 |
|---|---|
| `tool/src/reviewer/reviewer-implementation.js` | 主改：导出按钮、`exportReviewedHtml`、ZIP 禁用逻辑、底栏文案 |
| `tool/scripts/build/build-reviewer.mjs` | 可选：注入 runtime 源字符串 |
| `docs/apps-code-map.md` | 增加本计划条目 |
| `docs/工具化/README.md` | 同步「审核端导出：已审 HTML + JSON」一句 |
| 本文件 | 需求与验收唯一来源 |

**不改**：`main-implementation.js` 导出逻辑、review JSON 字段、共享样式层（除非按钮并列需极小布局，优先复用 `.button`）。

## 6. 分阶段任务与验收

### 阶段 P0：拼壳导出（必做）

1. 确认/实现可嵌入的 runtime 源字符串（构建注入或已有等价物）。
2. 实现 `exportReviewedHtml()`：组装 `{ schemaVersion, project, review, mode }` → 拼 HTML → `download`。
3. 顶栏主按钮「导出已审 HTML」；保留 JSON 导出。
4. `mode === 'folder'` 时禁用主按钮并提示。

**验收**

- 单 HTML 待审包打开 → 改至少 1 个模型结论 + 1 条 Issue → 导出已审 HTML。
- 新文件双击打开：标题/课程条正常；结论与 Issue 与导出前一致；点 Issue 能定位零件。
- 同时导出 JSON，字段与改前兼容（`byModel` 等齐全）。
- 控制台无报错；不依赖网络。

### 阶段 P1：文件名与多轮（建议）

1. 文件名规则落地：`{项目}-已审.html` 或带时间戳。
2. 连续两次导出，文件均可独立打开，内容取各自导出时刻的内存状态。
3. 底栏/toast 文案区分「已审 HTML」与「JSON」。

**验收**

- 两份已审文件不互相覆盖（时间戳或用户改名策略写清）。
- 待审包文件名不被误改成已审名。

### 阶段 P2：文档与冒烟

1. 更新 `docs/apps-code-map.md`、`工具化/README.md`。
2. 全流程：开发端导出单 HTML → 审核 → 导出已审 HTML → 开发双击过缺陷 → 导出 JSON 留档。
3. ZIP 路径确认按钮禁用提示正确。

**验收**

- 文档与实现一致；冒烟记录可复现。

## 7. 实现要点（防坑）

1. **禁止 `outerHTML` 导出**：运行时 DOM ≠ 初始壳，且可能泄露调试节点。
2. **禁止读原文件改写**：维持「固定 runtime + 数据」边界。
3. **JSON 转义**：与开发端一致，防 `</script>` 截断。
4. **folder 模式**：不要为了「也能导 HTML」而把 `state.files` 里的 GLB 临时 base64（内存峰值与体积双炸）；直接禁用。
5. **review 空对象**：导出前 `review ||= { byModel: {} }`，避免写入 `undefined`。
6. **次要按钮优先级**：开发方主路径点「已审 HTML」；JSON 不要做成唯一 primary，否则重复现缺口。

## 8. A 方案预留（本计划不实现）

后续开发端只需，且**不阻塞 B**：

1. 「导入审核结果 JSON」入口。
2. 校验 `projectId` + 合并 `state.reviews.byModel`。
3. 列表徽章 + 点 Issue 3D 定位。

约束：**不把 HTML 当唯一状态源**；已审 HTML 只是快照。

## 9. 优先级总表

| 级 | 内容 | 解决 |
|---|---|---|
| P0 | 已审 HTML 拼壳导出 + ZIP 禁用 + 保留 JSON | 开发双击过缺陷 |
| P1 | 文件名/多轮可辨 | 版本混淆 |
| P2 | 文档 + 冒烟 | 闭环 |
| （后续） | 开发端导入 JSON（A） | 工具内回流与改模 |

## 10. 风险

| 风险 | 缓解 |
|---|---|
| 运行时源字符串体积大、拼接慢 | 仅导出时拼接；可显示「生成中」；不在每次改状态时做 |
| 误用 folder 模式导出残缺 HTML | 按钮禁用 + 明确提示走 JSON |
| 多份已审 HTML 混淆 | 文件名含「已审」+ 时间戳；文档写清交接约定 |
| runtime 与导出壳版本不一致 | 始终用构建注入的同一 runtime 源，禁止手写第二份模板逻辑分叉 |
| 大项目内存 | 仅 inline 项目；不强制二次 base64 |

## 11. 验收清单（合并）

- [ ] 审核端可导出 `{项目}-已审.html`，双击离线可打开。
- [ ] 已审 HTML 内结论、说明、Issue、定位与导出时内存一致。
- [ ] 原 JSON 导出仍在，字段兼容。
- [ ] ZIP/folder 场景已审 HTML 禁用并有提示。
- [ ] 未读取原 HTML 文件；未改动 review schema。
- [ ] `cd tool && npm run build` 通过。
- [ ] `docs/apps-code-map.md` 与 `工具化/README.md` 已同步。

## 12. 相关文档

- 工具化说明：`docs/工具化/README.md`
- 完整边界：`docs/实施方案/完整实施计划-V1.0.md`
- 审核端实现：`tool/src/reviewer/reviewer-implementation.js`
- 开发端导出：`tool/src/editor/main-implementation.js`（`reviewerHtml` / `exportSingle`）
- 构建：`tool/scripts/build/build-reviewer.mjs`
- 代码导航：`docs/apps-code-map.md`
