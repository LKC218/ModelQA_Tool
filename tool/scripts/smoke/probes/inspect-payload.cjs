const fs = require('fs');
const src = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');
const key = 'window.__AN_REVIEW_PAYLOAD__=';
const start = src.indexOf(key);
let i = src.indexOf('{', start), depth = 0, inStr = false, end = -1;
for (; i < src.length; i++) {
  const c = src[i];
  if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const p = JSON.parse(src.slice(src.indexOf('{', start), end));
const out = [];
out.push(`schemaVersion=${p.schemaVersion} mode=${p.mode} submitToken=${Boolean(p.submitToken)}`);
out.push(`modelData count=${(p.modelData || []).length}`);
(p.modelData || []).forEach((e, idx) => out.push(`entry[${idx}]: key=${e.key} fileRef=${e.fileRef} hasChunks=${Array.isArray(e.base64Chunks)} chunkLen=${(e.base64Chunks || []).length}`));
out.push(`models count=${(p.project.models || []).length}`);
(p.project.models || []).slice(0, 3).forEach((m, idx) => out.push(`model[${idx}]: id=${m.modelId} dataKey=${m.dataKey} fileRef=${m.fileRef} hasChunks=${Array.isArray(m.base64Chunks)} chunkLen=${(m.base64Chunks || []).length} name=${m.fileName}`));
fs.writeFileSync('G:/项目/模型审核工具/tool/output/probe-payload-shape.txt', out.join('\n') + '\n', 'utf8');
