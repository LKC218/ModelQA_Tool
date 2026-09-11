# 审核端导出已审 ZIP 实施计划 V1.0

> 本文档自包含，新会话可直接按此执行。  
> 背景先读：`docs/apps-code-map.md`、`docs/工具化/README.md`、`docs/实施方案/审核端导出已审HTML-实施计划-V1.0.md`、`docs/实施方案/审核端拖放文件夹加载-实施计划-V1.0.md`。  
> 已拍板：按钮文案 **「导出已审 ZIP」**；**folder 模式隐藏「已审 HTML」按钮**（不是灰态禁用）。

## 1. 背景与问题

| 现状 | 说明 |
|---|---|
| 审核端导出 | 主按钮「导出已审 HTML」+ 次按钮「JSON」 |
| 已审 HTML | 仅 `mode==='inline'` 且含 `base64Chunks`；大项目体积会再爆 |
| folder/ZIP 待审包 | 「已审 HTML」禁用，只能导 JSON → 开发方无法双击过缺陷 |
| 拖放加载 | 已支持解压根目录一次授权打开 ZIP 包 |

讨论结论：

1. 大项目/folder 会话需要 **已审 ZIP** 作为可转发交付物：解压后仍可双击 `审核器.html` 过缺陷，模型外置不膨胀。
2. 按钮文案固定为 **「导出已审 ZIP」**（与「导出已审 HTML」对仗）。
3. folder 模式 **隐藏**「已审 HTML」，避免用户点到永远不可用的死按钮；小 inline 包仍保留 HTML 快捷导出。
4. JSON 仍是数据契约；ZIP = 壳 + JSON + 模型的打包，不是第二 schema。

## 2. 目标与非目标

**目标**

1. 顶栏增加 **「导出已审 ZIP」**。
2. 产物与开发端 ZIP 同构：`审核器.html` + `project.json` + `review/issues.json` + `models/*.glb`。
3. 双会话可导出：
   - folder：`state.files` 中的 GLB 原样入包；
   - inline：解码 `base64Chunks` 后入包。
4. folder 模式隐藏「已审 HTML」；ZIP 按钮为该模式主路径。
5. 保留 JSON 导出，字段不变。

**非目标**

- 不改 `schemaVersion` / `review.byModel` / Issue 字段。
- 不改开发端导出逻辑。
- 不做「已审 HTML」在 folder 下的强制重导。
- 不做云上传、增量包、加密。
- 不实现开发端「导入已审包」（JSON 契约预留）。

## 3. 设计原则

1. **同构可打开**：开发方解压后打开方式与待审 ZIP 一致（拖放根目录 / 按钮选择）。
2. **重新序列化**：HTML 壳 = 固定 runtime + 当前内存 payload；禁止 `outerHTML`。
3. **模型不进 HTML**：ZIP 内 HTML 的 `mode:'folder'`，且 **剥离** `base64Chunks`，避免双重膨胀。
4. **按钮少而准**：folder 只暴露真正可用的导出（ZIP / JSON）；inline 才显示 HTML。

## 4. 技术方案

### 4.1 数据流

```text
审核会话内存
  state.payload.project / review   （含最新 modelStatus / issues）
  模型源：
    folder → state.files: Map(fileName → File)
    inline → models[].base64Chunks → decode → Uint8Array

        │
        ▼
  buildReviewedZipPayload()
    mode: 'folder'
    project.models 去掉 base64Chunks
    fileName 经 safeName
        │
        ├─► 审核器.html  = reviewerHtmlShell(payload)   // 与已审 HTML 同壳
        ├─► project.json
        ├─► review/issues.json
        └─► models/<safeName>.glb
        │
        ▼
  zipSync(files, { level: 0 })  →  下载 `{项目}-已审-{slug}.zip`
```

### 4.2 模型源解析

```js
async function collectModelBinaries() {
  const models = state.payload?.project?.models || [];
  const map = new Map(); // safeName(fileName) → Uint8Array
  for (const model of models) {
    const name = safeName(model.fileName);
    if (state.files?.has(model.fileName)) {
      const file = state.files.get(model.fileName);
      map.set(name, new Uint8Array(await file.arrayBuffer()));
      continue;
    }
    if (Array.isArray(model.base64Chunks) && model.base64Chunks.length) {
      map.set(name, new Uint8Array(await decode(model.base64Chunks)));
      continue;
    }
    throw new Error(`缺少模型文件：${model.fileName}`);
  }
  if (!map.size) throw new Error('无可用模型资源');
  return map;
}
```

注意：

- Map key 用 **`safeName(model.fileName)`**，与 ZIP 内路径、`project.models[].fileName` 一致，避免二次打开找不到文件。
- `decode` 复用审核端已有 base64 解码函数（`loadModel` 路径）。
- 某模型缺源时 **整包失败并提示**，不导出残包。

### 4.3 产物组装

```js
async function buildReviewedZip() {
  const payload = buildReviewedPayload(); // 已有：写回 review 时间戳等
  payload.mode = 'folder';
  payload.project = {
    ...payload.project,
    models: (payload.project.models || []).map((model) => {
      const { base64Chunks, ...rest } = model;
      return { ...rest, fileName: safeName(model.fileName) };
    }),
  };
  const html = reviewerHtmlShell(payload);
  const binaries = await collectModelBinaries();
  const files = {
    '审核器.html': strToU8(html),
    'project.json': strToU8(JSON.stringify(payload.project, null, 2)),
    'review/issues.json': strToU8(JSON.stringify(payload.review, null, 2)),
  };
  for (const [name, bytes] of binaries) files[`models/${name}`] = bytes;
  return zipSync(files, { level: 0 });
}
```

`level: 0`：GLB 已压缩；避免审核端打包过慢。与开发端一致。

### 4.4 按钮与可见性

顶栏 `actions`：

```text
[选择审核包文件夹]
[导出已审 ZIP]     primary，始终优先
[导出已审 HTML]    仅 inline 且 canExportReviewedHtml() 时渲染/显示
[JSON]             次级
```

| 会话 | ZIP | 已审 HTML | JSON |
|---|---|---|---|
| folder + `state.files` | **可用（主）** | **隐藏** | 可用 |
| folder 未绑文件 | 禁用 title：请先拖入审核包文件夹 | 隐藏 | 禁用或仅元数据 JSON 视项目而定（维持现状：有 payload 即可导 JSON，但 issues 可能空） |
| inline 小包 | 可用 | 可用 | 可用 |
| inline 大包 | 可用（推荐） | 可用 + title 提示体积风险 | 可用 |

实现要点：

- 新增 `id="export-zip"`，文案 **「导出已审 ZIP」**，class `button primary`。
- 原 `#export-html` 在 folder 路径下 `hidden`（`classList.add('hidden')`），不是 `disabled`。
- `syncExportButtons` 同步三者；删除或改写 `FOLDER_HTML_HINT` 中「请导出 JSON」为「请导出已审 ZIP」相关提示（若 ZIP 不可用时仍指向 JSON）。

### 4.5 可用性判定

```js
function canExportReviewedZip() {
  const payload = state.payload;
  if (!payload?.project) return false;
  const models = payload.project.models || [];
  if (!models.length) return false;
  if (state.files?.size) return true;
  return models.every((m) => Array.isArray(m.base64Chunks) && m.base64Chunks.length);
}
```

### 4.6 依赖

- 审核端入口 `reviewer-entry.js` / 实现文件：  
  `import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';`  
  与开发端同一来源，esbuild 会打进 runtime。
- 预期 runtime 增量：fflate 压缩版数十 KB 级；**显著小于** 再内嵌 GLB。构建后记录 `dist` 对比即可。

### 4.7 反馈文案

| 时机 | footer / status |
|---|---|
| 成功 | 「已审 ZIP 已导出；解压后打开 审核器.html」 |
| 缺模型源 | 「导出失败：缺少模型文件 xxx」 |
| 打包异常 | 「已审 ZIP 导出失败：…」 |

## 5. 改动文件

| 文件 | 改动 |
|---|---|
| `tool/src/reviewer/reviewer-implementation.js` | 主改：import fflate、`#export-zip`、`canExportReviewedZip`、`collectModelBinaries`、`buildReviewedZip`、`exportReviewedZip`、`syncExportButtons` 按钮显隐、folder 隐藏 HTML |
| `docs/工具化/README.md` | 审核结果双导出改为三导出：已审 ZIP（主）/ 已审 HTML（仅小包）/ JSON |
| `docs/apps-code-map.md` | 增加本计划导航；更新审核者离线实现条目 |
| `tool/src/editor/main-implementation.js` | **不改** |
| `tool/scripts/build/build-reviewer.mjs` | **不改**（fflate 经 esbuild 从入口打入） |

## 6. 边界与风险

| 风险 | 处理 |
|---|---|
| runtime 变大 | 可接受；验收时对比 build 体积；禁止再把 GLB 塞进 HTML |
| folder 用 `fileName` 对不上 safeName | 组装时统一 `safeName`，`collectModelBinaries` 同步映射 |
| inline 解码内存峰值 | 分模型顺序 `arrayBuffer`/decode，不在 Promise.all 全量并行（大包更稳） |
| 同名 GLB | 与开发端一致后写覆盖；不新增去重逻辑 |
| 用户在未加载 files 时点 ZIP | 按钮 disabled + 空态已有拖放 CTA |
| 已审 HTML 被误隐藏 | 仅 `mode==='folder'` 隐藏；inline 路径回归必须仍显示 |

## 7. 阶段划分

### P0（本计划必做）

1. 顶栏「导出已审 ZIP」primary + 事件绑定。
2. `buildReviewedZip` / `collectModelBinaries` / `canExportReviewedZip`。
3. folder 隐藏「已审 HTML」；inline 保持 HTML。
4. `syncExportButtons` 与成功/失败文案。
5. `npm run build` 通过；runtime 含 zip 能力。

### P1（不实现）

- 开发端导入已审 ZIP/JSON。
- ZIP 压缩级别自适应、进度条。
- 已审 HTML 对 folder 的「拆包再内嵌」导出。

## 8. 验收清单

- [ ] folder 会话（拖入待审 ZIP 解压包）顶栏：**无**「已审 HTML」，有「导出已审 ZIP」与「JSON」。
- [ ] 点「导出已审 ZIP」得到 `{项目}-已审-*.zip`，内含 4 类路径且无 base64 模型字段。
- [ ] 解压已审 ZIP → 双击 `审核器.html` → 拖入根目录 → 结论/Issue/定位与导出前一致。
- [ ] 从单 HTML（inline）小包进入 → 「导出已审 ZIP」与「导出已审 HTML」均可用；导出 ZIP 后 folder 链路可打开。
- [ ] 内嵌包导出 ZIP 时模型从 base64 解出且 `models/` 文件可被 GLTFLoader 解析。
- [ ] 缺模型源时明确报错，不产生残 ZIP。
- [ ] JSON 导出字段与改前兼容。
- [ ] `npm run build` 通过。

## 9. 验证方式

1. `cd tool && npm run build`。
2. 开发端导出 ZIP 待审包 → 审核端拖放加载 → 改结论+Issue → 导出已审 ZIP → 二次打开验收。
3. 开发端导出单 HTML 小包 → 审核端改审 → 分别导出已审 HTML 与已审 ZIP，各打开一次。
4. 对比 `tool/dist` 体积与 runtime 字符串长度（预期小幅增加）。

## 10. 参考

- 开发端 ZIP：`tool/src/editor/main-implementation.js` → `exportZip`（`fflate` `zipSync` level 0）
- 已审 HTML：`tool/src/reviewer/reviewer-implementation.js` → `buildReviewedPayload` / `reviewerHtmlShell` / `exportReviewedHtml`
- 拖放加载：同文件 `loadDirectory` / `collectDropFiles`
- 产品说明：`docs/工具化/README.md`
