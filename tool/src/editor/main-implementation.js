import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { createProductViewer } from '../shared/shared-viewer.js';
import reviewerRuntime from '../generated/reviewer-runtime.js?raw';
import { renderCourseRail, renderCourseModelList, renderTree, emptyState, nodeDisplayName } from '../shared/shared-components.js';
import { mountHelpHotspot, FOCUS_PART_TOPIC } from '../shared/shared-help-hotspot.js';
import '../shared/shared-ui.css';
import './styles.css';

const LIMIT = 20 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const loader = new GLTFLoader();
const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const safeName = (value) => String(value || '审核项目').replace(/[\\/:*?"<>|]/g, '_').trim() || '审核项目';
const defaultCourses = [['AN-01', '二极管认知与检测'], ['AN-02', '整流电路连接与检测'], ['AN-03', '滤波电路'], ['AN-04', '晶体管认知与检测'], ['AN-05', '单管放大电路'], ['AN-06', '集成运放认识'], ['AN-07', '转向灯不闪光故障检修']].map(([code, name], index) => ({ courseId: `course-${code}`, code, name, sortOrder: index + 1 }));
const state = { project: { projectId: 'AN-REVIEW-001', displayTitle: '4. 模拟电路实训室', name: '模拟电路实训室', version: 'V1.0', templateVersion: '1.2', courses: defaultCourses }, models: [], reviews: { byModel: {} }, currentId: null, selected: null, selectedCourseId: null, treeQuery: '', draggedModelId: null, wire: false };

document.querySelector('#app').innerHTML = `<div class="tool-shell"><header class="topbar"><div class="topbar-title"><h1 id="project-title">4. 模拟电路实训室</h1><div class="topbar-course-subtitle" id="course-subtitle"><span class="course-subtitle-step">选课</span><span id="rail-current" class="course-subtitle-current" title="">点击卡片选择导入课程</span></div></div><div class="actions"><button class="button theme-toggle" id="theme-toggle" type="button" title="切换主题" aria-label="切换到暗色主题">🌙</button><div class="draft-menu"><button class="button" id="draft-toggle" type="button" title="草稿列表" aria-haspopup="listbox" aria-expanded="false"><span id="draft-current-name">草稿</span> ▾</button><div class="draft-panel hidden" id="draft-panel" role="listbox" aria-label="草稿列表"><div class="draft-panel-head">草稿列表<span class="draft-panel-hint">上限 10 条</span></div><div id="draft-list" class="draft-list"></div><div class="draft-panel-actions"><button class="button" id="draft-new" type="button">新建草稿</button><button class="button" id="draft-saveas" type="button">另存为</button></div></div></div><button class="button" id="save" type="button" title="立即保存当前草稿">立即保存</button><button class="button" id="open-settings" type="button" title="项目信息与课程编辑">项目设置</button><button class="button primary" id="export">导出审核包</button></div></header><nav class="course-rail" aria-label="课程选择"><div class="course-rail-main"><button class="rail-scroll" id="rail-prev" type="button" aria-label="查看上一组课程">‹</button><div id="course-cards" class="course-cards" tabindex="0"></div><button class="rail-scroll" id="rail-next" type="button" aria-label="查看下一组课程">›</button><button class="button rail-import" id="rail-import" type="button" disabled>先选择课程</button></div></nav><main class="workspace"><aside class="sidebar left"><section class="panel course-model-panel"><div class="panel-heading"><h2 id="course-model-title">课程模型</h2><span id="course-model-meta">—</span></div><input id="files" type="file" accept=".glb,model/gltf-binary" multiple hidden><div id="models" class="course-model-list"></div></section><section class="panel tree-panel"><div class="panel-heading"><div class="panel-heading-main"><h2>模型层级</h2><span id="tree-help-slot" class="panel-heading-help"></span></div><span id="nodes">—</span></div><input id="tree-filter" class="tree-filter" type="search" placeholder="搜索零件名" autocomplete="off"><div id="tree-crumb" class="tree-crumb hidden"></div><div id="tree" class="tree"><div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">⌗</div><p class="tree-empty-title">选择模型后显示层级</p><p class="tree-empty-hint">导入 GLB 并选中模型；单击选中零件，G 聚焦零件</p></div></div></section></aside><section class="center"><div id="viewer" class="viewer-view"><canvas id="canvas"></canvas><div class="viewer-hud"><b id="hud">未选择模型</b></div><div class="viewer-toolbar"><button class="icon-button hidden" id="isolate" type="button" title="聚焦当前零件，其余半透明">聚焦零件</button><button class="icon-button" id="fit" title="还原视角">还原</button><button class="icon-button" id="wire" title="线框查看">线框</button></div></div></section><aside class="sidebar right"><section class="panel"><div class="panel-heading"><h2>当前模型</h2><span id="model-state">-</span></div><label>名称<input id="model-name" disabled></label><label>所属课程<select id="model-course" disabled></select></label><label>审核要求<textarea id="model-requirement" placeholder="模型结构是否完整，外观与命名是否符合教学需求" disabled></textarea></label></section><section class="panel"><div class="panel-heading"><h2>问题定位</h2><span id="binding">-</span></div><div id="current-part" class="current-part">当前零件：未选择</div><details class="advanced"><summary>高级信息</summary><dl class="facts"><div><dt>节点路径</dt><dd id="node-path">-</dd></div><div><dt>节点标识</dt><dd id="node-id">-</dd></div></dl><label>persistentNodeId<input id="persistent-id" disabled></label></details><div class="binding-actions"><button class="button full" id="apply-id" disabled>将问题关联到此零件</button><button class="text-button full" id="replace-node" disabled>更换零件</button></div></section><section class="panel package-panel"><div class="panel-heading"><h2>审核包</h2><span id="bytes">0 B</span></div><button class="button primary full" id="single" disabled>单 HTML</button><button class="button full" id="zip" disabled>ZIP</button><p id="status" class="status">选择课程后可导入模型</p></section></aside></main><footer class="footer"><span id="footer">草稿未保存</span></footer><div id="drawer" class="drawer hidden" aria-hidden="true"><div class="drawer-mask" id="drawer-mask"></div><aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="项目设置"><div class="panel-heading"><h2>项目设置</h2><button class="icon-button" id="close-settings" type="button" aria-label="关闭项目设置">×</button></div><div class="config-block"><h2>项目信息</h2><div class="field-grid"><label>项目标题<input id="display-title" value="4. 模拟电路实训室"></label><label>项目编号<input id="project-id" value="AN-REVIEW-001"></label><label>项目名称<input id="project-name" value="模拟电路实训室"></label><label>版本<input id="project-version" value="V1.0"></label></div></div><div class="config-block"><div class="panel-heading"><h2>课程</h2><button class="text-button" id="add-course" type="button">添加课程</button></div><div id="course-editor" class="course-editor"></div></div></aside></div></div>`;

const THEME_KEY = 'modelqa-theme';
function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function themeTokens(theme) {
  return theme === 'dark'
    ? { bg: 0x1a1d20, outline: 0xffb347, outlineHidden: 0x6b3a12, outlineHalo: 0x1a1208, outlineHaloHidden: 0x0a0804, env: 1.0, hover: 0xffd9a0 }
    : { bg: 0xe8efe9, outline: 0x0b6b42, outlineHidden: 0x0a2a1a, outlineHalo: 0x0a1f14, outlineHaloHidden: 0x050a07, env: 1.0, hover: 0x1a7a50 };
}
function applyTheme(theme, persist = true) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist) localStorage.setItem(THEME_KEY, next);
  const tokens = themeTokens(next);
  viewer.setTheme(tokens);
  const btn = $('theme-toggle');
  if (btn) {
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
    btn.title = next === 'dark' ? '切换到亮色主题' : '切换到暗色主题';
    btn.setAttribute('aria-label', btn.title);
  }
}
document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';

const viewer = createProductViewer({ canvas: $('canvas'), resizeSource: document.querySelector('.center'), getRoot: () => current()?.gltf.scene, onEnvironmentReady: () => applyTheme(currentTheme(), false) });
const scene = viewer.scene;
const camera = viewer.camera;
const renderer = viewer.renderer;
const controls = viewer.controls;
applyTheme(currentTheme(), false);
$('theme-toggle').onclick = () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
const current = () => state.models.find((model) => model.modelId === state.currentId);
const selectedCourse = () => state.project.courses.find((course) => course.courseId === state.selectedCourseId);
const size = (bytes) => !bytes ? '0 B' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function path(node, root = current()?.gltf.scene) { const parts = []; for (let item = node; item && item !== root; item = item.parent) parts.unshift(`${item.name || '未命名节点'}[${item.parent ? item.parent.children.indexOf(item) + 1 : 1}]`); return parts.join(' / '); }
function candidate(node, root) { return `path:${path(node, root).replace(/\s+/g, '')}`; }
function syncProject() { state.project = { ...state.project, displayTitle: $('display-title').value.trim(), projectId: $('project-id').value.trim(), name: $('project-name').value.trim(), version: $('project-version').value.trim() }; $('project-title').textContent = state.project.displayTitle || state.project.name || '未命名项目'; }
/* —— 多槽草稿：索引 + 当前槽 + 旧 key 迁移 —— */
const DRAFTS_KEY = 'an-review-drafts';
const ACTIVE_KEY = 'an-review-active';
const DRAFT_PREFIX = 'an-review-draft:';
const LEGACY_DRAFT_KEY = 'an-review-draft';
const DRAFT_LIMIT = 10;
const DRAFT_DEBOUNCE_MS = 1500;
let draftDirty = false;
let draftSaveTimer = null;
let pendingModelMeta = [];

function listDrafts() { try { const list = JSON.parse(localStorage.getItem(DRAFTS_KEY)); return Array.isArray(list) ? list : []; } catch { return []; } }
function saveDraftList(list) { localStorage.setItem(DRAFTS_KEY, JSON.stringify(list)); }
function activeDraftId() { return localStorage.getItem(ACTIVE_KEY) || ''; }
function setActiveDraftId(id) { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); }
function readDraftPayload(id) { if (!id) return null; try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + id)); } catch { return null; } }
function defaultDraftName() { return state.project?.name || state.project?.displayTitle || '未命名草稿'; }
function draftTimeLabel(iso) { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const pad = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function buildDraftPayload() { syncProject(); return { project: state.project, models: projectData().models, review: state.reviews, savedAt: now() }; }

function pruneDraftList(list, keepId) {
  while (list.length > DRAFT_LIMIT) {
    let victimIndex = -1;
    for (let i = list.length - 1; i >= 0; i--) { if (list[i].id !== keepId) { victimIndex = i; break; } }
    if (victimIndex < 0) break;
    localStorage.removeItem(DRAFT_PREFIX + list[victimIndex].id);
    list.splice(victimIndex, 1);
  }
  return list;
}

function writeDraft(id, name) {
  if (!id) return false;
  try {
    const payload = buildDraftPayload();
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(payload));
    let list = listDrafts();
    const meta = list.find((item) => item.id === id);
    if (meta) { meta.savedAt = payload.savedAt; if (name) meta.name = name; }
    else list.unshift({ id, name: name || defaultDraftName(), savedAt: payload.savedAt });
    list = pruneDraftList(list, id);
    saveDraftList(list);
    setActiveDraftId(id);
    draftDirty = false;
    refreshDraftUI();
    return true;
  } catch {
    setStatus('草稿保存失败（本地存储可能已满）', 'error');
    return false;
  }
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    let id = activeDraftId();
    if (!id) { id = uid('draft'); }
    if (writeDraft(id)) {
      const meta = listDrafts().find((item) => item.id === id);
      $('footer').textContent = `草稿「${meta?.name || ''}」已自动保存 ${draftTimeLabel(meta?.savedAt) || ''}`.trim();
    }
  }, DRAFT_DEBOUNCE_MS);
}

function markDraft(text = '草稿待保存') {
  draftDirty = true;
  $('footer').textContent = text;
  scheduleDraftSave();
}

function flushDraftSave() {
  clearTimeout(draftSaveTimer);
  if (!draftDirty) return;
  let id = activeDraftId();
  if (!id) id = uid('draft');
  if (writeDraft(id)) {
    const meta = listDrafts().find((item) => item.id === id);
    $('footer').textContent = `草稿「${meta?.name || ''}」已保存`.trim();
  }
}

function clearWorkspaceModels() {
  const old = current();
  if (old) {
    viewer.clearIsolate();
    resetHighlight();
    scene.remove(old.gltf.scene);
    disposeObject(old.gltf.scene);
  }
  state.currentId = null;
  state.selected = null;
  state.models = [];
  pendingModelMeta = [];
  $('hud').textContent = '未选择模型';
  clearNodePanel();
}

function applyDraftContent(draft) {
  clearWorkspaceModels();
  state.project = {
    ...state.project,
    ...draft.project,
    courses: draft.project?.courses?.length ? draft.project.courses : defaultCourses.map((course) => ({ ...course })),
  };
  state.reviews = draft.review || { byModel: {} };
  pendingModelMeta = Array.isArray(draft.models) ? draft.models : [];
  state.selectedCourseId = null;
  const fieldMap = { displayTitle: 'display-title', projectId: 'project-id', name: 'project-name', version: 'project-version' };
  Object.entries(fieldMap).forEach(([key, id]) => { $(id).value = state.project[key] || ''; });
  refreshAll();
}

function migrateLegacyDraft() {
  const raw = localStorage.getItem(LEGACY_DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    const id = uid('draft');
    const savedAt = draft.savedAt || now();
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({
      project: draft.project,
      models: draft.models || [],
      review: draft.review || { byModel: {} },
      savedAt,
    }));
    const list = listDrafts();
    list.unshift({ id, name: draft.project?.name || '迁移草稿', savedAt });
    saveDraftList(pruneDraftList(list, id));
    setActiveDraftId(id);
  } catch { /* ignore broken legacy */ }
  localStorage.removeItem(LEGACY_DRAFT_KEY);
}

function restoreDraftById(id) {
  const draft = readDraftPayload(id);
  if (!draft) return false;
  applyDraftContent(draft);
  setActiveDraftId(id);
  draftDirty = false;
  return true;
}

function promptDraftName(fallback) {
  const input = prompt('草稿名称', fallback || defaultDraftName());
  if (input === null) return null;
  return input.trim() || '未命名草稿';
}

function closeDraftPanel() {
  $('draft-panel').classList.add('hidden');
  $('draft-toggle').setAttribute('aria-expanded', 'false');
}

function openDraftPanel() {
  refreshDraftUI();
  $('draft-panel').classList.remove('hidden');
  $('draft-toggle').setAttribute('aria-expanded', 'true');
}

function refreshDraftUI() {
  const list = listDrafts();
  const activeId = activeDraftId();
  const activeMeta = list.find((item) => item.id === activeId);
  const nameEl = $('draft-current-name');
  if (nameEl) nameEl.textContent = activeMeta?.name || '草稿';
  const listEl = $('draft-list');
  if (!listEl) return;
  if (!list.length) {
    listEl.innerHTML = '<div class="draft-empty">暂无草稿，编辑后会自动保存</div>';
    return;
  }
  listEl.innerHTML = list.map((item) => `<div class="draft-item${item.id === activeId ? ' active' : ''}" data-id="${item.id}" role="option" aria-selected="${item.id === activeId}"><button type="button" class="draft-item-main" data-action="switch" title="切换到该草稿"><span class="draft-item-name">${esc(item.name)}</span><span class="draft-item-time">${esc(draftTimeLabel(item.savedAt))}</span></button><div class="draft-item-ops"><button type="button" class="draft-op" data-action="rename" title="重命名">改</button><button type="button" class="draft-op" data-action="saveas" title="另存为新草稿">存</button><button type="button" class="draft-op" data-action="copy" title="复制草稿">复</button><button type="button" class="draft-op danger" data-action="delete" title="删除草稿">删</button></div></div>`).join('');
  listEl.querySelectorAll('.draft-item').forEach((row) => {
    const id = row.dataset.id;
    row.querySelectorAll('[data-action]').forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'switch') switchDraft(id);
        else if (action === 'rename') renameDraft(id);
        else if (action === 'saveas') saveDraftAs();
        else if (action === 'copy') copyDraft(id);
        else if (action === 'delete') deleteDraft(id);
      };
    });
  });
}

function switchDraft(id) {
  if (id === activeDraftId()) { closeDraftPanel(); return; }
  if (draftDirty && !confirm('当前草稿有未保存改动，切换后将丢失。继续切换？')) return;
  if (!restoreDraftById(id)) { setStatus('草稿不存在或已损坏', 'error'); return; }
  const meta = listDrafts().find((item) => item.id === id);
  $('footer').textContent = `已切换到草稿「${meta?.name || ''}」；请重新导入 GLB`;
  refreshDraftUI();
  closeDraftPanel();
}

function createDraftFromCurrent(name) {
  const id = uid('draft');
  if (!writeDraft(id, name)) return;
  setActiveDraftId(id);
  $('footer').textContent = `已创建草稿「${name}」`;
  refreshDraftUI();
}

function saveDraftAs() {
  const name = promptDraftName(`${defaultDraftName()}-副本`);
  if (name === null) return;
  createDraftFromCurrent(name);
  closeDraftPanel();
}

function newDraft() {
  if (draftDirty) flushDraftSave();
  if (!confirm('新建空白草稿会切换到空白项目，当前草稿已保留。继续？')) return;
  const name = promptDraftName(defaultDraftName());
  if (name === null) return;
  const id = uid('draft');
  clearWorkspaceModels();
  state.project = { projectId: 'AN-REVIEW-001', displayTitle: '4. 模拟电路实训室', name: '模拟电路实训室', version: 'V1.0', templateVersion: '1.2', courses: defaultCourses.map((course) => ({ ...course })) };
  state.reviews = { byModel: {} };
  state.selectedCourseId = null;
  const fieldMap = { displayTitle: 'display-title', projectId: 'project-id', name: 'project-name', version: 'project-version' };
  Object.entries(fieldMap).forEach(([key, fieldId]) => { $(fieldId).value = state.project[key] || ''; });
  refreshAll();
  writeDraft(id, name);
  $('footer').textContent = `已新建草稿「${name}」；请导入 GLB`;
  refreshDraftUI();
  closeDraftPanel();
}

function renameDraft(id) {
  const list = listDrafts();
  const meta = list.find((item) => item.id === id);
  if (!meta) return;
  const name = promptDraftName(meta.name);
  if (name === null || name === meta.name) return;
  meta.name = name;
  saveDraftList(list);
  refreshDraftUI();
  setStatus(`草稿已重命名为「${name}」`, 'ok');
}

function copyDraft(id) {
  const source = readDraftPayload(id);
  const meta = listDrafts().find((item) => item.id === id);
  if (!source) { setStatus('源草稿不存在或已损坏', 'error'); return; }
  const name = promptDraftName(`${meta?.name || '草稿'}-副本`);
  if (name === null) return;
  const newId = uid('draft');
  const savedAt = now();
  localStorage.setItem(DRAFT_PREFIX + newId, JSON.stringify({ ...source, savedAt }));
  const list = listDrafts();
  list.unshift({ id: newId, name, savedAt });
  saveDraftList(pruneDraftList(list, newId));
  refreshDraftUI();
  setStatus(`已复制为「${name}」`, 'ok');
}

function deleteDraft(id) {
  const list = listDrafts();
  const meta = list.find((item) => item.id === id);
  if (!meta) return;
  if (!confirm(`删除草稿「${meta.name}」？此操作不可恢复。`)) return;
  localStorage.removeItem(DRAFT_PREFIX + id);
  const next = list.filter((item) => item.id !== id);
  saveDraftList(next);
  if (activeDraftId() === id) {
    if (next.length) {
      restoreDraftById(next[0].id);
      $('footer').textContent = `已删除并切换到草稿「${next[0].name}」；请重新导入 GLB`;
    } else {
      setActiveDraftId('');
      clearWorkspaceModels();
      state.project = { projectId: 'AN-REVIEW-001', displayTitle: '4. 模拟电路实训室', name: '模拟电路实训室', version: 'V1.0', templateVersion: '1.2', courses: defaultCourses.map((course) => ({ ...course })) };
      state.reviews = { byModel: {} };
      state.selectedCourseId = null;
      const fieldMap = { displayTitle: 'display-title', projectId: 'project-id', name: 'project-name', version: 'project-version' };
      Object.entries(fieldMap).forEach(([key, fieldId]) => { $(fieldId).value = state.project[key] || ''; });
      refreshAll();
      $('footer').textContent = '已删除当前草稿，工作区已重置';
    }
  }
  refreshDraftUI();
}

function bootDrafts() {
  migrateLegacyDraft();
  const id = activeDraftId();
  if (id && readDraftPayload(id)) {
    restoreDraftById(id);
    const meta = listDrafts().find((item) => item.id === id);
    $('footer').textContent = `已恢复草稿「${meta?.name || ''}」${meta?.savedAt ? `（${draftTimeLabel(meta.savedAt)}）` : ''}；请重新导入 GLB`;
  }
  refreshDraftUI();
}
function setStatus(text, type = '') { $('status').textContent = text; $('status').className = `status ${type}`; }
function projectData() { syncProject(); return { ...state.project, generatedAt: now(), courses: [...state.project.courses].sort((a, b) => a.sortOrder - b.sortOrder), models: state.models.map(({ modelId, fileName, displayName, version, sortOrder, courseId, requirement, file, nodes }) => ({ modelId, fileName, displayName, version, sortOrder, courseId, requirement, byteLength: file.size, nodes })) }; }
function refreshCourseEditor() { $('course-editor').innerHTML = state.project.courses.sort((a, b) => a.sortOrder - b.sortOrder).map((course) => `<div class="course-edit" data-course="${course.courseId}"><input data-key="code" value="${esc(course.code)}"><input data-key="name" value="${esc(course.name)}"><button class="remove-course" title="删除课程">×</button></div>`).join(''); document.querySelectorAll('.course-edit input').forEach((input) => input.oninput = (event) => { const course = state.project.courses.find((item) => item.courseId === event.target.closest('.course-edit').dataset.course); course[event.target.dataset.key] = event.target.value.trim(); refreshModels(); markDraft(); }); document.querySelectorAll('.remove-course').forEach((button) => button.onclick = (event) => { const id = event.target.closest('.course-edit').dataset.course; if (state.models.some((model) => model.courseId === id) && !confirm('该课程下仍有模型，删除课程后模型会移入“未归类”。继续吗？')) return; state.models.forEach((model) => { if (model.courseId === id) model.courseId = 'uncategorized'; }); state.project.courses = state.project.courses.filter((course) => course.courseId !== id); if (state.selectedCourseId === id) state.selectedCourseId = null; refreshAll(); markDraft(); }); }
function refreshModelsBase() {
  const course = selectedCourse();
  const models = course ? courseModels(course.courseId) : [];
  renderCourseModelList({
    listEl: $('models'),
    metaEl: $('course-model-meta'),
    titleEl: $('course-model-title'),
    models,
    currentModelId: state.currentId,
    modelTitle: (model) => model.displayName,
    modelSubtitle: (model) => size(model.file?.size || 0),
    emptyHint: course ? '点右上角「导入」添加 GLB' : '点击顶部课程卡片选择课程',
    onSelectModel: (modelId) => selectModel(modelId),
    onDeleteModel: (modelId) => deleteModel(modelId),
    drag: {
      rowStart: (modelId, event, row) => { state.draggedModelId = modelId; event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); },
      rowEnd: (row) => { state.draggedModelId = null; row?.classList.remove('dragging'); document.querySelectorAll('.course-card').forEach((card) => card.classList.remove('drop-target')); },
    },
  });
  updatePackage();
}
function courseModels(courseId) { return state.models.filter((model) => model.courseId === courseId).sort((a, b) => a.sortOrder - b.sortOrder); }
function refreshCourseRail() {
  renderCourseRail({
    cardsEl: $('course-cards'),
    courses: state.project.courses,
    modelsOf: courseModels,
    metaHtml: (models) => `<span class="course-card-count">${models.length}</span> 模型`,
    activeCourseId: state.selectedCourseId,
    onSelectCourse: (courseId) => selectCourse(courseId),
    drag: {
      cardOver: (card, event) => { if (!state.draggedModelId) return; event.preventDefault(); card.classList.add('drop-target'); },
      cardLeave: (card) => card.classList.remove('drop-target'),
      cardDrop: (courseId) => moveModelToCourse(state.draggedModelId, courseId),
    },
  });
  const target = selectedCourse();
  if (target) {
    $('rail-current').textContent = `${target.code} · ${target.name}`;
    $('rail-current').title = `导入目标：${target.code} ${target.name}`;
    $('rail-import').textContent = `导入到 ${target.code}`;
    $('rail-import').title = `将 GLB 导入「${target.code} ${target.name}」`;
    $('rail-import').disabled = false;
  } else {
    $('rail-current').textContent = '点击卡片选择导入课程';
    $('rail-current').title = '';
    $('rail-import').textContent = '先选择课程';
    $('rail-import').title = '';
    $('rail-import').disabled = true;
  }
  updateCourseRailControls();
}
function refreshModels() { refreshModelsBase(); refreshCourseRail(); }
function selectCourse(courseId) {
  if (courseId === 'uncategorized') return;
  state.selectedCourseId = courseId;
  const models = courseModels(courseId);
  if (models.length && (!state.currentId || !models.some((model) => model.modelId === state.currentId))) {
    selectModel(models[0].modelId);
  } else {
    refreshModels();
  }
  setStatus(`当前导入课程：${selectedCourse()?.code || ''} ${selectedCourse()?.name || ''}`, 'ok');
}
function selectModel(id) { const model = state.models.find((item) => item.modelId === id); if (model?.courseId && model.courseId !== 'uncategorized') state.selectedCourseId = model.courseId; selectModelBase(id); }
$('rail-import').onclick = () => $('files').click();
$('rail-prev').onclick = () => $('course-cards').scrollBy({ left: -260, behavior: 'smooth' });
$('rail-next').onclick = () => $('course-cards').scrollBy({ left: 260, behavior: 'smooth' });
function updateCourseRailControls() { const rail = $('course-cards'); $('rail-prev').disabled = rail.scrollLeft <= 1; $('rail-next').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1; }
$('course-cards').addEventListener('scroll', updateCourseRailControls, { passive: true });
window.addEventListener('resize', updateCourseRailControls);
function moveModelToCourse(modelId, courseId) { const model = state.models.find((item) => item.modelId === modelId); if (!model || model.courseId === courseId) return; model.courseId = courseId; model.sortOrder = Math.max(0, ...state.models.filter((item) => item.courseId === courseId).map((item) => item.sortOrder)) + 1; state.selectedCourseId = courseId; refreshModels(); populateModel(); markDraft('模型已移动到新课程'); }
function disposeObject(root) { root?.traverse((node) => { if (!node.isMesh) return; node.geometry?.dispose?.(); for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material?.dispose?.(); }); }
function deleteModel(modelId) { const model = state.models.find((item) => item.modelId === modelId); if (!model) return; const issueCount = state.reviews.byModel[modelId]?.issues?.length || 0; const detail = issueCount ? `模型“${model.displayName}”已有 ${issueCount} 条审核问题，删除后会一并删除这些问题。` : `确认删除模型“${model.displayName}”？`; if (!confirm(`${detail}\n此操作不可恢复。`)) return; if (state.currentId === modelId) { resetHighlight(model.gltf.scene); scene.remove(model.gltf.scene); disposeObject(model.gltf.scene); state.currentId = null; state.selected = null; } state.models = state.models.filter((item) => item.modelId !== modelId); delete state.reviews.byModel[modelId]; if (!current()) { $('hud').textContent = '未选择模型'; } refreshAll(); markDraft('模型及其审核问题已删除'); }
function updateTreeCrumb() {
  const crumb = $('tree-crumb');
  const model = current();
  if (!model) { crumb.classList.add('hidden'); crumb.textContent = ''; return; }
  crumb.classList.remove('hidden');
  const parts = [model.displayName];
  if (state.selected) parts.push(nodeDisplayName(state.selected));
  crumb.textContent = parts.join(' / ');
}
function refreshTree() {
  const model = current();
  updateTreeCrumb();
  if (!model) {
    $('nodes').textContent = '—';
    $('tree').innerHTML = emptyState('⌗', '选择模型后显示层级', '导入 GLB 并选中模型；单击选中零件，G 聚焦零件');
    return;
  }
  $('nodes').textContent = `${model.nodes.length} 节点`;
  renderTree($('tree'), model.gltf.scene, { selected: state.selected, onSelect: selectNode, onIsolate: isolateFromTree, filter: state.treeQuery });
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
  const model = current();
  const isolating = viewer.isIsolating();
  const name = state.selected ? (state.selected.name || '未命名节点') : '';
  $('hud').textContent = !model ? '未选择模型' : isolating ? `已选中：${model.displayName} / ${name}` : model.displayName;
  $('tree').classList.toggle('is-isolating', isolating);
  syncIsolateButton();
}
function highlightMeshes(node) { if (!node) return []; if (node.isMesh) return [node]; return node.children.filter((child) => child.isMesh); }
function resetHighlight() { viewer.setOutlineTargets([]); viewer.setSelected(null); }
function isolateFromTree(node) {
  if (!node || !current()) return;
  selectNode(node);
  viewer.toggleIsolate(node);
  applyIsolateUI();
  refreshTree();
}
function clearNodePanel() { state.selected = null; viewer.clearIsolate(); $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('persistent-id').value = ''; $('persistent-id').disabled = true; $('apply-id').disabled = true; $('replace-node').disabled = true; $('binding').textContent = '-'; applyIsolateUI(); updateTreeCrumb(); }
function selectNode(node) { const model = current(); if (!model) return; resetHighlight(); state.selected = node; viewer.setSelected(node); viewer.setOutlineTargets(highlightMeshes(node)); const record = model.nodes.find((item) => item.nodePath === path(node)); $('current-part').textContent = `当前零件：${model.displayName} / ${node.name || '未命名节点'}`; $('node-path').textContent = path(node); $('node-id').textContent = record?.persistentNodeId || '-'; $('persistent-id').value = record?.persistentNodeId || candidate(node, model.gltf.scene); $('persistent-id').disabled = false; $('apply-id').disabled = false; $('replace-node').disabled = false; $('binding').textContent = record?.candidate ? '候选' : '已关联'; applyIsolateUI(); refreshTree(); }
function fit() { viewer.fit(current()?.gltf.scene); }
function populateModel() { const model = current(); ['model-name', 'model-course', 'model-requirement'].forEach((id) => $(id).disabled = !model); $('model-name').value = model?.displayName || ''; $('model-course').innerHTML = state.project.courses.map((course) => `<option value="${course.courseId}">${esc(`${course.code} ${course.name}`)}</option>`).join('') + '<option value="uncategorized">未归类</option>'; $('model-course').value = model?.courseId || 'uncategorized'; $('model-requirement').value = model?.requirement || ''; $('model-state').textContent = model ? `${model.nodes.length} 节点` : '-'; }
function selectModelBase(id) { const model = state.models.find((item) => item.modelId === id); if (!model) return; const old = current(); if (old) { viewer.clearIsolate(); resetHighlight(); scene.remove(old.gltf.scene); } state.currentId = id; state.selected = null; viewer.prepareModel(model.gltf.scene); scene.add(model.gltf.scene); $('hud').textContent = model.displayName; $('nodes').textContent = `${model.nodes.length}`; clearNodePanel(); populateModel(); refreshModels(); refreshTree(); resize(); fit(); }
async function addFiles(files) {
  const course = selectedCourse();
  if (!course) { setStatus('请先选择课程，再导入 GLB', 'warn'); return; }
  const glbFiles = [...files].filter((item) => item.name.toLowerCase().endsWith('.glb'));
  let restoredCount = 0;
  for (const file of glbFiles) {
    try {
      const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
      const nodes = [];
      gltf.scene.traverse((node) => {
        if (node === gltf.scene) return;
        const id = node.userData?.persistentNodeId || node.userData?.extras?.persistentNodeId || candidate(node, gltf.scene);
        nodes.push({ nodePath: path(node, gltf.scene), nodeName: node.name || '未命名节点', persistentNodeId: id, candidate: !node.userData?.extras?.persistentNodeId, nodeType: node.type });
      });
      const model = { modelId: uid('model'), fileName: file.name, displayName: file.name.replace(/\.glb$/i, ''), version: state.project.version || 'V1.0', sortOrder: state.models.length + 1, courseId: course.courseId, requirement: '', file, gltf, nodes };
      const pending = pendingModelMeta.find((item) => item.fileName === file.name && (item.courseId === course.courseId || item.courseId === 'uncategorized'));
      if (pending) {
        model.modelId = pending.modelId || model.modelId;
        model.displayName = pending.displayName || model.displayName;
        model.requirement = pending.requirement || '';
        model.version = pending.version || model.version;
        model.courseId = pending.courseId && pending.courseId !== 'uncategorized' ? pending.courseId : course.courseId;
        model.sortOrder = pending.sortOrder ?? model.sortOrder;
        if (Array.isArray(pending.nodes)) {
          for (const node of model.nodes) {
            const bound = pending.nodes.find((item) => item.nodePath === node.nodePath);
            if (bound?.persistentNodeId) { node.persistentNodeId = bound.persistentNodeId; node.candidate = !!bound.candidate; }
          }
        }
        pendingModelMeta = pendingModelMeta.filter((item) => item !== pending);
        restoredCount += 1;
      }
      state.models.push(model);
    } catch { setStatus(`${file.name} 加载失败`, 'error'); }
  }
  refreshAll();
  if (!state.currentId && state.models[0]) selectModel(state.models[0].modelId);
  $('files').value = '';
  const restoreNote = restoredCount ? `，已恢复 ${restoredCount} 个模型元数据` : '';
  markDraft(`已导入 ${glbFiles.length} 个模型到 ${course.code} ${course.name}${restoreNote}`);
}
function updatePackage() { const total = state.models.reduce((sum, model) => sum + model.file.size, 0); $('bytes').textContent = size(total); $('single').disabled = !total || total > LIMIT; $('zip').disabled = !total; $('export').disabled = !total; if (total) setStatus(total > LIMIT ? '超过 20 MB，请使用 ZIP' : '可导出单 HTML 或 ZIP', total > LIMIT ? 'warn' : 'ok'); }
function refreshAll() { syncProject(); refreshCourseEditor(); refreshModels(); populateModel(); refreshTree(); }
function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function chunks(buffer) { const bytes = new Uint8Array(buffer), result = []; for (let offset = 0; offset < bytes.length; offset += 0x8000) { let text = ''; for (const byte of bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))) text += String.fromCharCode(byte); result.push(btoa(text)); } return result; }
async function payload(inline) { const project = projectData(); return { schemaVersion: 2, project: { ...project, models: await Promise.all(state.models.map(async (model) => ({ ...project.models.find((item) => item.modelId === model.modelId), base64Chunks: inline ? chunks(await model.file.arrayBuffer()) : undefined }))) }, review: { ...state.reviews, projectId: project.projectId, projectConclusion: '', updatedAt: now() }, mode: inline ? 'inline' : 'folder' }; }
function reviewerHtml(data) { return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"><title>离线模型审核</title></head><body><div id="app"></div><script>window.__AN_REVIEW_PAYLOAD__=${JSON.stringify(data).replace(/</g, '\\u003c')};</script><script>${reviewerRuntime}</script></body></html>`; }
async function exportSingle() { if (state.models.reduce((sum, model) => sum + model.file.size, 0) > LIMIT) return setStatus('超过 20 MB，请使用 ZIP', 'error'); download(new Blob([reviewerHtml(await payload(true))], { type: 'text/html;charset=utf-8' }), `${safeName(state.project.name)}-审核器.html`); markDraft('单 HTML 已导出'); }
async function exportZip() { const data = await payload(false); data.project.models = data.project.models.map((model) => ({ ...model, fileName: safeName(model.fileName) })); const files = { '审核器.html': strToU8(reviewerHtml(data)), 'project.json': strToU8(JSON.stringify(data.project, null, 2)), 'review/issues.json': strToU8(JSON.stringify(data.review, null, 2)) }; for (const model of state.models) files[`models/${safeName(model.fileName)}`] = new Uint8Array(await model.file.arrayBuffer()); const gifFile = FOCUS_PART_TOPIC.media?.file; if (gifFile) { try { const res = await fetch(FOCUS_PART_TOPIC.base + gifFile); if (res.ok) files[`help/focus-part/${gifFile}`] = new Uint8Array(await res.arrayBuffer()); } catch { /* 离线无 help 资源时跳过 */ } } download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${safeName(state.project.name)}-审核包.zip`); markDraft('ZIP 审核包已导出'); }
function resize() { viewer.resize(); }

$('tree-filter').oninput = (event) => { state.treeQuery = event.target.value; refreshTree(); };
$('files').onchange = (event) => addFiles(event.target.files);
$('save').onclick = () => { flushDraftSave(); setStatus('当前草稿已保存', 'ok'); };
$('draft-toggle').onclick = (event) => { event.stopPropagation(); if ($('draft-panel').classList.contains('hidden')) openDraftPanel(); else closeDraftPanel(); };
$('draft-new').onclick = (event) => { event.stopPropagation(); newDraft(); };
$('draft-saveas').onclick = (event) => { event.stopPropagation(); saveDraftAs(); };
document.addEventListener('click', (event) => { if (!event.target.closest?.('.draft-menu')) closeDraftPanel(); });
window.addEventListener('beforeunload', () => { if (draftDirty) flushDraftSave(); });
$('add-course').onclick = () => { const course = { courseId: uid('course'), code: `AN-${String(state.project.courses.length + 1).padStart(2, '0')}`, name: '新课程', sortOrder: state.project.courses.length + 1 }; state.project.courses.push(course); state.selectedCourseId = course.courseId; refreshAll(); markDraft(); };
const drawer = $('drawer');
function openDrawer() { drawer.classList.remove('hidden'); drawer.setAttribute('aria-hidden', 'false'); }
function closeDrawer() { drawer.classList.add('hidden'); drawer.setAttribute('aria-hidden', 'true'); }
$('open-settings').onclick = openDrawer;
$('close-settings').onclick = closeDrawer;
$('drawer-mask').onclick = closeDrawer;
function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
function toggleIsolateSelected() {
  if (!state.selected) { setStatus('请先选中零件'); return; }
  viewer.toggleIsolate(state.selected);
  applyIsolateUI();
  refreshTree();
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (viewer.isIsolating()) { viewer.clearIsolate(); applyIsolateUI(); refreshTree(); return; }
    if (!drawer.classList.contains('hidden')) closeDrawer();
    return;
  }
  if (event.key !== 'g' && event.key !== 'G') return;
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  toggleIsolateSelected();
});
$('fit').onclick = fit;
$('wire').onclick = () => { state.wire = !state.wire; viewer.setWireframe(state.wire); $('wire').classList.toggle('active', state.wire); };
$('isolate').onclick = toggleIsolateSelected;
/* 隔离态：仅隔离子树内可点选；空白/幽灵不退出，退出只走 ESC / 按钮 / G */
renderer.domElement.addEventListener('pointerdown', (event) => {
  const root = current()?.gltf.scene;
  if (!root || event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(root, true);
  if (viewer.isIsolating()) {
    const solid = hits.find((item) => viewer.isInIsolated(item.object));
    if (solid) selectNode(solid.object);
    return;
  }
  if (hits[0]) selectNode(hits[0].object);
});
$('replace-node').onclick = () => { if (current()) resetHighlight(current().gltf.scene); clearNodePanel(); refreshTree(); setStatus('请选择需要关联问题的零件'); };
$('apply-id').onclick = () => { const model = current(), node = state.selected, id = $('persistent-id').value.trim(); if (!model || !node || !id) return; const record = model.nodes.find((item) => item.nodePath === path(node)); if (record) { record.persistentNodeId = id; record.candidate = false; } selectNode(node); markDraft('问题已关联到当前零件'); };
$('single').onclick = exportSingle; $('zip').onclick = exportZip; $('export').onclick = () => state.models.reduce((sum, model) => sum + model.file.size, 0) > LIMIT ? exportZip() : exportSingle();
['display-title', 'project-id', 'project-name', 'project-version'].forEach((id) => $(id).oninput = () => { syncProject(); markDraft(); });
$("model-name").oninput = () => { const model = current(); if (!model) return; model.displayName = $('model-name').value.trim() || model.fileName.replace(/\.glb$/i, ''); refreshModels(); markDraft(); };
$("model-course").onchange = (event) => { const model = current(); if (model) moveModelToCourse(model.modelId, event.target.value); };
$("model-requirement").oninput = () => { const model = current(); if (model) { model.requirement = $('model-requirement').value.trim(); markDraft(); } };
resize(); refreshAll(); bootDrafts();
mountHelpHotspot({ mount: document.getElementById('tree-help-slot'), topic: FOCUS_PART_TOPIC });
