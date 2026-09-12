import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { renderCourseRail, renderCourseModelList, renderTree, emptyState, nodeDisplayName, bindViewportTools } from '../shared/shared-components.js';
import { createProductViewer } from '../shared/shared-viewer.js';
import { initReviewerOnboarding } from './reviewer-onboarding.js';
import { mountHelpHotspot, FOCUS_PART_TOPIC, LOAD_PACKAGE_TOPIC } from '../shared/shared-help-hotspot.js';
import { bindSettingsToggle } from '../shared/settings.js';
import {
  supportsDirectoryPicker,
  pickPackageDirectory,
  collectFilesFromDirectory,
  rememberPackageHandle,
  forgetPackageHandle,
  tryLoadRememberedPackage,
  openRememberedPackage,
  packageRootName,
  getRememberedDirName,
} from './reviewer-fs-handle.js';

/* 审核端默认亮色工作台，可切换暗色并记忆；注入双端共享 CSS 与审核端独有样式。
   共享 CSS 由 build-reviewer.mjs 构建时经 __AN_SHARED_CSS__ 注入（来源 tool/src/shared/shared-ui.css）。 */
const REVIEWER_THEME_KEY = 'modelqa-reviewer-theme';
document.documentElement.dataset.theme = localStorage.getItem(REVIEWER_THEME_KEY) === 'dark' ? 'dark' : 'light';
document.head.append(Object.assign(document.createElement('style'), { textContent: (globalThis.__AN_SHARED_CSS__ || '') + `
/* —— 审核端独有：状态分段/HUD 徽章/问题清单/进度统计 —— */
/* 分段控件与 HUD 覆盖仅审核端使用，避免与 shared 并发改写冲突 */
.segmented { display: flex; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card); }
.segmented > button { flex: 1 1 0; position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; min-height: 36px; padding: 0 8px 2px; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); font-size: var(--fs-base); font-weight: 700; line-height: 1; white-space: nowrap; transition: color 140ms ease, background 140ms ease, box-shadow 140ms ease; }
.segmented > button:last-child { border-right: 0; }
.segmented > button:hover:not(.is-on) { color: var(--text); background: color-mix(in srgb, var(--text) 5%, transparent); }
.segmented > button::after { content: ""; position: absolute; right: 0; bottom: 0; left: 0; height: 2px; background: transparent; transform: scaleX(0); transform-origin: left center; transition: transform 160ms var(--ease-out), background 140ms ease; }
.segmented > button.is-on[data-status="pass"] { color: var(--success); background: color-mix(in srgb, var(--success) 24%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--success) 48%, transparent); animation: seg-pop 160ms ease-out; }
.segmented > button.is-on[data-status="pass"]::after { background: var(--success); transform: scaleX(1); }
.segmented > button.is-on[data-status="risk"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 24%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 48%, transparent); animation: seg-pop 160ms ease-out; }
.segmented > button.is-on[data-status="risk"]::after { background: var(--accent); transform: scaleX(1); }
.segmented > button.is-on[data-status="block"] { color: var(--danger); background: color-mix(in srgb, var(--danger) 24%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 52%, transparent); animation: seg-pop 160ms ease-out; }
.segmented > button.is-on[data-status="block"]::after { background: var(--danger); transform: scaleX(1); }
.segmented > button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
@keyframes seg-pop { from { transform: scale(0.96); } to { transform: scale(1); } }
.review-shell .viewer-hud { display: flex; align-items: center; gap: 10px; pointer-events: none; }
.panel-title-stack { display: grid; gap: 2px; min-width: 0; }
.panel-sub { color: var(--dim); font-size: var(--fs-xs); font-weight: 400; line-height: 1.3; }
.field-stack { display: grid; gap: 7px; min-width: 0; }
.field-stack > label { margin: 0; }
.model-status-reset-row { display: flex; justify-content: flex-end; }
#model-review-state[data-status="pending"] { color: var(--dim); }
#model-review-state[data-status="pass"] { color: var(--success); }
#model-review-state[data-status="risk"] { color: var(--accent); }
#model-review-state[data-status="block"] { color: var(--danger); }
.hud-status {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}
.hud-status-icon { font-size: var(--fs-2xl); line-height: 1; }
.hud-status.pending { color: var(--dim); border-color: color-mix(in srgb, var(--dim) 35%, transparent); background: color-mix(in srgb, var(--dim) 14%, transparent); }
.hud-status.pass { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); background: color-mix(in srgb, var(--success) 16%, transparent); }
.hud-status.risk { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
.hud-status.block { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); background: color-mix(in srgb, var(--danger) 18%, transparent); }
.issue-list { display: grid; gap: 6px; min-width: 0; }
.issue {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 10px 10px 10px 0;
  border: 1px solid var(--line);
  border-left-width: 4px;
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--text);
  font-size: var(--fs-md);
  line-height: 1.45;
  cursor: pointer;
}
.issue.pass { border-left-color: var(--success); background: color-mix(in srgb, var(--success) 7%, var(--card)); }
.issue.risk { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
.issue.block { border-left-color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--card)); }
.issue-body { display: grid; gap: 4px; min-width: 0; }
.issue-body b { min-width: 0; overflow: hidden; font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.issue-body span, .issue-body small { color: var(--muted); font-size: var(--fs-base); overflow-wrap: anywhere; }
.issue-status-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 72px;
  min-height: 28px;
  margin-left: 8px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--muted);
  font-size: var(--fs-base);
  font-weight: 700;
  line-height: 1;
}
.issue-status-btn.pass { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); background: color-mix(in srgb, var(--success) 10%, transparent); }
.issue-status-btn.risk { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.issue-status-btn.block { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.issue-remove { flex: 0 0 auto; width: 22px; height: 22px; margin-top: 3px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--dim); font-size: var(--fs-md); line-height: 1; opacity: 0; transition: opacity 140ms ease, background 140ms ease, color 140ms ease; }
.issue:hover .issue-remove, .issue-remove:focus-visible { opacity: 1; }
.issue-remove:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
.issue-status-menu {
  position: fixed;
  z-index: 40;
  display: grid;
  gap: 2px;
  min-width: 128px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--menu-bg);
  box-shadow: 0 10px 28px var(--shadow-color);
}
.issue-status-menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-base);
  font-weight: 700;
  text-align: left;
}
.issue-status-menu button:hover,
.issue-status-menu button.is-on { background: var(--card); }
.issue-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.topbar-progress { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; color: var(--dim); font-size: var(--fs-base); white-space: nowrap; }
.topbar-progress .stat.pass { color: var(--success); }
.topbar-progress .stat.risk { color: var(--accent); }
.topbar-progress .stat.block { color: var(--danger); }
.topbar-progress .stat-sep { color: var(--dim); opacity: 0.7; }
/* —— 审核端独有：审核包文件夹拖放空态 —— */
.folder-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(2px);
  transition: opacity 160ms ease, visibility 160ms ease;
}
.folder-drop-overlay.hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.folder-drop-overlay.is-dragover {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
}
.folder-drop-card {
  display: grid;
  gap: 10px;
  justify-items: center;
  max-width: 420px;
  padding: 28px 24px;
  border: 1.5px dashed color-mix(in srgb, var(--dim) 55%, transparent);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
  color: var(--text);
  text-align: center;
  box-shadow: 0 10px 28px var(--shadow-color);
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}
.folder-drop-overlay.is-dragover .folder-drop-card {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--card));
  transform: scale(1.02);
}
.folder-drop-icon { font-size: var(--fs-icon-xl); line-height: 1; color: var(--accent); }
.folder-drop-title { margin: 0; font-size: var(--fs-2xl); font-weight: 700; line-height: 1.3; }
.folder-drop-hint { margin: 0; color: var(--muted); font-size: var(--fs-base); line-height: 1.5; }
.folder-drop-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--fs-xs);
}
.folder-drop-last {
  display: grid;
  gap: 8px;
  justify-items: center;
  width: 100%;
  padding-top: 4px;
  border-top: 1px dashed color-mix(in srgb, var(--dim) 40%, transparent);
}
.folder-drop-last.hidden { display: none; }
.folder-drop-last-name {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted);
  font-size: var(--fs-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-drop-last-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
/* —— 审核端独有：顶栏分组分隔线 / 完成引导呼吸高亮 / 移动端顶栏更多菜单 / 触控 —— */
.topbar-sep {
  width: 1px;
  height: 20px;
  flex: none;
  background: var(--line);
}
.button.attn { animation: attn-ring 1.6s ease-in-out infinite; }
@keyframes attn-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(27, 109, 77, 0.45); }
  50% { box-shadow: 0 0 0 6px rgba(27, 109, 77, 0); }
}
.topbar-more-menu {
  position: fixed;
  z-index: 60;
  top: calc(56px + env(safe-area-inset-top, 0px));
  right: 10px;
  display: grid;
  gap: 2px;
  min-width: 180px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--menu-bg);
  box-shadow: 0 10px 28px var(--shadow-color);
}
.topbar-more-menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-md);
  font-weight: 700;
  text-align: left;
}
.topbar-more-menu button:hover,
.topbar-more-menu button:focus-visible { background: var(--card); }
.topbar-more-menu button:disabled { opacity: 0.4; cursor: not-allowed; }
@media (hover: none), (max-width: 900px) {
  .issue-remove { opacity: 1; min-width: 28px; min-height: 28px; }
  .issue-status-btn { min-height: 36px; min-width: 84px; }
}
` }));
const $ = (id) => document.getElementById(id); const loader = new GLTFLoader(); const now = () => new Date().toISOString();
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const STATUS_META = {
  pending: { label: '未结论', short: '', icon: '○' },
  pass: { label: '通过', short: '通过', icon: '✓' },
  risk: { label: '待改', short: '待改', icon: '⚠' },
  block: { label: '阻断', short: '阻断', icon: '⛔' },
};
const state = { payload: window.__AN_REVIEW_PAYLOAD__, currentId: null, selected: null, loaded: new Map(), wire: false, files: null, treeQuery: '', issueDraftStatus: 'risk', issueMenuIndex: -1, packageFolderName: '', pendingLastDirName: '' };
const FOLDER_HTML_HINT = 'ZIP 审核包请导出已审 ZIP；大项目不重导整包 HTML';
const FOLDER_ZIP_HINT = '请先拖入审核包文件夹；或改导 JSON';
const safeName = (value) => String(value || '审核项目').replace(/[\\/:*?"<>|]/g, '_').trim() || '审核项目';
const timestampSlug = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function canExportReviewedHtml() {
  const payload = state.payload;
  if (!payload?.project) return false;
  if (payload.mode === 'folder') return false;
  const models = payload.project.models || [];
  if (!models.length) return false;
  if (payload.mode === 'inline') return models.every((model) => Array.isArray(model.base64Chunks) && model.base64Chunks.length);
  return models.every((model) => Array.isArray(model.base64Chunks) && model.base64Chunks.length);
}
function canExportReviewedZip() {
  const payload = state.payload;
  if (!payload?.project) return false;
  const models = payload.project.models || [];
  if (!models.length) return false;
  if (state.files?.size) return true;
  return models.every((model) => Array.isArray(model.base64Chunks) && model.base64Chunks.length);
}
function needsFolderFiles() {
  if (!state.payload?.project) return true;
  if (state.payload.mode !== 'folder') return false;
  return !state.files;
}
function refreshFolderDropUI() {
  const overlay = $('folder-drop');
  if (!overlay) return;
  const show = needsFolderFiles();
  overlay.classList.toggle('hidden', !show);
  overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  updateLastDirUI();
}
function walkEntry(entry, prefix, out) {
  return new Promise((resolve) => {
    if (!entry) { resolve(); return; }
    if (entry.isFile) {
      entry.file((file) => {
        try {
          Object.defineProperty(file, 'webkitRelativePath', { value: prefix + file.name, configurable: true });
        } catch { /* 部分环境只读，忽略 */ }
        out.push(file);
        resolve();
      }, () => resolve());
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => reader.readEntries(async (batch) => {
        if (!batch?.length) { resolve(); return; }
        for (const child of batch) await walkEntry(child, `${prefix}${entry.name}/`, out);
        readBatch();
      }, () => resolve());
      readBatch();
      return;
    }
    resolve();
  });
}
async function collectDropFiles(dataTransfer) {
  const items = [...(dataTransfer?.items || [])];
  const entries = items
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null))
    .filter(Boolean);
  if (!entries.length) return [...(dataTransfer?.files || [])];
  const files = [];
  for (const entry of entries) await walkEntry(entry, '', files);
  return files;
}
/* 项目制完成引导状态：complete 时主出口按钮呼吸高亮 + 一次性提示 */
let reviewCompleteNotified = false;
let attnAcknowledged = false;
function syncExportButtons(hasPayload = !!state.payload) {
  const jsonBtn = $('export');
  const htmlBtn = $('export-html');
  const zipBtn = $('export-zip');
  const submitBtn = $('submit-review');
  refreshFolderDropUI();
  if (!hasPayload) { reviewCompleteNotified = false; attnAcknowledged = false; }
  if (jsonBtn) jsonBtn.disabled = !hasPayload;
  const folderMode = state.payload?.mode === 'folder';
  const zipOk = hasPayload && canExportReviewedZip();
  if (zipBtn) {
    zipBtn.disabled = !zipOk;
    zipBtn.classList.toggle('primary', zipOk); // 出口自适应：只有可用的导出才配主按钮样式
    zipBtn.title = zipOk ? '打包已审 HTML + JSON + models 为可解压再打开的 ZIP' : FOLDER_ZIP_HINT;
  }
  const canSubmit = hasPayload && canExportReviewedHtml() && canSubmitReview();
  if (submitBtn) {
    submitBtn.hidden = !canSubmit;
    submitBtn.disabled = !canSubmit;
  }
  const submitItem = document.querySelector('#topbar-more-menu [data-more="submit"]');
  if (submitItem) {
    submitItem.hidden = !canSubmit;
    submitItem.disabled = !canSubmit;
  }
  if (!htmlBtn) return;
  if (folderMode) {
    htmlBtn.classList.add('hidden');
    htmlBtn.disabled = true;
    htmlBtn.classList.remove('primary');
    htmlBtn.removeAttribute('title');
    return;
  }
  htmlBtn.classList.remove('hidden');
  const htmlOk = hasPayload && canExportReviewedHtml();
  htmlBtn.disabled = !htmlOk;
  htmlBtn.classList.toggle('primary', htmlOk && !canSubmit); // 回传可用时回传是主动作，HTML 降为次选
  if (!hasPayload) htmlBtn.removeAttribute('title');
  else htmlBtn.title = htmlOk ? '重新序列化当前审核结果为可双击打开的已审 HTML' : FOLDER_HTML_HINT;
}

document.querySelector('#app').innerHTML = `<div class="review-shell"><header class="topbar"><div class="topbar-title"><h1 id="title">离线模型审核</h1></div><div class="actions"><span id="progress" class="topbar-progress" title="审核进度">0 / 0</span><span class="topbar-sep" aria-hidden="true"></span><button id="folder" class="button" type="button" aria-haspopup="menu" aria-expanded="false">打开审核包 ▾</button><span class="topbar-sep" aria-hidden="true"></span><button id="export-zip" class="button primary" type="button" disabled title="打包已审 HTML + JSON + models"><span class="hide-sm">导出已审 ZIP</span><span class="only-sm">导出</span></button><button id="submit-review" class="button primary hide-sm" type="button" hidden title="将当前审核结果回传给开发端（在线预览链接库中变为已审核）">回传审核结果</button><button id="export-more-btn" class="button" type="button" aria-haspopup="menu" aria-expanded="false">导出 ▾</button><span class="topbar-sep" aria-hidden="true"></span><button id="onboarding-help" class="button hide-sm" type="button" title="帮助与引导">?</button><button id="theme-toggle" class="button theme-toggle" type="button" title="切换主题" aria-label="切换到暗色主题">🌙</button><button id="app-settings-toggle" class="button" type="button" title="界面设置（主题 / 字体字号）" aria-label="打开界面设置"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button><button id="mobile-more" class="button only-sm" type="button" title="更多操作" aria-haspopup="menu">更多</button></div></header><main class="workspace"><aside class="sidebar left"><section class="panel course-model-panel"><div class="panel-heading"><h2 id="course-model-title">课程模型</h2><span id="course-model-meta">—</span></div><div id="review-models" class="course-model-list"></div></section><section class="panel tree-panel"><div class="panel-heading"><div class="panel-heading-main"><h2>模型层级</h2><span id="tree-help-slot" class="panel-heading-help"></span></div><span id="nodes">—</span></div><input id="tree-filter" class="tree-filter" type="search" placeholder="搜索零件名" autocomplete="off"><div id="tree-crumb" class="tree-crumb hidden"></div><div id="tree" class="tree"><div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">⌗</div><p class="tree-empty-title">选择模型后显示层级</p><p class="tree-empty-hint">加载审核包并选中模型，这里会列出全部零件</p></div></div></section></aside><section class="stage"><canvas id="canvas"></canvas><div id="folder-drop" class="folder-drop-overlay hidden" aria-hidden="true"><div class="folder-drop-card"><div class="folder-drop-icon" aria-hidden="true">📁</div><h2 class="folder-drop-title">加载审核包</h2><p class="folder-drop-hint">手机端优先打开电脑导出的「已审 HTML」<br class="only-sm"><span class="hide-sm">桌面可将含 <code>project.json</code> 的文件夹拖到此处</span><br class="only-sm">ZIP 需解压后授权整个文件夹，不要只拖 <code>models</code></p><button id="folder-drop-pick" class="button hide-sm" type="button">或点击选择审核包文件夹</button><div id="folder-drop-last" class="folder-drop-last hidden"><span id="folder-drop-last-name" class="folder-drop-last-name"></span><div class="folder-drop-last-actions"><button id="folder-drop-restore" class="button" type="button">打开上次文件夹</button><button id="folder-drop-forget" class="text-button" type="button">忘记</button></div></div></div></div><div class="viewer-hud"><b id="model-title">等待模型</b><span id="hud-status" class="hud-status pending hidden"><span class="hud-status-icon" aria-hidden="true"></span><span class="hud-status-text"></span></span></div><div class="viewer-toolbar"><div class="viewer-explode hidden" id="explode-slider"><input id="explode-range" type="range" min="0" max="100" value="0" aria-label="爆炸程度"><span class="explode-value" id="explode-value">0%</span></div><button id="isolate" class="icon-button hidden" type="button" title="聚焦当前零件，其余半透明 (G)">聚焦零件</button><button id="fit" class="icon-button" type="button" title="还原视角">还原</button><button id="wire" class="icon-button" type="button" title="线框查看">线框</button><button id="explode" class="icon-button" type="button" title="爆炸视图">爆炸</button><button id="labels" class="icon-button" type="button" title="部件标注">标注</button></div></section><aside class="sidebar right"><section class="panel"><div class="panel-heading"><h2>模型结论</h2><span id="model-review-state">-</span></div><label>模型审核要求<textarea id="model-requirement" placeholder="模型结构是否完整，外观与命名是否符合教学需求" readonly></textarea></label><div class="field-stack"><label id="model-status-label">结论</label><div class="segmented" id="model-status" role="radiogroup" aria-labelledby="model-status-label"><button type="button" data-status="pass" role="radio" aria-checked="false">✓ 通过</button><button type="button" data-status="risk" role="radio" aria-checked="false">⚠ 待改</button><button type="button" data-status="block" role="radio" aria-checked="false">⛔ 阻断</button></div><div class="model-status-reset-row"><button id="model-status-reset" class="text-button" type="button" hidden>标为待审核</button></div></div><label>说明<textarea id="model-note"></textarea></label></section><section class="panel"><div class="panel-heading"><h2>当前零件</h2><span id="binding">未选择</span></div><div id="current-part" class="current-part">当前零件：未选择</div><details class="advanced"><summary>高级信息</summary><dl class="facts"><div><dt>节点路径</dt><dd id="node-path">-</dd></div><div><dt>节点标识</dt><dd id="node-id">-</dd></div></dl></details><div class="binding-actions"><button id="replace-node" class="text-button full" type="button" disabled>更换零件</button></div></section><section class="panel"><div class="panel-heading"><div class="panel-title-stack"><h2>问题记录</h2><span class="panel-sub">可记模型或零件</span></div><span id="issue-count">0</span></div><div class="field-stack"><label id="issue-status-label">状态</label><div class="segmented" id="issue-status" role="radiogroup" aria-labelledby="issue-status-label"><button type="button" data-status="pass" role="radio" aria-checked="false">✓ 通过</button><button type="button" data-status="risk" role="radio" aria-checked="false">⚠ 待改</button><button type="button" data-status="block" role="radio" aria-checked="false">⛔ 阻断</button></div></div><label>问题<textarea id="issue-text" placeholder="填写当前模型或零件问题"></textarea></label><div class="issue-actions"><button id="add-model" class="button" type="button">添加模型问题</button><button id="add-node" class="button primary" type="button" disabled>添加当前零件问题</button></div><div id="issues" class="issue-list">${emptyState('⌗', '暂无问题', '选择模型或零件后填写问题')}</div><p id="status" class="status">选择模型后开始审核</p></section></aside></main><footer class="footer"><span id="footer" class="footer-status"></span><span class="footer-version" id="app-version" title="工具版本"></span></footer><nav class="mobile-tabs" aria-label="移动端审核面板"><button type="button" data-mobile-panel="left">层级</button><button type="button" data-mobile-panel="right">审核</button></nav><input id="directory" type="file" webkitdirectory multiple hidden></div><div id="open-menu" class="topbar-more-menu hidden" role="menu" aria-label="打开审核包"><button type="button" data-open="pick" role="menuitem">选择审核包文件夹…</button><button type="button" data-open="restore" role="menuitem" hidden>打开上次文件夹</button></div><div id="export-menu" class="topbar-more-menu hidden" role="menu" aria-label="导出其他格式"><button id="export-html" type="button" role="menuitem" disabled title="重新序列化当前审核结果为可双击打开的已审 HTML">导出已审 HTML</button><button id="export" type="button" role="menuitem" disabled title="导出审核结果 JSON">导出 JSON</button></div><div id="topbar-more-menu" class="topbar-more-menu hidden" role="menu" aria-label="更多操作"><button type="button" data-more="folder" role="menuitem">选择审核包文件夹</button><button type="button" data-more="theme" role="menuitem">切换主题</button><button type="button" data-more="settings" role="menuitem">界面设置</button><button type="button" data-more="help" role="menuitem">帮助与引导</button><button type="button" data-more="zip" role="menuitem">导出已审 ZIP</button><button type="button" data-more="submit" role="menuitem" hidden>回传审核结果</button><button type="button" data-more="html" role="menuitem">导出已审 HTML</button><button type="button" data-more="json" role="menuitem">导出 JSON</button></div>`;

const viewer = createProductViewer({ canvas: $('canvas'), hdriSource: globalThis.__AN_HDR_SOURCE__ || '/hdri/brown_photostudio_02_2k.hdr', getRoot: () => state.loaded.get(state.currentId)?.scene, onEnvironmentReady: () => applyReviewerTheme(document.documentElement.dataset.theme, false) });
const scene = viewer.scene;
const camera = viewer.camera;
const renderer = viewer.renderer;
const controls = viewer.controls;
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
function applyReviewerTheme(theme, persist = true) {
  const dark = theme !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (persist) localStorage.setItem(REVIEWER_THEME_KEY, dark ? 'dark' : 'light');
  viewer.setTheme({ bg: dark ? 0x1a1d20 : 0xe8efe9, env: 1.0, outline: dark ? 0xffb347 : 0x0b6b42, outlineHidden: dark ? 0x6b3a12 : 0x0a2a1a, outlineHalo: dark ? 0x1a1208 : 0x0a0804, outlineHaloHidden: dark ? 0x0a0804 : 0x050a07, hover: dark ? 0xffd9a0 : 0x1a7a50 });
  document.querySelectorAll('#app-settings [data-theme-opt]').forEach((btn) => {
    const on = (btn.dataset.themeOpt === 'dark') === dark;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const themeBtn = document.querySelector('#theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = dark ? '☀️' : '🌙';
    themeBtn.title = dark ? '切换到亮色主题' : '切换到暗色主题';
    themeBtn.setAttribute('aria-label', themeBtn.title);
  }
}
applyReviewerTheme(document.documentElement.dataset.theme, false);
bindSettingsToggle($('app-settings-toggle'), { theme: { get: () => (document.documentElement.dataset.theme !== 'light' ? 'dark' : 'light'), set: (next) => applyReviewerTheme(next) } });
document.querySelector('#theme-toggle')?.addEventListener('click', () => applyReviewerTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
function migrate() { if (!state.payload) return; const project = state.payload.project; project.courses ||= []; if (!project.courses.length) project.courses = [{ courseId: 'uncategorized', code: '', name: '未归类', sortOrder: 1 }]; project.models?.forEach((model) => { model.courseId ||= 'uncategorized'; }); const review = state.payload.review ||= {}; review.byModel ||= {}; (review.issues || []).forEach((issue) => { const record = review.byModel[issue.modelId] ||= { modelStatus: 'pending', modelNote: '', issues: [] }; record.issues.push({ ...issue, scope: issue.persistentNodeId ? 'node' : 'model' }); }); delete review.issues; }
document.querySelector('.review-shell header').insertAdjacentHTML('afterend', `<nav class="course-rail" aria-label="课程选择"><div class="course-rail-main"><button class="rail-scroll" id="review-rail-prev" type="button" aria-label="查看上一组课程">‹</button><div id="review-course-cards" class="course-cards" tabindex="0"></div><button class="rail-scroll" id="review-rail-next" type="button" aria-label="查看下一组课程">›</button></div></nav>`);

function reviewCourseModels(courseId) { return (state.payload?.project?.models || []).filter((model) => model.courseId === courseId).sort((a, b) => a.sortOrder - b.sortOrder); }
function reviewedCount(models) { return models.filter((model) => state.payload.review.byModel?.[model.modelId]?.modelStatus && state.payload.review.byModel[model.modelId].modelStatus !== 'pending').length; }
function modelStatusOf(modelId) { return state.payload?.review?.byModel?.[modelId]?.modelStatus || 'pending'; }
function syncSegmented(root, status) {
  if (!root) return;
  root.querySelectorAll('button[data-status]').forEach((btn) => {
    const on = btn.dataset.status === status;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
function bindSegmented(root, onSelect) {
  if (!root) return;
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-status]');
    if (!btn || !root.contains(btn)) return;
    onSelect(btn.dataset.status);
  });
  root.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const buttons = [...root.querySelectorAll('button[data-status]')];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const delta = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1;
    buttons[(current + delta + buttons.length) % buttons.length].focus();
  });
}
function setModelStatus(status) {
  if (!state.currentId) return;
  const review = modelReview();
  review.modelStatus = status;
  review.updatedAt = now();
  syncExportButtons(true);
  renderReview();
}
function updateHudStatus(model, status) {
  const badge = $('hud-status');
  if (!badge) return;
  if (!model) { badge.classList.add('hidden'); return; }
  const meta = STATUS_META[status] || STATUS_META.pending;
  badge.classList.remove('hidden', 'pending', 'pass', 'risk', 'block');
  badge.classList.add(status || 'pending');
  badge.querySelector('.hud-status-icon').textContent = meta.icon;
  badge.querySelector('.hud-status-text').textContent = meta.label;
}
function renderReviewCourseRail() {
  const project = state.payload?.project;
  if (!project) {
    $('review-course-cards').innerHTML = emptyState('⌗', '加载审核包后显示', '将审核包文件夹拖到中央画布，或点顶栏选择');
    renderCourseModelList({ listEl: $('review-models'), metaEl: $('course-model-meta'), models: [], modelTitle: () => '', onSelectModel: () => {}, emptyHint: '加载审核包后显示' });
    return;
  }
  renderCourseRail({
    cardsEl: $('review-course-cards'),
    courses: project.courses,
    modelsOf: reviewCourseModels,
    metaHtml: (models) => `<span class="course-card-count">${reviewedCount(models)}/${models.length}</span> 已审核`,
    activeCourseId: meta()?.courseId,
    onSelectCourse: (courseId) => {
      const models = reviewCourseModels(courseId);
      const alreadyInCourse = meta()?.courseId === courseId;
      if (!models.length) { renderReviewCourseRail(); return; }
      if (!alreadyInCourse || !models.some((model) => model.modelId === state.currentId)) loadModel(models[0].modelId);
      else renderReviewCourseRail();
    },
  });
  const currentCourseId = meta()?.courseId || null;
  const models = currentCourseId ? reviewCourseModels(currentCourseId) : [];
  renderCourseModelList({
    listEl: $('review-models'),
    metaEl: $('course-model-meta'),
    models,
    currentModelId: state.currentId,
    modelTitle: (model) => model.displayName || model.fileName,
    modelSubtitle: (model) => STATUS_META[modelStatusOf(model.modelId)]?.label || '待审核',
    statusHtml: (model) => {
      const status = modelStatusOf(model.modelId);
      return `<i class="status-dot ${status}" aria-hidden="true"></i>`;
    },
    emptyHint: '选择有模型的课程开始审核',
    onSelectModel: (modelId) => loadModel(modelId),
  });
  updateReviewCourseRailControls();
}
function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
function toggleIsolateSelected() {
  if (!state.selected) { $('status').textContent = '请先选中零件'; return; }
  viewer.toggleIsolate(state.selected);
  applyIsolateUI();
  refreshTree();
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (state.issueMenuIndex >= 0) { closeIssueStatusMenu(); return; }
    if (viewer.isIsolating()) { viewer.clearIsolate(); applyIsolateUI(); refreshTree(); }
    return;
  }
  if (event.key !== 'g' && event.key !== 'G') return;
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  toggleIsolateSelected();
});
$('review-rail-prev').onclick = () => $('review-course-cards').scrollBy({ left: -260, behavior: 'smooth' });
$('review-rail-next').onclick = () => $('review-course-cards').scrollBy({ left: 260, behavior: 'smooth' });

/* —— 移动端：底部抽屉 + 顶栏更多菜单 —— */
function closeTopbarMoreMenu() { $('topbar-more-menu')?.classList.add('hidden'); }
function toggleTopbarMoreMenu() {
  const menu = $('topbar-more-menu');
  if (!menu) return;
  const open = menu.classList.contains('hidden');
  if (!open) { menu.classList.add('hidden'); return; }
  const zip = $('export-zip'), html = $('export-html'), json = $('export');
  menu.querySelector('[data-more="zip"]').disabled = !!zip?.disabled;
  const htmlItem = menu.querySelector('[data-more="html"]');
  htmlItem.hidden = html?.classList.contains('hidden') || !html;
  htmlItem.disabled = !!html?.disabled;
  menu.querySelector('[data-more="json"]').disabled = !!json?.disabled;
  menu.classList.remove('hidden');
}
function setMobilePanel(name) {
  const left = document.querySelector('.sidebar.left');
  const right = document.querySelector('.sidebar.right');
  if (!left || !right) return;
  const target = name === 'left' ? left : right;
  const other = name === 'left' ? right : left;
  const willOpen = !target.classList.contains('is-open');
  other.classList.remove('is-open');
  target.classList.toggle('is-open', willOpen);
  document.querySelectorAll('.mobile-tabs [data-mobile-panel]').forEach((btn) => {
    btn.classList.toggle('is-on', willOpen && btn.dataset.mobilePanel === name);
  });
}
document.querySelectorAll('.mobile-tabs [data-mobile-panel]').forEach((btn) => {
  btn.onclick = () => setMobilePanel(btn.dataset.mobilePanel);
});
$('mobile-more')?.addEventListener('click', (event) => { event.stopPropagation(); toggleTopbarMoreMenu(); });
$('topbar-more-menu')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-more]');
  if (!btn || btn.disabled) return;
  closeTopbarMoreMenu();
  const action = btn.dataset.more;
  if (action === 'folder') toggleTopbarDropdown('open-menu', 'folder');
  else if (action === 'theme') applyReviewerTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  else if (action === 'settings') $('app-settings-toggle')?.click();
  else if (action === 'help') $('onboarding-help').click();
  else if (action === 'zip') exportReviewedZip();
  else if (action === 'submit') armSubmitReviewed(btn);
  else if (action === 'html') exportReviewedHtml();
  else if (action === 'json') exportResult();
});
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('#topbar-more-menu') || event.target.closest('#mobile-more')) return;
  closeTopbarMoreMenu();
  if (event.target.closest('#open-menu') || event.target.closest('#folder') || event.target.closest('#export-menu') || event.target.closest('#export-more-btn')) return;
  closeTopbarDropdowns();
});

/* —— 桌面端顶栏下拉：打开审核包 / 导出 —— */
function closeTopbarDropdowns() {
  ['open-menu', 'export-menu'].forEach((id) => $(id)?.classList.add('hidden'));
  $('folder')?.setAttribute('aria-expanded', 'false');
  $('export-more-btn')?.setAttribute('aria-expanded', 'false');
}
function toggleTopbarDropdown(menuId, anchorId) {
  const menu = $(menuId), anchor = $(anchorId);
  if (!menu || !anchor) return;
  const willOpen = menu.classList.contains('hidden');
  closeTopbarDropdowns();
  if (!willOpen) return;
  if (menuId === 'open-menu') {
    const name = state.pendingLastDirName || getRememberedDirName();
    const restore = menu.querySelector('[data-open="restore"]');
    if (restore) restore.hidden = !name;
  }
  menu.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${Math.round(rect.bottom + 6)}px`;
  menu.style.right = 'auto';
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  anchor.setAttribute('aria-expanded', 'true');
}
$('folder').onclick = (event) => { event.stopPropagation(); toggleTopbarDropdown('open-menu', 'folder'); };
$('open-menu').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-open]');
  if (!btn || btn.hidden) return;
  closeTopbarDropdowns();
  if (btn.dataset.open === 'pick') pickPackageFolder();
  else openLastPackageFolder();
});
$('export-more-btn').onclick = (event) => { event.stopPropagation(); toggleTopbarDropdown('export-menu', 'export-more-btn'); };
$('export-menu').addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (!btn || btn.disabled) return;
  closeTopbarDropdowns();
});
window.addEventListener('resize', closeTopbarDropdowns);
function updateReviewCourseRailControls() { const rail = $('review-course-cards'); $('review-rail-prev').disabled = rail.scrollLeft <= 1; $('review-rail-next').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1; }
$('review-course-cards').addEventListener('scroll', updateReviewCourseRailControls, { passive: true });
window.addEventListener('resize', updateReviewCourseRailControls);
$('issue-status-menu') || document.body.insertAdjacentHTML('beforeend', `<div id="issue-status-menu" class="issue-status-menu hidden" role="menu" aria-label="更改问题状态"><button type="button" data-status="pass" role="menuitem">✓ 通过</button><button type="button" data-status="risk" role="menuitem">⚠ 待改</button><button type="button" data-status="block" role="menuitem">⛔ 阻断</button></div>`);
bindSegmented($('model-status'), setModelStatus);
bindSegmented($('issue-status'), (status) => { state.issueDraftStatus = status; syncSegmented($('issue-status'), status); });
$('model-status-reset').onclick = () => setModelStatus('pending');
$('issue-status-menu').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-status]');
  if (!btn || state.issueMenuIndex < 0) return;
  event.stopPropagation();
  applyIssueStatus(state.issueMenuIndex, btn.dataset.status);
  closeIssueStatusMenu();
});
document.addEventListener('pointerdown', (event) => {
  if (state.issueMenuIndex >= 0 && !event.target.closest('.issue-status-menu') && !event.target.closest('.issue-status-btn')) closeIssueStatusMenu();
});

function meta() { return state.payload?.project?.models?.find((model) => model.modelId === state.currentId); }
function modelReview(id = state.currentId) { const reviews = state.payload.review.byModel ||= {}; return reviews[id] ||= { modelStatus: 'pending', modelNote: '', issues: [] }; }
function path(node, root = state.loaded.get(state.currentId)?.scene) { const items = []; for (let item = node; item && item !== root; item = item.parent) items.unshift(`${item.name || '未命名节点'}[${item.parent ? item.parent.children.indexOf(item) + 1 : 1}]`); return items.join(' / '); }
function resize() { viewer.resize(); }
function fit() { viewer.fit(state.loaded.get(state.currentId)?.scene); }
function highlightMeshes(node) { if (!node) return []; if (node.isMesh) return [node]; return node.children.filter((child) => child.isMesh); }
function reset() { viewer.setOutlineTargets([]); viewer.setSelected(null); }
function updateTreeCrumb() {
  const crumb = $('tree-crumb');
  const model = meta();
  if (!model) { crumb.classList.add('hidden'); crumb.textContent = ''; return; }
  crumb.classList.remove('hidden');
  const parts = [model.displayName || model.fileName];
  if (state.selected) parts.push(nodeDisplayName(state.selected));
  crumb.textContent = parts.join(' / ');
}
function refreshTree() {
  const root = state.loaded.get(state.currentId)?.scene;
  updateTreeCrumb();
  if (!root) {
    $('nodes').textContent = '—';
    $('tree').innerHTML = emptyState('⌗', '选择模型后显示层级', '加载审核包；单击选中零件，G 聚焦零件');
    return;
  }
  $('nodes').textContent = `${meta()?.nodes?.length || 0} 节点`;
  renderTree($('tree'), root, { selected: state.selected, onSelect: selectNode, onIsolate: isolateFromTree, filter: state.treeQuery });
  $('tree').classList.toggle('is-isolating', viewer.isIsolating());
  /* 3D/树选中后把 active 行滚进视口，避免长层级里找不到当前模块 */
  $('tree').querySelector('.tree-node.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}
function syncIsolateButton() {
  const btn = $('isolate');
  if (!btn) return;
  const isolating = viewer.isIsolating();
  btn.classList.toggle('hidden', !state.selected);
  btn.classList.toggle('active', isolating);
  btn.textContent = isolating ? '退出聚焦' : '聚焦零件';
  btn.title = isolating ? '退出聚焦，恢复完整模型 (G)' : '聚焦当前零件，其余半透明 (G)';
}
function applyIsolateUI() {
  const model = meta();
  const isolating = viewer.isIsolating();
  const name = state.selected ? nodeDisplayName(state.selected) : '';
  $('model-title').textContent = !model ? '等待模型' : isolating ? `已选中：${model.displayName || model.fileName} / ${name}` : (model.displayName || model.fileName);
  $('tree').classList.toggle('is-isolating', isolating);
  syncIsolateButton();
}
function isolateFromTree(node) {
  if (!node || !state.currentId) return;
  selectNode(node);
  viewer.toggleIsolate(node);
  applyIsolateUI();
  refreshTree();
}
function selectNode(node) { reset(); state.selected = node; viewer.setSelected(node); viewer.setOutlineTargets(highlightMeshes(node)); const record = meta()?.nodes?.find((item) => item.nodePath === path(node)); $('current-part').textContent = `当前零件：${meta()?.displayName || meta()?.fileName || '模型'} / ${nodeDisplayName(node)}`; $('node-path').textContent = path(node); $('node-id').textContent = record?.persistentNodeId || '-'; $('binding').textContent = record?.candidate ? '候选' : '已定位'; $('add-node').disabled = false; $('replace-node').disabled = false; applyIsolateUI(); refreshTree(); }
function renderModels() {
  const project = state.payload?.project;
  if (!project) return;
  const models = project.models || [];
  const counts = { pending: 0, pass: 0, risk: 0, block: 0 };
  for (const model of models) counts[modelStatusOf(model.modelId)] = (counts[modelStatusOf(model.modelId)] || 0) + 1;
  const reviewed = counts.pass + counts.risk + counts.block;
  const progress = $('progress');
  progress.title = `审核进度 ${reviewed} / ${models.length}（通过 ${counts.pass} · 待改 ${counts.risk} · 阻断 ${counts.block}）`;
  progress.innerHTML = `<span class="progress-lg"><span class="stat pass">${counts.pass}通过</span><span class="stat-sep">·</span><span class="stat risk">${counts.risk}待改</span><span class="stat-sep">·</span><span class="stat block">${counts.block}阻断</span></span><span class="progress-sm">${reviewed}/${models.length}</span>`;
  /* 完成引导：全部审完时主出口呼吸高亮 + 一次性提示 */
  const complete = models.length > 0 && reviewed === models.length;
  document.querySelectorAll('.topbar .actions .button.primary').forEach((btn) => {
    const active = complete && !attnAcknowledged && !btn.disabled && !btn.hidden;
    btn.classList.toggle('attn', active);
  });
  if (complete && !reviewCompleteNotified) {
    reviewCompleteNotified = true;
    const statusEl = $('status');
    if (statusEl) statusEl.textContent = '✓ 审核已全部完成，可回传或导出已审结果';
  }
  renderReviewCourseRail();
}
function renderReview() {
  const review = modelReview(), issues = review.issues || [];
  const model = meta();
  const modelStatus = review.modelStatus || 'pending';
  $('model-requirement').value = model?.requirement || '';
  $('model-note').value = review.modelNote || '';
  syncSegmented($('model-status'), modelStatus);
  const resetBtn = $('model-status-reset');
  if (resetBtn) resetBtn.hidden = modelStatus === 'pending';
  const stateEl = $('model-review-state');
  stateEl.dataset.status = modelStatus;
  stateEl.textContent = modelStatus === 'pending' ? '待审核' : `${STATUS_META[modelStatus].icon} ${STATUS_META[modelStatus].label}`;
  updateHudStatus(model, modelStatus);
  syncSegmented($('issue-status'), state.issueDraftStatus);
  $('issue-count').textContent = `${issues.length}`;
  $('issues').innerHTML = issues.map((issue, index) => {
    const status = STATUS_META[issue.issueStatus] || STATUS_META.risk;
    const title = issue.scope === 'node' ? (issue.nodeName || '未命名零件') : '模型问题';
    return `<article class="issue ${issue.issueStatus} ${issue.scope}" data-issue-index="${index}">
      <button type="button" class="issue-status-btn ${issue.issueStatus}" data-issue-status-btn="${index}" title="更改状态" aria-label="更改问题状态">
        <span aria-hidden="true">${status.icon}</span><span>${status.label}</span>
      </button>
      <div class="issue-body">
        <b>${esc(title)}</b>
        <span>${esc(issue.issueText || '（未填描述）')}</span>
      </div>
      <button class="issue-remove" type="button" data-issue-remove="${index}" title="移除此问题" aria-label="移除此问题">×</button>
    </article>`;
  }).join('') || emptyState('⌗', '暂无问题', '选择模型或零件后填写问题');
  document.querySelectorAll('[data-issue-remove]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); removeIssue(Number(button.dataset.issueRemove)); });
  document.querySelectorAll('[data-issue-status-btn]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); openIssueStatusMenu(Number(button.dataset.issueStatusBtn), button); });
  document.querySelectorAll('[data-issue-index]').forEach((item) => item.onclick = () => locateIssue(issues[Number(item.dataset.issueIndex)]));
  renderModels();
}
async function decode(chunks) { const texts = chunks.map(atob), length = texts.reduce((sum, text) => sum + text.length, 0), bytes = new Uint8Array(length); let index = 0; for (const text of texts) for (let i = 0; i < text.length; i++) bytes[index++] = text.charCodeAt(i); return bytes.buffer; }
async function loadModel(id) { const model = state.payload.project.models.find((item) => item.modelId === id); if (!model) return; const old = state.loaded.get(state.currentId); if (old) { viewer.clearIsolate(); reset(); scene.remove(old.scene); } try { const buffer = model.base64Chunks ? await decode(model.base64Chunks) : await state.files?.get(model.fileName)?.arrayBuffer(); if (!buffer) throw new Error(`目录中找不到 models/${model.fileName}`); const gltf = await loader.parseAsync(buffer, ''); gltf.scene.traverse((node) => { const record = model.nodes?.find((item) => item.nodePath === path(node, gltf.scene)); if (record) node.userData.persistentNodeId = record.persistentNodeId; }); state.loaded.set(id, gltf); state.currentId = id; state.selected = null; viewer.prepareModel(gltf.scene); scene.add(gltf.scene); $('model-title').textContent = model.displayName || model.fileName; $('nodes').textContent = `${model.nodes?.length || 0}`; $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('binding').textContent = '未选择'; $('add-node').disabled = true; $('replace-node').disabled = true; $('status').textContent = ''; syncExportButtons(true); applyIsolateUI(); renderModels(); refreshTree(); renderReview(); fit(); } catch (error) { $('status').textContent = `模型加载失败：${error.message || error}`; } }
async function locateIssue(issue) { if (!issue) return; if (issue.modelId !== state.currentId) await loadModel(issue.modelId); const root = state.loaded.get(issue.modelId)?.scene; if (!root) return; let target; root.traverse((node) => { if (target) return; const record = meta()?.nodes?.find((item) => item.nodePath === path(node, root)); if ((issue.persistentNodeId && record?.persistentNodeId === issue.persistentNodeId) || (!issue.persistentNodeId && issue.nodePath === path(node, root))) target = node; }); if (target) selectNode(target); }
function addIssue(scope) {
  const model = meta(), text = $('issue-text').value.trim();
  if (!model) return;
  if (!text) { $('status').textContent = '请填写问题'; return; }
  if (scope === 'node' && !state.selected) { $('status').textContent = '请先选择节点'; return; }
  const record = scope === 'node' ? model.nodes?.find((item) => item.nodePath === path(state.selected)) : null;
  modelReview().issues.push({
    issueId: crypto.randomUUID?.() || `issue-${Date.now()}`,
    scope,
    projectId: state.payload.project.projectId,
    modelId: model.modelId,
    modelVersion: model.version || '',
    persistentNodeId: record?.persistentNodeId || '',
    nodePath: record?.nodePath || '',
    nodeName: record?.nodeName || '',
    issueStatus: state.issueDraftStatus,
    issueText: text,
    createdAt: now(),
    updatedAt: now(),
  });
  $('issue-text').value = '';
  syncExportButtons(true);
  renderReview();
}
function closeIssueStatusMenu() {
  state.issueMenuIndex = -1;
  $('issue-status-menu')?.classList.add('hidden');
}
function openIssueStatusMenu(index, button) {
  const issue = modelReview().issues[index];
  if (!issue) return;
  const menu = $('issue-status-menu');
  if (!menu) return;
  state.issueMenuIndex = index;
  menu.querySelectorAll('button[data-status]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.status === issue.issueStatus));
  menu.classList.remove('hidden');
  const rect = button.getBoundingClientRect();
  const menuWidth = 140;
  const menuHeight = 120;
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuWidth - 8);
  if (top + menuHeight > window.innerHeight) top = Math.max(8, rect.top - menuHeight - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
function applyIssueStatus(index, status) {
  const issue = modelReview().issues[index];
  if (!issue) return;
  issue.issueStatus = status;
  issue.updatedAt = now();
  syncExportButtons(true);
  renderReview();
}
function removeIssue(index) { const review = modelReview(); if (!review.issues?.[index]) return; review.issues.splice(index, 1); review.updatedAt = now(); syncExportButtons(true); $('status').textContent = '已移除该问题，导出后生效'; renderReview(); }
function exportResult() {
  if (!state.payload?.project) return;
  const review = state.payload.review ||= { byModel: {} };
  review.byModel ||= {};
  const data = { ...review, projectId: state.payload.project.projectId, projectName: state.payload.project.name, exportedAt: now() };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${safeName(state.payload.project.name)}-审核结果.json`);
  $('footer').textContent = 'JSON 审核结果已导出';
}
function buildReviewedPayload() {
  const base = state.payload;
  const review = { ...(base.review || {}) };
  review.byModel ||= {};
  review.projectId = base.project.projectId;
  review.projectName = base.project.name;
  review.projectConclusion = review.projectConclusion || '';
  review.updatedAt = now();
  review.reviewedExportedAt = now();
  return {
    schemaVersion: base.schemaVersion || 2,
    project: base.project,
    review,
    mode: 'inline',
  };
}
function reviewerHtmlShell(data) {
  const runtimeSrc = globalThis.__AN_REVIEWER_RUNTIME_SRC__;
  if (typeof runtimeSrc !== 'string' || !runtimeSrc) throw new Error('缺少审核运行时源，无法导出已审 HTML');
  const embed = `globalThis.__AN_SHARED_CSS__=${JSON.stringify(globalThis.__AN_SHARED_CSS__ || '')};globalThis.__AN_HDR_SOURCE__=${JSON.stringify(globalThis.__AN_HDR_SOURCE__ || '')};globalThis.__AN_REVIEWER_RUNTIME_SRC__=${JSON.stringify(runtimeSrc)};${runtimeSrc}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"><title>离线模型审核（已审）</title></head><body><div id="app"></div><script>window.__AN_REVIEW_PAYLOAD__=${JSON.stringify(data).replace(/</g, '\\u003c')};</script><script>${embed}</script></body></html>`;
}
function exportReviewedHtml() {
  if (!state.payload?.project) return;
  if (!canExportReviewedHtml()) { $('status').textContent = FOLDER_HTML_HINT; $('footer').textContent = FOLDER_HTML_HINT; return; }
  try {
    const html = reviewerHtmlShell(buildReviewedPayload());
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(state.payload.project.name)}-已审-${timestampSlug()}.html`);
    $('footer').textContent = '已审 HTML 已导出';
  } catch (error) {
    $('status').textContent = `已审 HTML 导出失败：${error.message || error}`;
  }
}

/* —— 审核结果在线回传（P3）：仅在线托管且 payload 含回传 Token 时可用 —— */
function canSubmitReview() {
  const token = state.payload?.submitToken;
  if (!token || typeof token !== 'string') return false;
  return /^https?:$/.test(location.protocol);
}
function origReviewFilename() {
  // 原始包名判定：payload 注入（短 ID 托管）与 URL 末段（旧长链托管）双来源，按前缀关系仲裁——
  // 旧服务端上传时会改名（追加时间戳），URL 名以注入名前缀开头 → 用 URL 名（保住时间戳，回传产物才能与原始链接配对去重）；
  // 短 ID 托管下 URL 与注入名无前缀关系 → 用注入名；都没有再回退项目名
  const injected = state.payload?.upload?.origFilename;
  try {
    const last = decodeURIComponent(location.pathname.split('/').pop() || '');
    if (/\.html$/i.test(last) && !last.includes('_archive')) {
      if (!injected) return last;
      if (last.replace(/\.html$/i, '').startsWith(injected.replace(/\.html$/i, ''))) return last;
    }
  } catch { /* 非 /reviews/ 托管时走注入或项目名 */ }
  if (typeof injected === 'string' && /\.html$/i.test(injected)) return injected;
  return `${safeName(state.payload?.project?.name)}-审核器.html`;
}
/* 回传用 XHR：fetch 拿不到上传进度，20MB 级已审 HTML 需要 onprogress 反馈 */
function uploadReviewedWithProgress(url, headers, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0 && onProgress) onProgress((event.loaded / event.total) * 100);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr) : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.send(body);
  });
}

/* 行内二次确认回传：首点变红「确认回传」，3s 超时还原（不依赖浏览器 confirm，可能与删除同款被拦） */
function disarmSubmit(btn) {
  if (btn._armTimer) { clearTimeout(btn._armTimer); btn._armTimer = null; }
  if (!btn.dataset.armed) return;
  delete btn.dataset.armed;
  if (btn.dataset.label) btn.textContent = btn.dataset.label;
  btn.classList.remove('armed');
}
function armSubmitReviewed(btn) {
  if (!btn || btn.disabled || btn.hidden) return;
  if (btn.dataset.armed) { disarmSubmit(btn); submitReviewed(btn); return; }
  disarmSubmit(btn);
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = '确认回传';
  btn.classList.add('armed');
  btn._armTimer = setTimeout(() => disarmSubmit(btn), 3000);
}
/* 按钮形变微交互（Dribbble Confirm 同款）：enter 收缩成圆 + 环形进度，success 对勾描边，fail 红叉抖动。
   颜色走 Token（--fx-ink 随 .primary/失败态切换，见 shared-ui.css）；文字进度保留给读屏与 reduced-motion。 */
const SUBMIT_FX_SVG = '<svg class="btn-fx" viewBox="0 0 36 36" aria-hidden="true"><circle class="btn-fx-track" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="btn-fx-ring" cx="18" cy="18" r="15.5" pathLength="100"/><path class="btn-fx-check" d="M11.5 18.5l4.5 4.5 8.5-9.5" pathLength="100"/><path class="btn-fx-cross" d="M13 13l10 10M23 13l-10 10" pathLength="100"/></svg>';
function setSubmitFx(btn, state, pct = 0) {
  if (!btn) return;
  if (state === 'enter') {
    if (btn.dataset.fx) return;
    btn.dataset.fx = '1';
    const w = btn.offsetWidth;
    const h = btn.offsetHeight;
    const slot = document.createElement('span');
    slot.className = 'btn-slot';
    slot.style.width = `${w}px`;
    slot.style.height = `${h}px`;
    slot.dataset.origW = `${w}px`;
    btn.before(slot);
    slot.appendChild(btn);
    const label = document.createElement('span');
    label.className = 'btn-label';
    while (btn.firstChild) label.appendChild(btn.firstChild);
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', SUBMIT_FX_SVG);
    const live = document.createElement('span');
    live.className = 'btn-fx-live';
    live.setAttribute('aria-live', 'polite');
    btn.appendChild(live);
    btn.classList.add('btn-morph');
    btn.style.width = `${w}px`;
    requestAnimationFrame(() => {
      btn.style.width = `${h}px`; /* 收缩成正圆 */
      slot.style.width = `${h}px`; /* 占位同步收缩，邻居按钮平滑左移 */
      btn.classList.add('is-round');
    });
    return;
  }
  if (state === 'progress') {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    /* 直驱：JS 直接写环的 dashoffset（100→0 画满一圈）。必须带 px 单位——CSS 中无单位数字非法会被静默丢弃 */
    const ring = btn.querySelector('.btn-fx-ring');
    if (ring) ring.style.strokeDashoffset = `${100 - p}px`;
    const live = btn.querySelector('.btn-fx-live');
    if (live) live.textContent = p >= 100 ? '处理中…' : `回传中 ${p}%`;
    return;
  }
  if (state === 'success' || state === 'fail') {
    btn.classList.add(state === 'success' ? 'is-success' : 'is-fail');
    const live = btn.querySelector('.btn-fx-live');
    if (live) live.textContent = state === 'success' ? '回传成功' : '回传失败';
  }
}
function resetSubmitFx(btn) {
  if (!btn || !btn.dataset.fx) return;
  delete btn.dataset.fx;
  btn.classList.remove('btn-morph', 'is-round', 'is-success', 'is-fail');
  btn.style.removeProperty('width');
  const slot = btn.closest('.btn-slot');
  if (slot) {
    const w = slot.dataset.origW;
    if (w) {
      slot.style.width = w; /* 占位动画回原宽，邻居按钮平滑右移 */
      setTimeout(() => {
        btn.style.transition = 'none';
        slot.before(btn);
        slot.remove();
        requestAnimationFrame(() => { btn.style.removeProperty('transition'); });
      }, 260);
    } else {
      btn.style.transition = 'none';
      slot.before(btn);
      slot.remove();
      requestAnimationFrame(() => { btn.style.removeProperty('transition'); });
    }
  }
  btn.querySelector('.btn-fx')?.remove();
  btn.querySelector('.btn-fx-live')?.remove();
  const label = btn.querySelector('.btn-label');
  if (label) label.replaceWith(...label.childNodes);
}
async function submitReviewed(triggerBtn) {
  if (!state.payload?.project || !canSubmitReview()) return;
  if (!canExportReviewedHtml()) { $('status').textContent = FOLDER_HTML_HINT; return; }
  const btn = triggerBtn || $('submit-review');
  const otherCtrls = [$('submit-review'), document.querySelector('#topbar-more-menu [data-more="submit"]')]
    .filter((el) => el && el !== btn);
  btn.disabled = true;
  otherCtrls.forEach((el) => { el.disabled = true; });
  setSubmitFx(btn, 'enter');
  $('status').textContent = '正在回传审核结果…';
  try {
    const html = reviewerHtmlShell(buildReviewedPayload());
    await uploadReviewedWithProgress('/api/reviews/submit', {
      'Content-Type': 'text/html;charset=utf-8',
      'X-ModelQA-Token': state.payload.submitToken,
      'X-Orig-Filename': encodeURIComponent(origReviewFilename()),
    }, html, (pct) => setSubmitFx(btn, 'progress', pct));
    setSubmitFx(btn, 'success');
    $('status').textContent = '';
    $('footer').textContent = '审核结果已回传，开发端可见（已审核）';
    await new Promise((resolve) => setTimeout(resolve, 800)); /* 对勾停留后展开还原 */
  } catch (error) {
    setSubmitFx(btn, 'fail');
    $('status').textContent = `回传失败：${error.message || error}（可重试，或改用「导出已审 HTML」线下回传）`;
    await new Promise((resolve) => setTimeout(resolve, 1200)); /* 红叉抖动停留 */
  } finally {
    resetSubmitFx(btn);
    btn.disabled = false;
    otherCtrls.forEach((el) => { el.disabled = false; });
  }
}
async function collectModelBinaries() {
  const models = state.payload?.project?.models || [];
  const map = new Map();
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
function buildReviewedZipPayload() {
  const payload = buildReviewedPayload();
  payload.mode = 'folder';
  payload.project = {
    ...payload.project,
    models: (payload.project.models || []).map((model) => {
      const { base64Chunks: _dropped, ...rest } = model;
      return { ...rest, fileName: safeName(model.fileName) };
    }),
  };
  return payload;
}
async function buildReviewedZip() {
  const payload = buildReviewedZipPayload();
  const html = reviewerHtmlShell(payload);
  const binaries = await collectModelBinaries();
  const files = {
    '审核器.html': strToU8(html),
    'project.json': strToU8(JSON.stringify(payload.project, null, 2)),
    'review/issues.json': strToU8(JSON.stringify(payload.review, null, 2)),
  };
  for (const [name, bytes] of binaries) files[`models/${name}`] = bytes;
  for (const topic of [FOCUS_PART_TOPIC, LOAD_PACKAGE_TOPIC]) {
    const gifFile = topic.media?.file;
    if (!gifFile) continue;
    try {
      const res = await fetch(topic.base + gifFile);
      if (res.ok) files[`help/focus-part/${gifFile}`] = new Uint8Array(await res.arrayBuffer());
    } catch { /* 离线无 help 资源时跳过 */ }
  }
  return zipSync(files, { level: 0 });
}
async function exportReviewedZip() {
  if (!state.payload?.project) return;
  if (!canExportReviewedZip()) { $('status').textContent = FOLDER_ZIP_HINT; $('footer').textContent = FOLDER_ZIP_HINT; return; }
  try {
    $('status').textContent = '正在打包已审 ZIP…';
    const zipped = await buildReviewedZip();
    downloadBlob(new Blob([zipped], { type: 'application/zip' }), `${safeName(state.payload.project.name)}-已审-${timestampSlug()}.zip`);
    $('status').textContent = '';
    $('footer').textContent = '已审 ZIP 已导出；解压后打开 审核器.html';
  } catch (error) {
    $('status').textContent = `已审 ZIP 导出失败：${error.message || error}`;
  }
}
async function loadDirectory(files, options = {}) {
  const list = [...(files || [])];
  if (!list.length) { $('status').textContent = '未收到文件：请选择或拖入审核包解压根目录'; return false; }
  const projectFile = list.find((file) => file.name === 'project.json');
  if (!projectFile) {
    const hasGlb = list.some((file) => /\.glb$/i.test(file.name));
    $('status').textContent = hasGlb
      ? '未找到 project.json：请拖入审核包解压根目录（含 project.json 与 models），不要只拖 models'
      : '未找到 project.json：请选择/拖入审核包解压根目录';
    refreshFolderDropUI();
    return false;
  }
  try {
    const project = JSON.parse(await projectFile.text());
    const reviewFile = list.find((file) => file.name === 'issues.json');
    const nextPayload = {
      schemaVersion: 2,
      project,
      review: reviewFile ? JSON.parse(await reviewFile.text()) : { projectId: project.projectId, byModel: {} },
      mode: 'folder',
    };
    const nextFiles = new Map(list.map((file) => [file.name, file]));
    state.payload = nextPayload;
    state.files = nextFiles;
    state.loaded.clear();
    state.currentId = null;
    state.selected = null;
    const folderName = options.dirName || packageRootName(list) || getRememberedDirName() || '';
    if (options.dirHandle) await rememberPackageHandle(options.dirHandle, folderName);
    else if (folderName) await rememberPackageHandle(null, folderName);
    state.packageFolderName = folderName;
    migrate();
    syncExportButtons(false);
    $('title').textContent = project.displayTitle || project.name || '离线模型审核';
    $('status').textContent = folderName ? `审核包已加载：${folderName}，可开始审核` : '审核包已加载，可开始审核';
    renderModels();
    if (project.models?.[0]) await loadModel(project.models[0].modelId);
    refreshFolderDropUI();
    window.dispatchEvent(new CustomEvent('an-reviewer:package-loaded'));
    return true;
  } catch (error) {
    $('status').textContent = `审核包读取失败：${error.message || error}`;
  }
  refreshFolderDropUI();
  return false;
}

async function pickPackageFolder() {
  if (supportsDirectoryPicker()) {
    try {
      const handle = await pickPackageDirectory();
      if (!handle) return;
      $('status').textContent = '正在读取审核包文件夹…';
      const files = await collectFilesFromDirectory(handle);
      await loadDirectory(files, { dirHandle: handle, dirName: handle.name });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      /* 权限或 IDB 异常时降级为 webkitdirectory */
    }
  }
  $('directory').click();
}

function updateLastDirUI() {
  const box = $('folder-drop-last');
  const nameEl = $('folder-drop-last-name');
  if (!box || !nameEl) return;
  const name = state.pendingLastDirName || getRememberedDirName();
  if (!name || !needsFolderFiles()) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  nameEl.textContent = `上次文件夹：${name}`;
}

async function restoreLastPackageIfPossible() {
  if (!needsFolderFiles() || !supportsDirectoryPicker()) {
    updateLastDirUI();
    return;
  }
  const result = await tryLoadRememberedPackage();
  if (!result) {
    updateLastDirUI();
    return;
  }
  if (result.files?.length && result.handle) {
    state.pendingLastDirName = '';
    await loadDirectory(result.files, { dirHandle: result.handle, dirName: result.name });
    return;
  }
  state.pendingLastDirName = result.name || '';
  updateLastDirUI();
}

async function openLastPackageFolder() {
  $('status').textContent = '正在打开上次文件夹…';
  const result = await openRememberedPackage();
  if (result.ok) {
    state.pendingLastDirName = '';
    await loadDirectory(result.files, { dirHandle: result.handle, dirName: result.name });
    return;
  }
  if (result.reason === 'no-handle') {
    $('status').textContent = '未记住目录句柄：请重新选择审核包';
    updateLastDirUI();
    pickPackageFolder();
    return;
  }
  if (result.reason === 'denied') $('status').textContent = '未获得文件夹权限：请重新选择审核包';
  else if (result.reason === 'empty') $('status').textContent = '上次文件夹为空或结构已变化，请重新选择';
  else $('status').textContent = '打开上次文件夹失败，请重新选择审核包';
  updateLastDirUI();
}

async function forgetLastPackageFolder() {
  await forgetPackageHandle();
  state.pendingLastDirName = '';
  updateLastDirUI();
  $('status').textContent = '已忘记上次文件夹';
}

async function handleFolderDrop(dataTransfer) {
  const overlay = $('folder-drop');
  overlay?.classList.remove('is-dragover');
  const items = [...(dataTransfer?.items || [])];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    try {
      const handle = await item.getAsFileSystemHandle?.();
      if (handle?.kind === 'directory') {
        $('status').textContent = '正在读取审核包文件夹…';
        const files = await collectFilesFromDirectory(handle);
        await loadDirectory(files, { dirHandle: handle, dirName: handle.name });
        return;
      }
    } catch { /* 回退到 webkit 路径收集 */ }
  }
  const files = await collectDropFiles(dataTransfer);
  await loadDirectory(files);
}

$('tree-filter').oninput = (event) => { state.treeQuery = event.target.value; refreshTree(); };
$('directory').onchange = (event) => { loadDirectory(event.target.files); event.target.value = ''; };
$('folder-drop-pick')?.addEventListener('click', () => { pickPackageFolder(); });
$('folder-drop-restore')?.addEventListener('click', () => { openLastPackageFolder(); });
$('folder-drop-forget')?.addEventListener('click', () => { forgetLastPackageFolder(); });
/* 全页 preventDefault，避免浏览器直接打开 GLB；主 drop 绑定 stage */
window.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
});
const stageEl = document.querySelector('.stage');
stageEl?.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  $('folder-drop')?.classList.add('is-dragover');
});
stageEl?.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
stageEl?.addEventListener('dragleave', (event) => {
  if (event.relatedTarget && stageEl.contains(event.relatedTarget)) return;
  $('folder-drop')?.classList.remove('is-dragover');
});
stageEl?.addEventListener('drop', (event) => {
  if (!event.dataTransfer) return;
  event.preventDefault();
  event.stopPropagation();
  handleFolderDrop(event.dataTransfer);
});
$('fit').onclick = fit; $('wire').onclick = () => { state.wire = !state.wire; viewer.setWireframe(state.wire); $('wire').classList.toggle('active', state.wire); }; $('isolate').onclick = toggleIsolateSelected; bindViewportTools(viewer, { explodeBtn: $('explode'), explodeSlider: $('explode-slider'), explodeRange: $('explode-range'), explodeValue: $('explode-value'), labelsBtn: $('labels') }); $('replace-node').onclick = () => { viewer.clearIsolate(); reset(); state.selected = null; $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('binding').textContent = '未选择'; $('add-node').disabled = true; $('replace-node').disabled = true; applyIsolateUI(); refreshTree(); }; $('add-model').onclick = () => addIssue('model'); $('add-node').onclick = () => addIssue('node'); $('model-note').oninput = (event) => { if (!state.currentId) return; modelReview().modelNote = event.target.value; modelReview().updatedAt = now(); syncExportButtons(true); }; $('export').onclick = () => { attnAcknowledged = true; document.querySelectorAll('.topbar .actions .attn').forEach((b) => b.classList.remove('attn')); exportResult(); };
$('export-html').onclick = () => { attnAcknowledged = true; document.querySelectorAll('.topbar .actions .attn').forEach((b) => b.classList.remove('attn')); exportReviewedHtml(); };
$('export-zip').onclick = () => { attnAcknowledged = true; document.querySelectorAll('.topbar .actions .attn').forEach((b) => b.classList.remove('attn')); exportReviewedZip(); };
$('submit-review').onclick = (event) => { attnAcknowledged = true; document.querySelectorAll('.topbar .actions .attn').forEach((b) => b.classList.remove('attn')); armSubmitReviewed(event.currentTarget); }; /* 隔离态：仅隔离子树内可点选；空白/幽灵不退出，退出只走 ESC / 按钮 / G。点选在 pointerup 判定，位移超过阈值视为旋转不选中 */
const PICK_SLOP_PX = 8;
let pickOrigin = null;
function pickAt(clientX, clientY) {
  const root = state.loaded.get(state.currentId)?.scene;
  if (!root) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(root, true);
  if (viewer.isIsolating()) {
    const solid = hits.find((item) => viewer.isInIsolated(item.object));
    if (solid) selectNode(solid.object);
    return;
  }
  if (hits[0]) selectNode(hits[0].object);
}
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pickOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pickOrigin || event.pointerId !== pickOrigin.id) return;
  const dx = event.clientX - pickOrigin.x;
  const dy = event.clientY - pickOrigin.y;
  const origin = pickOrigin;
  pickOrigin = null;
  if (Math.hypot(dx, dy) > PICK_SLOP_PX) return;
  pickAt(origin.x, origin.y);
});
renderer.domElement.addEventListener('pointercancel', () => { pickOrigin = null; }); resize(); if (state.payload) { migrate(); $('title').textContent = state.payload.project.displayTitle || state.payload.project.name || '离线模型审核'; renderModels(); if (state.payload.project.models?.[0] && !needsFolderFiles()) loadModel(state.payload.project.models[0].modelId); }
refreshFolderDropUI();
if (needsFolderFiles()) $('status').textContent = '手机请优先打开已审 HTML；桌面可拖入或选择审核包文件夹';
restoreLastPackageIfPossible().catch(() => { updateLastDirUI(); });
initReviewerOnboarding({ autoStart: true });
mountHelpHotspot({ mount: document.getElementById('tree-help-slot'), topic: FOCUS_PART_TOPIC });
(() => { const raw = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (globalThis.__APP_VERSION__ || ''); const el = $('app-version'); if (el) el.textContent = raw ? `v${raw}` : ''; })();