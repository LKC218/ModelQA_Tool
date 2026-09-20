# HTML UI 热更新（CSS 通道）实施记录 V1.0

> 日期：2026-09-14　状态：已部署上线　探针：probe-hotload 11/11 + 回归 34/34 + 线上冒烟 6/6 全绿

## 1. 背景与决策

已上传/已分发的快照 HTML（审核器包 + 已审回传）此前完全自包含（payload + 运行时 JS + CSS/HDR 全内嵌），UI/UX 一经上传即固定，高频更新只能重传链接。经讨论确定风险边界后拍板：**只热更 CSS 展示层**，JS 逻辑与数据保持快照——避开版本错配、快照语义破坏、SRI 两难三大坑；离线能力零损伤。

## 2. 机制

- 快照 HTML 内嵌一段极简引导（构建时注入 `generated/reviewer-runtime.js` 尾部）：
  `(function(){try{if(!/^https?:$/.test(location.protocol))return;var l=document.createElement("link");l.rel="stylesheet";l.href="/runtime/ui.css";l.onerror=function(){l.remove()};document.head.appendChild(l)}catch(e){}})();`
- 页面打开时（仅 http/https）动态 append `<link href="/runtime/ui.css">`，位于 runtime 注入的内嵌 `<style>` 之后 → 同 specificity 后者覆盖。
- 失败矩阵自愈：404/网络失败 → `onerror` 移除 link，内嵌快照样式接管；`file://` → 协议守卫直接跳过（连请求都不发）。
- 新版 CSS 若类名重构匹配不上旧 DOM → 内嵌样式自动兜底（叠加模式自愈，无版本协商）。
- **单点注入双通道生效**：editor 经 `?raw` 内嵌 generated 全文（审核器 HTML），reviewer 经 `__AN_REVIEWER_RUNTIME_SRC__`（已审 HTML），两个导出通道无需各自改动。

## 3. 改动清单

| 文件 | 改动 |
|---|---|
| `tool/scripts/build/build-reviewer.mjs` | hotload 引导拼进 `__AN_REVIEWER_RUNTIME_SRC__` 字符串与直接执行体（注意：必须进字符串内，否则 shell 导出通道不携带） |
| `tool/scripts/build/copy-runtime-css.mjs`（新增） | 拷贝 `src/shared/shared-ui.css → dist/runtime/ui.css` |
| `tool/package.json` | `build` 追加 `&& node scripts/build/copy-runtime-css.mjs`（**必须在 vite build 之后**：vite 默认 emptyOutDir 会清掉先写入的 dist/runtime/） |
| nginx `model-review-tool.conf` | 三个 server 块各插入 `location /runtime/ { add_header Cache-Control "no-cache"; }`（注：server 级 no-cache 早已存在，此块冗余但自文档化） |

服务端 API 零改动；`upload_dist.py` 全量上传 dist/ 自动携带 runtime/ui.css，零改动。

## 4. 验证

- **probe-hotload.cjs**（11 断言全绿）：命中态（link 追加 + `::after` 标记断言覆盖生效 + 快照渲染 + 无 pageerror）/ 404 态（onerror 移除 + 兜底渲染）/ file:// 态（协议守卫零请求 + 离线渲染）。
- **回归**：probe-e2e-dedup 22/22、probe-e2e-explode2 12/12。
- **线上冒烟 probe-hotload-prod.cjs**（6/6）：`/api/upload` 传测试包 → 打开托管 URL → 断言 link 指向线上 + CSS 200 + 渲染正常 → `?hard=1` 硬删清理。
- 部署复验：index.html / version.json / runtime\ui.css 三者 MD5 MATCH；线上 `Cache-Control: no-cache` + ETag（revalidate，304 便宜）。

## 5. 边界与已知限制

1. **改造前已上传的旧链接无法热更**（体内无引导代码，物理限制）；仅本次部署后新导出/新上传的快照具备热更能力。
2. 热更面 = 纯 CSS；JS 展示交互（`ui-patch.js`）列为二期，待 CSS 通道稳定后评估；涉及 payload/流程逻辑的改动仍走「重新上传」老路。
3. HDR 源未外置（打开模型必须等网络，破坏离线首开），保持内嵌。
4. 引导以任意 http(s) 域解析 `/runtime/ui.css`（相对根路径）——非本站打开时拉取失败静默回退，无副作用。

## 6. 运维备忘

- 改 UI/UX 后热更已分发链接：改 `src/shared/shared-ui.css` → `npm run build` → `upload_dist.py` → 旧链接刷新即生效（无需重传）。
- 排查「热更没生效」：先 `curl -sI https://3d.propanda.cn/runtime/ui.css` 看 200/no-cache；再确认该链接是部署后新上传的（旧链接无引导）。
- nginx 备份：服务器 `/root/backups/model-review-tool.conf.pre-runtime-20260914` + 本地 `backups/model-review-tool.conf.pre-runtime-20260914.local`。
