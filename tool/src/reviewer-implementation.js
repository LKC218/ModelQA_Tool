import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { renderCourseRail, renderTree, emptyState, nodeDisplayName } from './shared-components.js';
import { createProductViewer } from './shared-viewer.js';

/* 审核端默认亮色工作台，可切换暗色并记忆；注入双端共享 CSS 与审核端独有样式。
   共享 CSS 由 build-reviewer.mjs 构建时经 __AN_SHARED_CSS__ 注入（来源 tool/src/shared-ui.css）。 */
const REVIEWER_THEME_KEY = 'modelqa-reviewer-theme';
document.documentElement.dataset.theme = localStorage.getItem(REVIEWER_THEME_KEY) === 'dark' ? 'dark' : 'light';
document.head.append(Object.assign(document.createElement('style'), { textContent: (globalThis.__AN_SHARED_CSS__ || '') + `
/* —— 审核端独有：状态分段/HUD 徽章/问题清单/进度统计 —— */
/* 分段控件与 HUD 覆盖仅审核端使用，避免与 shared 并发改写冲突 */
.segmented { display: flex; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card); }
.segmented > button { flex: 1 1 0; position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; min-height: 36px; padding: 0 8px 2px; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; transition: color 140ms ease, background 140ms ease, box-shadow 140ms ease; }
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
.panel-sub { color: var(--dim); font-size: 11px; font-weight: 400; line-height: 1.3; }
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
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}
.hud-status-icon { font-size: 16px; line-height: 1; }
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
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
}
.issue.pass { border-left-color: var(--success); background: color-mix(in srgb, var(--success) 7%, var(--card)); }
.issue.risk { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
.issue.block { border-left-color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--card)); }
.issue-body { display: grid; gap: 4px; min-width: 0; }
.issue-body b { min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.issue-body span, .issue-body small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
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
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.issue-status-btn.pass { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); background: color-mix(in srgb, var(--success) 10%, transparent); }
.issue-status-btn.risk { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.issue-status-btn.block { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.issue-remove { flex: 0 0 auto; width: 22px; height: 22px; margin-top: 3px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--dim); font-size: 13px; line-height: 1; opacity: 0; transition: opacity 140ms ease, background 140ms ease, color 140ms ease; }
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
  font-size: 12px;
  font-weight: 700;
  text-align: left;
}
.issue-status-menu button:hover,
.issue-status-menu button.is-on { background: var(--card); }
.issue-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.status-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 999px; background: var(--dim); }
.status-dot.pass { background: var(--success); }
.status-dot.risk { background: var(--accent); }
.status-dot.block { background: var(--danger); }
.status-mini-label { flex: 0 0 auto; font-size: 11px; font-weight: 700; line-height: 1; }
.status-mini-label.pass { color: var(--success); }
.status-mini-label.risk { color: var(--accent); }
.status-mini-label.block { color: var(--danger); }
.topbar-progress { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; color: var(--dim); font-size: 12px; white-space: nowrap; }
.topbar-progress .stat.pass { color: var(--success); }
.topbar-progress .stat.risk { color: var(--accent); }
.topbar-progress .stat.block { color: var(--danger); }
.topbar-progress .stat-sep { color: var(--dim); opacity: 0.7; }
` }));
const $ = (id) => document.getElementById(id); const loader = new GLTFLoader(); const now = () => new Date().toISOString();
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const STATUS_META = {
  pending: { label: '未结论', short: '', icon: '○' },
  pass: { label: '通过', short: '通过', icon: '✓' },
  risk: { label: '待改', short: '待改', icon: '⚠' },
  block: { label: '阻断', short: '阻断', icon: '⛔' },
};
const state = { payload: window.__AN_REVIEW_PAYLOAD__, currentId: null, selected: null, loaded: new Map(), wire: false, files: null, courseMenuId: null, courseQuery: '', issueDraftStatus: 'risk', issueMenuIndex: -1 };
const FOLDER_HTML_HINT = 'ZIP 审核包请导出 JSON；大项目不重导整包 HTML';
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
function syncExportButtons(hasPayload = !!state.payload) {
  const jsonBtn = $('export');
  const htmlBtn = $('export-html');
  if (!jsonBtn) return;
  jsonBtn.disabled = !hasPayload;
  if (!htmlBtn) return;
  const htmlOk = hasPayload && canExportReviewedHtml();
  htmlBtn.disabled = !htmlOk;
  if (!hasPayload) htmlBtn.removeAttribute('title');
  else htmlBtn.title = htmlOk ? '重新序列化当前审核结果为可双击打开的已审 HTML' : FOLDER_HTML_HINT;
}

document.querySelector('#app').innerHTML = `<div class="review-shell"><header class="topbar"><h1 id="title">离线模型审核</h1><div class="actions"><span id="progress" class="topbar-progress" title="审核进度">0 / 0</span><button id="theme-toggle" class="button" type="button" title="切换主题">🌙</button><button id="folder" class="button" type="button">选择审核包文件夹</button><button id="export-html" class="button primary" type="button" disabled>导出已审 HTML</button><button id="export" class="button" type="button" disabled title="导出审核结果 JSON">JSON</button></div></header><main class="workspace"><aside class="sidebar left"><section class="panel tree-panel"><div class="panel-heading"><h2>模型层级</h2><span id="nodes">—</span></div><div id="tree-crumb" class="tree-crumb hidden"></div><div id="tree" class="tree"><div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">⌗</div><p class="tree-empty-title">选择模型后显示层级</p><p class="tree-empty-hint">加载审核包并选中模型，这里会列出全部零件</p></div></div></section></aside><section class="stage"><canvas id="canvas"></canvas><div class="viewer-hud"><b id="model-title">等待模型</b><span id="hud-status" class="hud-status pending hidden"><span class="hud-status-icon" aria-hidden="true"></span><span class="hud-status-text"></span></span></div><div class="viewer-toolbar"><button id="isolate" class="icon-button hidden" type="button" title="淡化其他零件，仅突出当前选中">淡化其他</button><button id="fit" class="icon-button" type="button" title="适配模型">适配</button><button id="wire" class="icon-button" type="button" title="线框查看">线框</button></div></section><aside class="sidebar right"><section class="panel"><div class="panel-heading"><h2>模型结论</h2><span id="model-review-state">-</span></div><label>模型审核要求<textarea id="model-requirement" placeholder="模型结构是否完整，外观与命名是否符合教学需求" readonly></textarea></label><div class="field-stack"><label id="model-status-label">结论</label><div class="segmented" id="model-status" role="radiogroup" aria-labelledby="model-status-label"><button type="button" data-status="pass" role="radio" aria-checked="false">✓ 通过</button><button type="button" data-status="risk" role="radio" aria-checked="false">⚠ 待改</button><button type="button" data-status="block" role="radio" aria-checked="false">⛔ 阻断</button></div><div class="model-status-reset-row"><button id="model-status-reset" class="text-button" type="button" hidden>标为待审核</button></div></div><label>说明<textarea id="model-note"></textarea></label></section><section class="panel"><div class="panel-heading"><h2>当前零件</h2><span id="binding">未选择</span></div><div id="current-part" class="current-part">当前零件：未选择</div><details class="advanced"><summary>高级信息</summary><dl class="facts"><div><dt>节点路径</dt><dd id="node-path">-</dd></div><div><dt>节点标识</dt><dd id="node-id">-</dd></div></dl></details><div class="binding-actions"><button id="replace-node" class="text-button full" type="button" disabled>更换零件</button></div></section><section class="panel"><div class="panel-heading"><div class="panel-title-stack"><h2>问题记录</h2><span class="panel-sub">可记模型或零件</span></div><span id="issue-count">0</span></div><div class="field-stack"><label id="issue-status-label">状态</label><div class="segmented" id="issue-status" role="radiogroup" aria-labelledby="issue-status-label"><button type="button" data-status="pass" role="radio" aria-checked="false">✓ 通过</button><button type="button" data-status="risk" role="radio" aria-checked="false">⚠ 待改</button><button type="button" data-status="block" role="radio" aria-checked="false">⛔ 阻断</button></div></div><label>问题<textarea id="issue-text" placeholder="填写当前模型或零件问题"></textarea></label><div class="issue-actions"><button id="add-model" class="button" type="button">添加模型问题</button><button id="add-node" class="button primary" type="button" disabled>添加当前零件问题</button></div><div id="issues" class="issue-list">${emptyState('⌗', '暂无问题', '选择模型或零件后填写问题')}</div><p id="status" class="status">选择模型后开始审核</p></section></aside></main><footer class="footer"><span id="footer"></span></footer><input id="directory" type="file" webkitdirectory multiple hidden></div>`;

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
  viewer.setTheme({ bg: dark ? 0x1a1d20 : 0xe8efe9, env: 1.0, outline: dark ? 0xffb347 : 0x0b6b42, outlineHidden: dark ? 0x6b3a12 : 0x0a2a1a, outlineHalo: dark ? 0x1a1208 : 0x0a1f14, outlineHaloHidden: dark ? 0x0a0804 : 0x050a07, hover: dark ? 0xffd9a0 : 0x1a7a50 });
  const btn = $('theme-toggle');
  if (btn) { btn.textContent = dark ? '☀️' : '🌙'; btn.title = dark ? '切换到亮色主题' : '切换到暗色主题'; }
}
applyReviewerTheme(document.documentElement.dataset.theme, false);
$('theme-toggle').onclick = () => applyReviewerTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
function migrate() { if (!state.payload) return; const project = state.payload.project; project.courses ||= []; if (!project.courses.length) project.courses = [{ courseId: 'uncategorized', code: '', name: '未归类', sortOrder: 1 }]; project.models?.forEach((model) => { model.courseId ||= 'uncategorized'; }); const review = state.payload.review ||= {}; review.byModel ||= {}; (review.issues || []).forEach((issue) => { const record = review.byModel[issue.modelId] ||= { modelStatus: 'pending', modelNote: '', issues: [] }; record.issues.push({ ...issue, scope: issue.persistentNodeId ? 'node' : 'model' }); }); delete review.issues; }
document.querySelector('.review-shell header').insertAdjacentHTML('afterend', `<nav class="course-rail" aria-label="课程选择"><div class="course-rail-heading"><span class="course-rail-step">选课</span><span id="review-rail-current" class="course-rail-current">选择课程查看模型</span></div><div class="course-rail-main"><button class="rail-scroll" id="review-rail-prev" type="button" aria-label="查看上一组课程">‹</button><div id="review-course-cards" class="course-cards" tabindex="0"></div><button class="rail-scroll" id="review-rail-next" type="button" aria-label="查看下一组课程">›</button></div><div id="review-course-menu" class="course-menu hidden"></div></nav>`);

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
  if (!project) { $('review-course-cards').innerHTML = emptyState('⌗', '加载审核包后显示', '点击「选择审核包文件夹」开始'); $('review-course-menu').classList.add('hidden'); return; }
  renderCourseRail({
    cardsEl: $('review-course-cards'),
    menuEl: $('review-course-menu'),
    courses: project.courses,
    modelsOf: reviewCourseModels,
    modelTitle: (model) => model.displayName || model.fileName,
    metaHtml: (models) => `<span class="course-card-count">${reviewedCount(models)}/${models.length}</span> 已审核`,
    activeCourseId: meta()?.courseId,
    currentModelId: state.currentId,
    menuCourseId: state.courseMenuId,
    query: state.courseQuery,
    onSelectCourse: (courseId) => { const first = reviewCourseModels(courseId)[0]; if (first) loadModel(first.modelId); else { state.courseMenuId = courseId; renderReviewCourseRail(); } },
    onMenuToggle: (courseId) => { state.courseMenuId = state.courseMenuId === courseId ? null : courseId; state.courseQuery = ''; renderReviewCourseRail(); },
    onMenuClose: () => { state.courseMenuId = null; renderReviewCourseRail(); },
    onQueryChange: (value) => { state.courseQuery = value; renderReviewCourseRail(); },
    onMenuModelOpen: (modelId) => { state.courseMenuId = null; loadModel(modelId); },
    rowLeadingHtml: (model) => {
      const status = modelStatusOf(model.modelId);
      const short = STATUS_META[status]?.short || '';
      return `<i class="status-dot ${status}" aria-hidden="true"></i>${short ? `<span class="status-mini-label ${status}">${short}</span>` : ''}`;
    },
  });
  const currentCourse = project.courses.find((course) => course.courseId === meta()?.courseId);
  $('review-rail-current').textContent = currentCourse ? `${currentCourse.code} · ${currentCourse.name}` : '选择课程查看模型';
  updateReviewCourseRailControls();
}
document.addEventListener('pointerdown', (event) => { if (state.courseMenuId && !event.target.closest('.course-rail')) { state.courseMenuId = null; renderReviewCourseRail(); } });
document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (state.issueMenuIndex >= 0) { closeIssueStatusMenu(); return; } if (viewer.isIsolating()) { viewer.clearIsolate(); applyIsolateUI(); refreshTree(); return; } if (state.courseMenuId) { state.courseMenuId = null; renderReviewCourseRail(); } });
$('review-rail-prev').onclick = () => $('review-course-cards').scrollBy({ left: -260, behavior: 'smooth' });
$('review-rail-next').onclick = () => $('review-course-cards').scrollBy({ left: 260, behavior: 'smooth' });
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
    $('tree').innerHTML = emptyState('⌗', '选择模型后显示层级', '加载审核包；单击选中零件，双击淡化其他');
    return;
  }
  $('nodes').textContent = `${meta()?.nodes?.length || 0} 节点`;
  renderTree($('tree'), root, { selected: state.selected, onSelect: selectNode, onIsolate: isolateFromTree });
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
  btn.textContent = isolating ? '退出隔离' : '淡化其他';
  btn.title = isolating ? '退出隔离，恢复完整模型' : '淡化其他零件，仅突出当前选中';
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
  progress.title = `审核进度 ${reviewed} / ${models.length}`;
  progress.innerHTML = `<span class="stat pass">${counts.pass}通过</span><span class="stat-sep">·</span><span class="stat risk">${counts.risk}待改</span><span class="stat-sep">·</span><span class="stat block">${counts.block}阻断</span>`;
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>离线模型审核（已审）</title></head><body><div id="app"></div><script>window.__AN_REVIEW_PAYLOAD__=${JSON.stringify(data).replace(/</g, '\\u003c')};</script><script>${embed}</script></body></html>`;
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
async function loadDirectory(files) { const projectFile = [...files].find((file) => file.name === 'project.json'); if (!projectFile) { $('status').textContent = '请选择审核包解压目录'; return; } try { const project = JSON.parse(await projectFile.text()), reviewFile = [...files].find((file) => file.name === 'issues.json'); state.payload = { schemaVersion: 2, project, review: reviewFile ? JSON.parse(await reviewFile.text()) : { projectId: project.projectId, byModel: {} }, mode: 'folder' }; state.files = new Map([...files].map((file) => [file.name, file])); migrate(); syncExportButtons(false); $('title').textContent = project.displayTitle || project.name || '离线模型审核'; renderModels(); if (project.models?.[0]) await loadModel(project.models[0].modelId); } catch (error) { $('status').textContent = `审核包读取失败：${error.message || error}`; } }

$('folder').onclick = () => $('directory').click(); $('directory').onchange = (event) => loadDirectory(event.target.files); $('fit').onclick = fit; $('wire').onclick = () => { state.wire = !state.wire; viewer.setWireframe(state.wire); $('wire').classList.toggle('active', state.wire); }; $('isolate').onclick = () => { if (!state.selected) return; viewer.toggleIsolate(state.selected); applyIsolateUI(); refreshTree(); }; $('replace-node').onclick = () => { viewer.clearIsolate(); reset(); state.selected = null; $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('binding').textContent = '未选择'; $('add-node').disabled = true; $('replace-node').disabled = true; applyIsolateUI(); refreshTree(); }; $('add-model').onclick = () => addIssue('model'); $('add-node').onclick = () => addIssue('node'); $('model-note').oninput = (event) => { if (!state.currentId) return; modelReview().modelNote = event.target.value; modelReview().updatedAt = now(); syncExportButtons(true); }; $('export').onclick = exportResult; $('export-html').onclick = exportReviewedHtml; renderer.domElement.addEventListener('pointerdown', (event) => { const root = state.loaded.get(state.currentId)?.scene; if (!root || event.button !== 0) return; const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(root, true)[0]; if (viewer.isIsolating()) { if (!hit) { viewer.clearIsolate(); applyIsolateUI(); refreshTree(); } return; } if (hit) selectNode(hit.object); }); resize(); if (state.payload) { migrate(); $('title').textContent = state.payload.project.displayTitle || state.payload.project.name || '离线模型审核'; renderModels(); if (state.payload.project.models?.[0]) loadModel(state.payload.project.models[0].modelId); }
