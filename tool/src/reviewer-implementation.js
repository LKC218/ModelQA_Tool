import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { renderCourseRail, renderTree, emptyState, nodeDisplayName } from './shared-components.js';
import { createProductViewer } from './shared-viewer.js';

/* 审核端默认亮色工作台，可切换暗色并记忆；注入双端共享 CSS 与审核端独有样式。
   共享 CSS 由 build-reviewer.mjs 构建时经 __AN_SHARED_CSS__ 注入（来源 tool/src/shared-ui.css）。 */
const REVIEWER_THEME_KEY = 'modelqa-reviewer-theme';
document.documentElement.dataset.theme = localStorage.getItem(REVIEWER_THEME_KEY) === 'dark' ? 'dark' : 'light';
document.head.append(Object.assign(document.createElement('style'), { textContent: (globalThis.__AN_SHARED_CSS__ || '') + `
/* —— 审核端独有：审核问题卡片与状态色 —— */
.issue-list { display: grid; gap: 4px; min-width: 0; }
.issue { display: grid; gap: 5px; padding: 10px; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius: var(--radius-sm); background: var(--accent-soft); color: var(--text); font-size: 12px; line-height: 1.5; cursor: pointer; }
.issue.model { border-color: var(--line); background: var(--card); }
.issue.pass { border-color: color-mix(in srgb, var(--success) 35%, transparent); background: color-mix(in srgb, var(--success) 8%, transparent); }
.issue.block { border-color: color-mix(in srgb, var(--danger) 40%, transparent); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.issue span, .issue small { color: var(--muted); overflow-wrap: anywhere; }
.issue-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.issue-head b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.issue-remove { flex: 0 0 auto; width: 22px; height: 22px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--dim); font-size: 13px; line-height: 1; opacity: 0; transition: opacity 140ms ease, background 140ms ease, color 140ms ease; }
.issue:hover .issue-remove, .issue-remove:focus-visible { opacity: 1; }
.issue-remove:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
.issue-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.status-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 999px; background: var(--dim); }
.status-dot.pass { background: var(--success); }
.status-dot.risk { background: var(--accent); }
.status-dot.block { background: var(--danger); }
.topbar-progress { flex: 0 0 auto; color: var(--dim); font-size: 12px; }
` }));
const $ = (id) => document.getElementById(id); const loader = new GLTFLoader(); const now = () => new Date().toISOString();
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const state = { payload: window.__AN_REVIEW_PAYLOAD__, currentId: null, selected: null, loaded: new Map(), wire: false, files: null, courseMenuId: null, courseQuery: '' };

document.querySelector('#app').innerHTML = `<div class="review-shell"><header class="topbar"><h1 id="title">离线模型审核</h1><div class="actions"><span id="progress" class="topbar-progress" title="审核进度">0 / 0</span><button id="theme-toggle" class="button" type="button" title="切换主题">🌙</button><button id="folder" class="button" type="button">选择审核包文件夹</button><button id="export" class="button primary" type="button" disabled>导出审核结果</button></div></header><main class="workspace"><aside class="sidebar left"><section class="panel tree-panel"><div class="panel-heading"><h2>模型层级</h2><span id="nodes">—</span></div><div id="tree-crumb" class="tree-crumb hidden"></div><div id="tree" class="tree"><div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">⌗</div><p class="tree-empty-title">选择模型后显示层级</p><p class="tree-empty-hint">加载审核包并选中模型，这里会列出全部零件</p></div></div></section></aside><section class="stage"><canvas id="canvas"></canvas><div class="viewer-hud"><b id="model-title">等待模型</b></div><div class="viewer-toolbar"><button id="fit" class="icon-button" type="button" title="适配模型">适配</button><button id="wire" class="icon-button" type="button" title="线框查看">线框</button></div></section><aside class="sidebar right"><section class="panel"><div class="panel-heading"><h2>当前模型审核</h2><span id="model-review-state">-</span></div><label>模型审核要求<textarea id="model-requirement" placeholder="模型结构是否完整，外观与命名是否符合教学需求" readonly></textarea></label><label>结论<select id="model-status"><option value="pending">待审核</option><option value="pass">通过</option><option value="risk">待修改</option><option value="block">阻断</option></select></label><label>说明<textarea id="model-note"></textarea></label></section><section class="panel"><div class="panel-heading"><h2>问题定位</h2><span id="binding">未选择</span></div><div id="current-part" class="current-part">当前零件：未选择</div><details class="advanced"><summary>高级信息</summary><dl class="facts"><div><dt>节点路径</dt><dd id="node-path">-</dd></div><div><dt>节点标识</dt><dd id="node-id">-</dd></div></dl></details><div class="binding-actions"><button id="replace-node" class="text-button full" type="button" disabled>更换零件</button></div></section><section class="panel"><div class="panel-heading"><h2>审核问题</h2><span id="issue-count">0</span></div><label>状态<select id="issue-status"><option value="risk">待修改</option><option value="pass">通过</option><option value="block">阻断</option></select></label><label>问题<textarea id="issue-text" placeholder="填写当前模型或零件问题"></textarea></label><div class="issue-actions"><button id="add-model" class="button" type="button">添加模型问题</button><button id="add-node" class="button primary" type="button" disabled>添加当前零件问题</button></div><div id="issues" class="issue-list">${emptyState('⌗', '暂无问题', '选择模型或零件后填写问题')}</div><p id="status" class="status">选择模型后开始审核</p></section></aside></main><footer class="footer"><span id="footer"></span></footer><input id="directory" type="file" webkitdirectory multiple hidden></div>`;

const viewer = createProductViewer({ canvas: $('canvas'), hdriSource: globalThis.__AN_HDR_SOURCE__ || '/hdri/brown_photostudio_02_2k.hdr', onEnvironmentReady: () => applyReviewerTheme(document.documentElement.dataset.theme, false) });
const scene = viewer.scene;
const camera = viewer.camera;
const renderer = viewer.renderer;
const controls = viewer.controls;
const outlinePass = viewer.outlinePass;
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
function applyReviewerTheme(theme, persist = true) {
  const dark = theme !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (persist) localStorage.setItem(REVIEWER_THEME_KEY, dark ? 'dark' : 'light');
  viewer.setTheme({ bg: dark ? 0x1a1d20 : 0xe8efe9, env: 1.0, outline: dark ? 0xffb347 : 0x2f9b6a, outlineHidden: dark ? 0x6b3a12 : 0x1a5c3e });
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
    rowLeadingHtml: (model) => `<i class="status-dot ${modelStatusOf(model.modelId)}" aria-hidden="true"></i>`,
  });
  const currentCourse = project.courses.find((course) => course.courseId === meta()?.courseId);
  $('review-rail-current').textContent = currentCourse ? `${currentCourse.code} · ${currentCourse.name}` : '选择课程查看模型';
  updateReviewCourseRailControls();
}
document.addEventListener('pointerdown', (event) => { if (state.courseMenuId && !event.target.closest('.course-rail')) { state.courseMenuId = null; renderReviewCourseRail(); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.courseMenuId) { state.courseMenuId = null; renderReviewCourseRail(); } });
$('review-rail-prev').onclick = () => $('review-course-cards').scrollBy({ left: -260, behavior: 'smooth' });
$('review-rail-next').onclick = () => $('review-course-cards').scrollBy({ left: 260, behavior: 'smooth' });
function updateReviewCourseRailControls() { const rail = $('review-course-cards'); $('review-rail-prev').disabled = rail.scrollLeft <= 1; $('review-rail-next').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1; }
$('review-course-cards').addEventListener('scroll', updateReviewCourseRailControls, { passive: true });
window.addEventListener('resize', updateReviewCourseRailControls);

function meta() { return state.payload?.project?.models?.find((model) => model.modelId === state.currentId); }
function modelReview(id = state.currentId) { const reviews = state.payload.review.byModel ||= {}; return reviews[id] ||= { modelStatus: 'pending', modelNote: '', issues: [] }; }
function path(node, root = state.loaded.get(state.currentId)?.scene) { const items = []; for (let item = node; item && item !== root; item = item.parent) items.unshift(`${item.name || '未命名节点'}[${item.parent ? item.parent.children.indexOf(item) + 1 : 1}]`); return items.join(' / '); }
function resize() { viewer.resize(); }
function fit() { viewer.fit(state.loaded.get(state.currentId)?.scene); }
function highlightMeshes(node) { if (!node) return []; if (node.isMesh) return [node]; return node.children.filter((child) => child.isMesh); }
function reset() { outlinePass.selectedObjects = []; }
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
    $('tree').innerHTML = emptyState('⌗', '选择模型后显示层级', '加载审核包并选中模型，这里会列出全部零件');
    return;
  }
  $('nodes').textContent = `${meta()?.nodes?.length || 0} 节点`;
  renderTree($('tree'), root, { selected: state.selected, onSelect: selectNode });
}
function selectNode(node) { reset(); state.selected = node; outlinePass.selectedObjects = highlightMeshes(node); const record = meta()?.nodes?.find((item) => item.nodePath === path(node)); $('current-part').textContent = `当前零件：${meta()?.displayName || meta()?.fileName || '模型'} / ${nodeDisplayName(node)}`; $('node-path').textContent = path(node); $('node-id').textContent = record?.persistentNodeId || '-'; $('binding').textContent = record?.candidate ? '候选' : '已定位'; $('add-node').disabled = false; $('replace-node').disabled = false; refreshTree(); }
function renderModels() { const project = state.payload?.project; if (!project) return; const reviewed = project.models.filter((model) => modelReview(model.modelId).modelStatus !== 'pending').length; $('progress').textContent = `${reviewed} / ${project.models.length}`; renderReviewCourseRail(); }
function renderReview() { const review = modelReview(), issues = review.issues || []; const model = meta(); $('model-requirement').value = model?.requirement || ''; $('model-status').value = review.modelStatus || 'pending'; $('model-note').value = review.modelNote || ''; $('model-review-state').textContent = review.modelStatus === 'pending' ? '待审核' : $('model-status').selectedOptions[0].textContent; $('issue-count').textContent = `${issues.length}`; $('issues').innerHTML = issues.map((issue, index) => `<article class="issue ${issue.issueStatus} ${issue.scope}" data-issue-index="${index}"><div class="issue-head"><b>${esc(issue.scope === 'node' ? issue.nodeName : '模型问题')}</b><button class="issue-remove" type="button" data-issue-remove="${index}" title="移除此问题" aria-label="移除此问题">×</button></div><span>${esc(issue.issueText)}</span>${issue.scope === 'node' ? `<small>${esc(issue.persistentNodeId || '未绑定稳定 ID')}</small>` : ''}</article>`).join('') || emptyState('⌗', '暂无问题', '选择模型或零件后填写问题'); document.querySelectorAll('[data-issue-remove]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); removeIssue(Number(button.dataset.issueRemove)); }); document.querySelectorAll('[data-issue-index]').forEach((item) => item.onclick = () => locateIssue(issues[Number(item.dataset.issueIndex)])); renderModels(); }
async function decode(chunks) { const texts = chunks.map(atob), length = texts.reduce((sum, text) => sum + text.length, 0), bytes = new Uint8Array(length); let index = 0; for (const text of texts) for (let i = 0; i < text.length; i++) bytes[index++] = text.charCodeAt(i); return bytes.buffer; }
async function loadModel(id) { const model = state.payload.project.models.find((item) => item.modelId === id); if (!model) return; const old = state.loaded.get(state.currentId); if (old) { reset(old.scene); scene.remove(old.scene); } try { const buffer = model.base64Chunks ? await decode(model.base64Chunks) : await state.files?.get(model.fileName)?.arrayBuffer(); if (!buffer) throw new Error(`目录中找不到 models/${model.fileName}`); const gltf = await loader.parseAsync(buffer, ''); gltf.scene.traverse((node) => { const record = model.nodes?.find((item) => item.nodePath === path(node, gltf.scene)); if (record) node.userData.persistentNodeId = record.persistentNodeId; }); state.loaded.set(id, gltf); state.currentId = id; state.selected = null; viewer.prepareModel(gltf.scene); scene.add(gltf.scene); $('model-title').textContent = model.displayName || model.fileName; $('nodes').textContent = `${model.nodes?.length || 0}`; $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('binding').textContent = '未选择'; $('add-node').disabled = true; $('replace-node').disabled = true; $('status').textContent = ''; $('export').disabled = false; renderModels(); refreshTree(); renderReview(); fit(); } catch (error) { $('status').textContent = `模型加载失败：${error.message || error}`; } }
async function locateIssue(issue) { if (!issue) return; if (issue.modelId !== state.currentId) await loadModel(issue.modelId); const root = state.loaded.get(issue.modelId)?.scene; if (!root) return; let target; root.traverse((node) => { if (target) return; const record = meta()?.nodes?.find((item) => item.nodePath === path(node, root)); if ((issue.persistentNodeId && record?.persistentNodeId === issue.persistentNodeId) || (!issue.persistentNodeId && issue.nodePath === path(node, root))) target = node; }); if (target) selectNode(target); }
function addIssue(scope) { const model = meta(), text = $('issue-text').value.trim(); if (!model) return; if (!text) { $('status').textContent = '请填写问题'; return; } if (scope === 'node' && !state.selected) { $('status').textContent = '请先选择节点'; return; } const record = scope === 'node' ? model.nodes?.find((item) => item.nodePath === path(state.selected)) : null; modelReview().issues.push({ issueId: crypto.randomUUID?.() || `issue-${Date.now()}`, scope, projectId: state.payload.project.projectId, modelId: model.modelId, modelVersion: model.version || '', persistentNodeId: record?.persistentNodeId || '', nodePath: record?.nodePath || '', nodeName: record?.nodeName || '', issueStatus: $('issue-status').value, issueText: text, createdAt: now(), updatedAt: now() }); $('issue-text').value = ''; $('export').disabled = false; renderReview(); }
function removeIssue(index) { const review = modelReview(); if (!review.issues?.[index]) return; review.issues.splice(index, 1); review.updatedAt = now(); $('export').disabled = false; $('status').textContent = '已移除该问题，导出后生效'; renderReview(); }
function exportResult() { const data = { ...state.payload.review, projectId: state.payload.project.projectId, projectName: state.payload.project.name, exportedAt: now() }, url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), link = document.createElement('a'); link.href = url; link.download = `${(state.payload.project.name || '审核项目').replace(/[\\/:*?"<>|]/g, '_')}-审核结果.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('footer').textContent = '审核结果已导出'; }
async function loadDirectory(files) { const projectFile = [...files].find((file) => file.name === 'project.json'); if (!projectFile) { $('status').textContent = '请选择审核包解压目录'; return; } try { const project = JSON.parse(await projectFile.text()), reviewFile = [...files].find((file) => file.name === 'issues.json'); state.payload = { schemaVersion: 2, project, review: reviewFile ? JSON.parse(await reviewFile.text()) : { projectId: project.projectId, byModel: {} } }; state.files = new Map([...files].map((file) => [file.name, file])); migrate(); $('title').textContent = project.displayTitle || project.name || '离线模型审核'; renderModels(); if (project.models?.[0]) await loadModel(project.models[0].modelId); } catch (error) { $('status').textContent = `审核包读取失败：${error.message || error}`; } }

$('folder').onclick = () => $('directory').click(); $('directory').onchange = (event) => loadDirectory(event.target.files); $('fit').onclick = fit; $('wire').onclick = () => { state.wire = !state.wire; state.loaded.get(state.currentId)?.scene.traverse((node) => node.isMesh && (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => material.wireframe = state.wire)); $('wire').classList.toggle('active', state.wire); }; $('replace-node').onclick = () => { reset(state.loaded.get(state.currentId)?.scene); state.selected = null; $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('binding').textContent = '未选择'; $('add-node').disabled = true; $('replace-node').disabled = true; refreshTree(); }; $('add-model').onclick = () => addIssue('model'); $('add-node').onclick = () => addIssue('node'); $('model-status').onchange = (event) => { if (!state.currentId) return; modelReview().modelStatus = event.target.value; modelReview().updatedAt = now(); $('export').disabled = false; renderReview(); }; $('model-note').oninput = (event) => { if (!state.currentId) return; modelReview().modelNote = event.target.value; modelReview().updatedAt = now(); $('export').disabled = false; }; $('export').onclick = exportResult; renderer.domElement.addEventListener('pointerdown', (event) => { const root = state.loaded.get(state.currentId)?.scene; if (!root || event.button !== 0) return; const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(root, true)[0]; if (hit) selectNode(hit.object); }); resize(); if (state.payload) { migrate(); $('title').textContent = state.payload.project.displayTitle || state.payload.project.name || '离线模型审核'; renderModels(); if (state.payload.project.models?.[0]) loadModel(state.payload.project.models[0].modelId); }
