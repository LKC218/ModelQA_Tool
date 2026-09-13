import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { createProductViewer } from '../shared/shared-viewer.js';
import reviewerRuntime from '../generated/reviewer-runtime.js?raw';
import { renderCourseRail, renderCourseModelList, renderTree, emptyState, nodeDisplayName, bindViewportTools } from '../shared/shared-components.js';
import { mountHelpHotspot, FOCUS_PART_TOPIC, LOAD_PACKAGE_TOPIC } from '../shared/shared-help-hotspot.js';
import '../shared/shared-ui.css';
import './styles.css';
import { bindSettingsToggle } from '../shared/settings.js';
import { cloud } from './cloud-sync.js';
import { getThumb } from './model-thumbnails.js';

const LIMIT = 20 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const loader = new GLTFLoader();
const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const safeName = (value) => String(value || '审核项目').replace(/[\\/:*?"<>|]/g, '_').trim() || '审核项目';
const defaultCourses = [['AN-01', '二极管认知与检测'], ['AN-02', '整流电路连接与检测'], ['AN-03', '滤波电路'], ['AN-04', '晶体管认知与检测'], ['AN-05', '单管放大电路'], ['AN-06', '集成运放认识'], ['AN-07', '转向灯不闪光故障检修']].map(([code, name], index) => ({ courseId: `course-${code}`, code, name, sortOrder: index + 1 }));
const state = { project: { projectId: 'AN-REVIEW-001', displayTitle: '4. 模拟电路实训室', name: '模拟电路实训室', version: 'V1.0', templateVersion: '1.2', courses: defaultCourses }, models: [], modelCloudRefs: {}, reviews: { byModel: {} }, currentId: null, selected: null, selectedCourseId: null, treeQuery: '', draggedModelId: null, wire: false };

document.querySelector('#app').innerHTML = `<div class="tool-shell"><header class="topbar"><div class="topbar-title"><h1 id="project-title">4. 模拟电路实训室</h1></div><div class="actions"><span id="sync-dot" class="sync-dot off" title="云端同步状态"></span><button class="button theme-toggle" id="theme-toggle" type="button" title="切换主题" aria-label="切换到暗色主题">🌙</button><button class="button theme-toggle" id="app-settings-toggle" type="button" title="界面设置（字体字号）" aria-label="打开界面设置"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button><div class="draft-menu"><button class="button" id="draft-toggle" type="button" title="项目列表" aria-haspopup="listbox" aria-expanded="false"><span id="draft-current-name">项目</span> ▾</button><div class="draft-panel hidden" id="draft-panel" role="listbox" aria-label="项目列表"><div class="draft-panel-head">项目列表<span class="draft-panel-hint">上限 50 条 · 云端同步</span></div><div id="draft-list" class="draft-list"></div><div class="draft-panel-actions"><button class="button" id="draft-new" type="button">新建项目</button><button class="button" id="draft-saveas" type="button">另存为</button></div></div></div><button class="button" id="save" type="button" title="立即保存当前项目并同步到云端">立即保存</button><button class="button" id="open-settings" type="button" title="项目信息与课程编辑">项目设置</button></div></header><nav class="course-rail" aria-label="课程选择"><div class="course-rail-main"><button class="rail-scroll" id="rail-prev" type="button" aria-label="查看上一组课程">‹</button><div id="course-cards" class="course-cards" tabindex="0"></div><button class="rail-scroll" id="rail-next" type="button" aria-label="查看下一组课程">›</button><button class="button rail-import" id="rail-import" type="button" disabled>先选择课程</button></div></nav><main class="workspace"><aside class="sidebar left"><section class="panel course-model-panel"><div class="panel-heading"><h2 id="course-model-title">课程模型</h2><span id="course-model-meta">—</span></div><input id="files" type="file" accept=".glb,model/gltf-binary" multiple hidden><div id="models" class="course-model-list"></div></section><section class="panel tree-panel"><div class="panel-heading"><div class="panel-heading-main"><h2>模型层级</h2><span id="tree-help-slot" class="panel-heading-help"></span></div><span id="nodes">—</span></div><input id="tree-filter" class="tree-filter" type="search" placeholder="搜索零件名" autocomplete="off"><div id="tree-crumb" class="tree-crumb hidden"></div><div id="tree" class="tree"><div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">⌗</div><p class="tree-empty-title">选择模型后显示层级</p><p class="tree-empty-hint">导入 GLB 并选中模型；单击选中零件，G 聚焦零件</p></div></div></section></aside><section class="center"><div id="viewer" class="viewer-view"><canvas id="canvas"></canvas><div class="viewer-hud"><b id="hud">未选择模型</b></div><div class="viewer-toolbar"><div class="viewer-explode hidden" id="explode-slider"><input id="explode-range" type="range" min="0" max="100" value="0" aria-label="爆炸程度"><span class="explode-value" id="explode-value">0%</span></div><button class="icon-button hidden" id="isolate" type="button" title="聚焦当前零件，其余半透明">聚焦零件</button><button class="icon-button" id="fit" title="还原视角">还原</button><button class="icon-button" id="wire" title="线框查看">线框</button><button class="icon-button" id="explode" type="button" title="爆炸视图">爆炸</button><button class="icon-button" id="labels" type="button" title="部件标注">标注</button></div></div></section><aside class="sidebar right"><section class="panel"><div class="panel-heading"><h2>当前模型</h2><span id="model-state">-</span></div><label>名称<input id="model-name" disabled></label><label>所属课程<select id="model-course" disabled></select></label><label>审核要求<textarea id="model-requirement" placeholder="模型结构是否完整，外观与命名是否符合教学需求" disabled></textarea></label></section><section class="panel"><div class="panel-heading"><h2>问题定位</h2><span id="binding">-</span></div><div id="current-part" class="current-part">当前零件：未选择</div><details class="advanced"><summary>高级信息</summary><dl class="facts"><div><dt>节点路径</dt><dd id="node-path">-</dd></div><div><dt>节点标识</dt><dd id="node-id">-</dd></div></dl><label>persistentNodeId<input id="persistent-id" disabled></label></details><div class="binding-actions"><button class="button full" id="apply-id" disabled>将问题关联到此零件</button><button class="text-button full" id="replace-node" disabled>更换零件</button></div></section><section class="panel package-panel"><div class="panel-heading"><h2>审核包</h2><span id="bytes">0 B</span></div><div class="package-row"><button class="button primary" id="single" disabled>单 HTML</button><button class="button" id="zip" disabled>ZIP</button></div><div class="package-row secondary"><button class="button" id="upload-preview" disabled title="将最近一次导出的单 HTML 审核包上传为在线预览链接">上传在线预览</button><button class="button" id="review-links" disabled title="管理已上传的在线预览链接（未审核/已审核）">链接管理</button></div><p id="upload-hint" class="upload-hint" hidden></p><p id="status" class="status">选择课程后可导入模型</p></section></aside></main><footer class="footer"><span id="footer" class="footer-status">项目未保存</span><span class="footer-version" id="app-version" title="工具版本"></span></footer><div id="drawer" class="drawer hidden" aria-hidden="true"><div class="drawer-mask" id="drawer-mask"></div><aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="项目设置"><div class="panel-heading"><h2>项目设置</h2><button class="icon-button" id="close-settings" type="button" aria-label="关闭项目设置">×</button></div><div class="config-block"><h2>项目信息</h2><div class="field-grid"><label>项目标题<input id="display-title" value="4. 模拟电路实训室"></label><label>项目编号<input id="project-id" value="AN-REVIEW-001"></label><label>项目名称<input id="project-name" value="模拟电路实训室"></label><label>版本<input id="project-version" value="V1.0"></label></div></div><div class="config-block"><div class="panel-heading"><h2>课程</h2><button class="text-button" id="add-course" type="button">添加课程</button></div><div id="course-editor" class="course-editor"></div></div></aside></div></div>`;

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
bindSettingsToggle($('app-settings-toggle'));
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
const current = () => state.models.find((model) => model.modelId === state.currentId);
const selectedCourse = () => state.project.courses.find((course) => course.courseId === state.selectedCourseId);
const size = (bytes) => !bytes ? '0 B' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function path(node, root = current()?.gltf.scene) { const parts = []; for (let item = node; item && item !== root; item = item.parent) parts.unshift(`${item.name || '未命名节点'}[${item.parent ? item.parent.children.indexOf(item) + 1 : 1}]`); return parts.join(' / '); }
function candidate(node, root) { return `path:${path(node, root).replace(/\s+/g, '')}`; }
function syncProject() { state.project = { ...state.project, displayTitle: $('display-title').value.trim(), projectId: $('project-id').value.trim(), name: $('project-name').value.trim(), version: $('project-version').value.trim() }; $('project-title').textContent = state.project.displayTitle || state.project.name || '未命名项目'; }
/* —— 多槽项目：索引 + 当前槽 + 旧 key 迁移（云端双写见 cloudSync 块） —— */
const DRAFTS_KEY = 'an-review-drafts';
const ACTIVE_KEY = 'an-review-active';
const DRAFT_PREFIX = 'an-review-draft:';
const LEGACY_DRAFT_KEY = 'an-review-draft';
const CLOUD_DELETE_KEY = 'an-review-cloud-deletes';
const DRAFT_LIMIT = 50;
const DRAFT_DEBOUNCE_MS = 1500;
const CLOUD_DEBOUNCE_MS = 3000;
const CLOUD_MAX_RETRY = 3;
let draftDirty = false;
let draftSaveTimer = null;
let pendingModelMeta = [];

function listDrafts() { try { const list = JSON.parse(localStorage.getItem(DRAFTS_KEY)); return Array.isArray(list) ? list : []; } catch { return []; } }
function saveDraftList(list) { localStorage.setItem(DRAFTS_KEY, JSON.stringify(list)); }
function activeDraftId() { return localStorage.getItem(ACTIVE_KEY) || ''; }
function setActiveDraftId(id) { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); }
function readDraftPayload(id) { if (!id) return null; try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + id)); } catch { return null; } }
function defaultDraftName() { return state.project?.name || state.project?.displayTitle || '未命名项目'; }
function draftTimeLabel(iso) { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const pad = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function buildDraftPayload() { syncProject(); return { project: state.project, modelCloud: state.modelCloudRefs, models: projectData().models, review: state.reviews, savedAt: now() }; }

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
    if (meta) { meta.savedAt = payload.savedAt; meta.name = name || defaultDraftName(); } // 列表名始终跟随项目名
    else list.unshift({ id, name: name || defaultDraftName(), savedAt: payload.savedAt });
    list = pruneDraftList(list, id);
    saveDraftList(list);
    setActiveDraftId(id);
    draftDirty = false;
    refreshDraftUI();
    markCloudPending();
    return true;
  } catch {
    setStatus('项目保存失败（本地存储可能已满）', 'error');
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
      $('footer').textContent = `项目「${meta?.name || ''}」已自动保存 ${draftTimeLabel(meta?.savedAt) || ''}`.trim();
    }
  }, DRAFT_DEBOUNCE_MS);
}

function markDraft(text = '项目待保存') {
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
    $('footer').textContent = `项目「${meta?.name || ''}」已保存`.trim();
    markCloudPending(true); // 显式保存 → 立即同步云端
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
  state.modelCloudRefs = {};
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
  state.modelCloudRefs = draft.modelCloud && typeof draft.modelCloud === 'object' ? draft.modelCloud : {};
  pendingModelMeta = Array.isArray(draft.models) ? draft.models : [];
  // 桥接：模型引用存在 modelCloud 映射，而恢复逻辑按条目 .cloud 过滤——恢复前把引用合流进元数据
  pendingModelMeta = pendingModelMeta.map((item) => item.cloud || !state.modelCloudRefs[item.modelId]
    ? item
    : { ...item, cloud: state.modelCloudRefs[item.modelId] });
  state.selectedCourseId = null;
  const fieldMap = { displayTitle: 'display-title', projectId: 'project-id', name: 'project-name', version: 'project-version' };
  Object.entries(fieldMap).forEach(([key, id]) => { $(id).value = state.project[key] || ''; });
  refreshAll();
  hydrateCloudModels();
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
    list.unshift({ id, name: draft.project?.name || '迁移项目', savedAt });
    saveDraftList(pruneDraftList(list, id));
    setActiveDraftId(id);
  } catch { /* ignore broken legacy */ }
  localStorage.removeItem(LEGACY_DRAFT_KEY);
}

/* —— 云端同步：本地优先双写 + 防抖推送 + 启动对账 —— */
let cloudOnline = cloud.available;
let cloudSaveTimer = null;
let cloudRetryCount = 0;
let hydrateBusy = false;

function setSyncDot(mode) {
  const dot = $('sync-dot');
  if (!dot) return;
  dot.className = `sync-dot ${mode}`;
  dot.title = mode === 'synced' ? '云端已同步' : mode === 'pending' ? '待同步到云端' : '离线：云端不可达，改动仅保存在本地';
}

/** 本地刚写入 → 黄点 + 防抖推送云端 */
function markCloudPending(immediate = false) {
  if (!cloud.available) return;
  setSyncDot('pending');
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(pushProjectToCloud, immediate ? 0 : CLOUD_DEBOUNCE_MS);
}

async function pushProjectToCloud(id = activeDraftId()) {
  if (!cloud.available || !id) return;
  const payload = readDraftPayload(id);
  if (!payload) return;
  try {
    const list = listDrafts();
    const meta = list.find((item) => item.id === id);
    const res = await cloud.saveProject(id, { name: meta?.name || defaultDraftName(), ...payload });
    if (meta) meta.cloudSyncedAt = res.updatedAt || now();
    if (meta) saveDraftList(list);
    cloudOnline = true;
    cloudRetryCount = 0;
    setSyncDot('synced');
    refreshDraftUI();
    retryPendingCloudDeletes();
  } catch {
    cloudOnline = false;
    setSyncDot('off');
    if (cloudRetryCount < CLOUD_MAX_RETRY) {
      cloudRetryCount += 1;
      setTimeout(() => pushProjectToCloud(id), 2000 * 2 ** cloudRetryCount);
    } else {
      setStatus('云端同步失败：改动已保存在本地，恢复联网后将自动补同步', 'warn');
    }
  }
}

/** 导入 GLB 后台上传模型 → 存 {hash,url,size} 引用进项目（relPath 为分类树路径元数据） */
async function uploadModelToCloud(model, attempt = 0) {
  if (!cloud.available || !model?.file || state.modelCloudRefs[model.modelId]) return;
  try {
    const res = await cloud.uploadModel(await model.file.arrayBuffer(), model.fileName, model.relPath || '');
    state.modelCloudRefs[model.modelId] = { hash: res.hash, url: res.url, size: model.file.size };
    libraryCache = null; // 模型库已增量，置空待下次打开面板时重新拉取
    markDraft(`模型「${model.displayName}」已同步到云端`);
  } catch {
    if (attempt < CLOUD_MAX_RETRY) setTimeout(() => uploadModelToCloud(model, attempt + 1), 3000 * 2 ** attempt);
    else setStatus(`模型「${model.displayName}」上传云端失败，改动已保存在本地`, 'warn');
  }
}

/** 云端引用 → 拉回 GLB 并重建模型（换设备/同步恢复路径） */
async function hydrateCloudModels() {
  if (!cloud.available || hydrateBusy) return;
  hydrateBusy = true;
  let restoredCount = 0;
  try {
    for (const pending of pendingModelMeta.filter((item) => item.cloud)) {
      if (state.models.some((model) => model.modelId === pending.modelId)) {
        pendingModelMeta = pendingModelMeta.filter((item) => item !== pending);
        continue;
      }
      try {
        const buffer = await cloud.fetchModel(pending.cloud.url);
        const gltf = await loader.parseAsync(buffer, '');
        const fileName = pending.fileName || 'model.glb';
        const model = {
          modelId: pending.modelId || uid('model'),
          fileName,
          displayName: pending.displayName || fileName.replace(/\.glb$/i, ''),
          version: pending.version || state.project.version || 'V1.0',
          sortOrder: pending.sortOrder ?? state.models.length + 1,
          courseId: pending.courseId || 'uncategorized',
          requirement: pending.requirement || '',
          file: new File([buffer], fileName, { type: 'model/gltf-binary' }),
          gltf,
          nodes: collectNodes(gltf),
        };
        bindPendingNodes(model.nodes, pending.nodes);
        state.models.push(model);
        pendingModelMeta = pendingModelMeta.filter((item) => item !== pending);
        restoredCount += 1;
      } catch { /* 单个失败保留 pending，下次启动/切换重试 */ }
    }
    if (restoredCount) {
      refreshAll();
      if (!state.currentId && state.models[0]) selectModel(state.models[0].modelId);
      setStatus(`已从云端恢复 ${restoredCount} 个模型`, 'ok');
      markDraft(`已从云端恢复 ${restoredCount} 个模型`);
    }
  } finally {
    hydrateBusy = false;
  }
}

/** 启动对账：本地未同步的推送云端（旧数据迁移）；云端有而本地无的补拉 */
async function reconcileCloud() {
  if (!cloud.available) { setSyncDot('off'); return; }
  setSyncDot('pending');
  try {
    const { projects } = await cloud.listProjects();
    cloudOnline = true;
    const list = listDrafts();
    let migrated = 0;
    for (const meta of list) {
      if (meta.cloudSyncedAt) continue;
      const payload = readDraftPayload(meta.id);
      if (!payload) continue;
      try {
        const res = await cloud.saveProject(meta.id, { name: meta.name || defaultDraftName(), ...payload });
        meta.cloudSyncedAt = res.updatedAt || now();
        migrated += 1;
      } catch { /* 单个失败，下次启动重试 */ }
    }
    let pulled = 0;
    for (const remote of projects) {
      if (list.some((item) => item.id === remote.id)) continue;
      try {
        const data = await cloud.loadProject(remote.id);
        if (!data || typeof data !== 'object' || !data.project) continue;
        const { name, ...payload } = data;
        localStorage.setItem(DRAFT_PREFIX + remote.id, JSON.stringify(payload));
        list.unshift({ id: remote.id, name: name || remote.name || '云端项目', savedAt: payload.savedAt || remote.updatedAt, cloudSyncedAt: remote.updatedAt });
        pulled += 1;
      } catch { /* 单个失败忽略 */ }
    }
    if (migrated || pulled) {
      saveDraftList(pruneDraftList(list, activeDraftId()));
      refreshDraftUI();
      if (migrated) setStatus(`已同步 ${migrated} 个本地项目到云端${pulled ? `，并从云端拉回 ${pulled} 个项目` : ''}`, 'ok');
    }
    retryPendingCloudDeletes();
    // 覆盖保存语义：打开站点没有活动项目时，自动接续云端最新的项目（而不是新建副本）
    if (!activeDraftId() && list.length) {
      const latest = [...list].sort((a, b) => String(b.cloudSyncedAt || b.savedAt || '').localeCompare(String(a.cloudSyncedAt || a.savedAt || '')))[0];
      if (latest && restoreDraftById(latest.id)) {
        $('footer').textContent = `已接续项目「${latest.name}」${pendingModelMeta.some((item) => item.cloud) ? '，正在从云端恢复模型…' : ''}`.trim();
        refreshDraftUI();
      }
    }
    await pushProjectToCloud(); // 把启动时本地领先的活动项目立即推平
    if (activeDraftId()) hydrateCloudModels();
    setSyncDot('synced');
  } catch {
    cloudOnline = false;
    setSyncDot('off');
  }
}

/** 云端删除失败时记入待清理队列，恢复后重试（双删不阻塞 UI） */
function pendingCloudDeleteIds() {
  try { const list = JSON.parse(localStorage.getItem(CLOUD_DELETE_KEY)); return Array.isArray(list) ? list : []; } catch { return []; }
}

function queueCloudDelete(id) {
  if (!id) return;
  const list = pendingCloudDeleteIds();
  if (!list.includes(id)) list.push(id);
  localStorage.setItem(CLOUD_DELETE_KEY, JSON.stringify(list));
}

async function retryPendingCloudDeletes() {
  const list = pendingCloudDeleteIds();
  if (!list.length) return;
  const remaining = [];
  for (const id of list) {
    try { await cloud.deleteProject(id); } catch { remaining.push(id); }
  }
  localStorage.setItem(CLOUD_DELETE_KEY, JSON.stringify(remaining));
}

function cloudDeleteProject(id) {
  if (!cloud.available || !id) return;
  cloud.deleteProject(id).catch(() => queueCloudDelete(id));
}

/* —— 云端模型库：导入入口菜单 + 选择面板 —— */
let libraryCache = null; // [{hash, fileName, size, url, paths?}]
let libDensity = localStorage.getItem('modelqa-lib-density') || 'medium'; // large | medium | list
let libThumbObserver = null;
let libThumbItems = new Map(); // hash -> 条目（懒生成时反查 url/fileName）

function openImportMenu(anchor) {
  let menu = $('import-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'import-menu';
    menu.className = 'import-menu hidden';
    menu.innerHTML = '<button class="button" id="import-local" type="button">从本机导入</button><button class="button" id="import-folder" type="button" title="选择素材根目录，GLB 按子文件夹归入云端模型库分类">按文件夹导入（含子目录）</button><button class="button" id="import-cloud" type="button">从云端模型库选择</button>';
    document.body.appendChild(menu);
    const folderInput = document.createElement('input');
    folderInput.id = 'folder-input';
    folderInput.type = 'file';
    folderInput.multiple = true;
    folderInput.style.display = 'none';
    document.body.appendChild(folderInput);
    if ('webkitdirectory' in folderInput) folderInput.setAttribute('webkitdirectory', '');
    else { $('import-folder').disabled = true; $('import-folder').title = '当前浏览器不支持文件夹导入，请使用 Chrome / Edge'; }
    folderInput.onchange = (event) => {
      const picked = event.target.files;
      if (picked?.length) addFiles(picked);
      event.target.value = ''; // 允许重复选择同一目录刷新路径元数据
    };
    $('import-local').onclick = () => { closeImportMenu(); $('files').click(); };
    $('import-folder').onclick = () => { closeImportMenu(); folderInput.click(); };
    $('import-cloud').onclick = () => { closeImportMenu(); openModelLibrary(); };
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 230))}px`;
  menu.classList.remove('hidden');
}

function closeImportMenu() { $('import-menu')?.classList.add('hidden'); }
document.addEventListener('click', (event) => { if (!event.target.closest?.('#import-menu, #rail-import')) closeImportMenu(); });

/* 云端模型库筛选状态：libCat ''=全部 | '__uncat__'=未分类 | 大分类名（路径第一段）；libFilter 为状态筛选 */
let libCat = '';
let libFilter = 'all';

function openModelLibrary() {
  if (!cloud.available) { setStatus('未配置云端，模型库不可用', 'warn'); return; }
  if (!$('library-mask')) buildLibraryPanel();
  $('library-mask').classList.remove('hidden');
  libCat = '';
  libFilter = 'all';
  $('library-search').value = '';
  renderLibraryList('');
  if (!libraryCache) loadLibrary();
}

function closeModelLibrary() { $('library-mask')?.classList.add('hidden'); }

function buildLibraryPanel() {
  const el = document.createElement('div');
  el.id = 'library-mask';
  el.className = 'library-mask hidden';
  el.innerHTML = `<div class="library-panel" role="dialog" aria-label="云端模型库" data-density="${esc(libDensity)}"><div class="library-head"><h3>云端模型库</h3><div class="library-density" role="group" aria-label="缩略图密度"><button type="button" data-d="large" title="大图">大图</button><button type="button" data-d="medium" title="中图">中图</button><button type="button" data-d="list" title="列表">列表</button></div><button class="button" id="library-close" type="button">关闭</button></div><div class="library-layout"><div class="library-side"><input id="library-search" type="search" placeholder="按文件名搜索"><div id="library-cats" class="library-cats" aria-label="模型分类"></div><div id="library-filters" class="library-filters" aria-label="状态筛选"></div></div><div class="library-main"><div id="library-list" class="library-grid"></div><p class="library-hint">分类按项目使用自动归组，随编辑实时更新；点选即载入当前课程</p></div></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (event) => { if (event.target === el) closeModelLibrary(); });
  $('library-close').onclick = closeModelLibrary;
  $('library-search').oninput = (event) => renderLibraryList(event.target.value.trim().toLowerCase());
  el.querySelector('.library-density').querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      libDensity = btn.dataset.d;
      localStorage.setItem('modelqa-lib-density', libDensity);
      el.querySelector('.library-panel').dataset.density = libDensity;
      renderLibraryList($('library-search')?.value.trim().toLowerCase() || '');
    };
  });
}

function applyDensityActive(panelEl) {
  panelEl?.querySelectorAll('.library-density button').forEach((btn) => btn.classList.toggle('active', btn.dataset.d === libDensity));
}

/** 大分类归组（项目制）：分类 = 使用该模型的项目名（元数据 projects 由服务端在项目 PUT/DELETE 时维护）；
    未被任何项目使用的归「未使用」兜底节点。paths（素材路径）仍留档备查，不作主分类。 */
function libraryCategories() {
  const cats = new Map();
  (libraryCache || []).forEach((item) => {
    const itemCats = new Set((item.projects || []).map((p) => String(p.name || '')).filter(Boolean));
    if (!itemCats.size) itemCats.add('__unused__');
    itemCats.forEach((cat) => cats.set(cat, (cats.get(cat) || 0) + 1));
  });
  return [...cats.entries()].sort((a, b) => (a[0] === '__unused__' ? 1 : b[0] === '__unused__' ? -1 : a[0].localeCompare(b[0], 'zh')));
}

function usedHashes() {
  return new Set(Object.values(state.modelCloudRefs).map((ref) => ref.hash).filter(Boolean));
}

function filterCounts() {
  const used = usedHashes();
  const recentCutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const byTime = [...(libraryCache || [])].sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
  let recent = byTime.filter((item) => item.uploadedAt && new Date(item.uploadedAt.replace(' ', 'T')).getTime() >= recentCutoff).map((item) => item.hash);
  if (!recent.length) recent = byTime.slice(0, 20).map((item) => item.hash);
  const recentSet = new Set(recent);
  return {
    all: (libraryCache || []).length,
    recent: recentSet,
    used,
    unused: new Set((libraryCache || []).filter((item) => !used.has(item.hash)).map((item) => item.hash)),
  };
}

function renderLibrarySidebar(items) {
  const catEl = $('library-cats');
  if (catEl) {
    const cats = libraryCategories();
    const total = items.length;
    catEl.innerHTML = [`<button type="button" class="lib-cat${libCat === '' ? ' active' : ''}" data-cat=""><span>全部分类</span><span>${total}</span></button>`]
      .concat(cats.map(([cat, count]) => `<button type="button" class="lib-cat${libCat === cat ? ' active' : ''}" data-cat="${esc(cat)}"><span>${cat === '__unused__' ? '未使用' : esc(cat)}</span><span>${count}</span></button>`))
      .join('');
    catEl.querySelectorAll('.lib-cat').forEach((btn) => {
      btn.onclick = () => { libCat = btn.dataset.cat; renderLibraryList($('library-search')?.value.trim().toLowerCase() || ''); };
    });
  }
  const filterEl = $('library-filters');
  if (filterEl) {
    const counts = filterCounts();
    const defs = [['all', '全部', counts.all], ['recent', '最近导入', counts.recent.size], ['used', '本项目已用', counts.used.size], ['unused', '未使用', counts.unused.size]];
    filterEl.innerHTML = defs.map(([key, label, count]) => `<button type="button" class="lib-filter${libFilter === key ? ' active' : ''}" data-f="${key}"><span>${label}</span><span>${count}</span></button>`).join('');
    filterEl.querySelectorAll('.lib-filter').forEach((btn) => {
      btn.onclick = () => { libFilter = btn.dataset.f; renderLibraryList($('library-search')?.value.trim().toLowerCase() || ''); };
    });
  }
}

async function loadLibrary() {
  const listEl = $('library-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="draft-empty">正在加载模型库…</div>';
  try {
    const res = await cloud.listModels();
    libraryCache = Array.isArray(res.models) ? res.models : [];
  } catch {
    libraryCache = [];
    listEl.innerHTML = '<div class="draft-empty">模型库加载失败，请检查网络</div>';
    return;
  }
  renderLibraryList($('library-search')?.value.trim().toLowerCase() || '');
}

function renderLibraryList(query) {
  const listEl = $('library-list');
  if (!listEl || !libraryCache) return;
  const used = usedHashes();
  const counts = filterCounts();
  let items = (libraryCache || []).filter((item) => !query || item.fileName.toLowerCase().includes(query));
  if (libCat) {
    items = items.filter((item) => {
      const itemCats = (item.projects || []).map((p) => String(p.name || '')).filter(Boolean);
      return libCat === '__unused__' ? !itemCats.length : itemCats.includes(libCat);
    });
  }
  if (libFilter === 'recent') items = items.filter((item) => counts.recent.has(item.hash));
  else if (libFilter === 'used') items = items.filter((item) => counts.used.has(item.hash));
  else if (libFilter === 'unused') items = items.filter((item) => counts.unused.has(item.hash));
  applyDensityActive(listEl.closest('.library-panel'));
  renderLibrarySidebar(libraryCache || []);
  if (!items.length) {
    listEl.innerHTML = `<div class="draft-empty">${libraryCache.length ? '当前筛选无匹配模型' : '模型库还是空的：从本机或文件夹导入 GLB 后会自动入库'}</div>`;
    return;
  }
  libThumbItems = new Map(items.map((item) => [item.hash, item]));
  listEl.innerHTML = items.map((item) => `<button type="button" class="library-item library-card" data-url="${esc(item.url)}" data-hash="${esc(item.hash)}" data-file="${esc(item.fileName)}"><span class="library-thumb" data-hash="${esc(item.hash)}"></span><span class="library-card-body"><span class="library-item-name" title="${esc(item.fileName)}">${esc(item.fileName)}</span><span class="library-item-size">${used.has(item.hash) ? '<i class="library-badge">已用</i>' : ''}${esc(size(item.size))}</span></span></button>`).join('');
  listEl.querySelectorAll('.library-item').forEach((btn) => {
    btn.onclick = () => importFromLibrary({ url: btn.dataset.url, hash: btn.dataset.hash, fileName: btn.dataset.file });
  });
  observeLibraryThumbs(listEl);
}

/** 缩略图懒生成：卡片缩略区进入视口才离屏渲染（P0） */
function observeLibraryThumbs(listEl) {
  libThumbObserver?.disconnect();
  libThumbObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const span = entry.target;
      libThumbObserver.unobserve(span);
      const item = libThumbItems.get(span.dataset.hash);
      if (!item) return;
      span.classList.add('loading');
      getThumb(item).then((dataUrl) => {
        span.classList.remove('loading');
        if (dataUrl) span.style.backgroundImage = `url("${dataUrl}")`;
        else span.classList.add('no-thumb');
      });
    });
  }, { root: listEl, rootMargin: '120px' });
  listEl.querySelectorAll('.library-thumb').forEach((span) => libThumbObserver.observe(span));
}

async function importFromLibrary(ref) {
  const course = selectedCourse();
  if (!course) { setStatus('请先选择课程，再从模型库导入', 'warn'); return; }
  setStatus(`正在从云端加载「${ref.fileName}」…`, 'warn');
  try {
    const buffer = await cloud.fetchModel(ref.url);
    const gltf = await loader.parseAsync(buffer, '');
    const fileName = ref.fileName.endsWith('.glb') ? ref.fileName : `${ref.fileName}.glb`;
    const model = {
      modelId: uid('model'),
      fileName,
      displayName: fileName.replace(/\.glb$/i, ''),
      version: state.project.version || 'V1.0',
      sortOrder: state.models.length + 1,
      courseId: course.courseId,
      requirement: '',
      file: new File([buffer], fileName, { type: 'model/gltf-binary' }),
      gltf,
      nodes: collectNodes(gltf),
    };
    // 当前项目有待恢复的同名元数据时回填（与 addFiles 同规则）
    const pending = pendingModelMeta.find((item) => item.fileName === model.fileName && (item.courseId === course.courseId || item.courseId === 'uncategorized'));
    if (pending) {
      model.modelId = pending.modelId || model.modelId;
      model.displayName = pending.displayName || model.displayName;
      model.requirement = pending.requirement || '';
      model.version = pending.version || model.version;
      model.courseId = pending.courseId && pending.courseId !== 'uncategorized' ? pending.courseId : course.courseId;
      model.sortOrder = pending.sortOrder ?? model.sortOrder;
      bindPendingNodes(model.nodes, pending.nodes);
      pendingModelMeta = pendingModelMeta.filter((item) => item !== pending);
    }
    state.models.push(model);
    state.modelCloudRefs[model.modelId] = { hash: ref.hash, url: ref.url, size: model.file.size }; // 已在库中，直接记引用不再上传
    closeModelLibrary();
    refreshAll();
    selectModel(model.modelId);
    markDraft(`已从模型库导入「${model.displayName}」到 ${course.code} ${course.name}`);
  } catch {
    setStatus(`「${ref.fileName}」从云端加载失败`, 'error');
  }
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
  const input = prompt('项目名称', fallback || defaultDraftName());
  if (input === null) return null;
  return input.trim() || '未命名项目';
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
  if (nameEl) nameEl.textContent = activeMeta?.name || '项目';
  const listEl = $('draft-list');
  if (!listEl) return;
  if (!list.length) {
    listEl.innerHTML = '<div class="draft-empty">暂无项目，编辑后会自动保存</div>';
    return;
  }
  listEl.innerHTML = list.map((item) => {
    const badge = !cloud.available ? '<span class="draft-item-badge b-off">离线</span>'
      : item.cloudSyncedAt ? '<span class="draft-item-badge b-synced">已同步</span>'
      : '<span class="draft-item-badge b-pending">待同步</span>';
    return `<div class="draft-item${item.id === activeId ? ' active' : ''}" data-id="${item.id}" role="option" aria-selected="${item.id === activeId}"><button type="button" class="draft-item-main" data-action="switch" title="切换到该项目"><span class="draft-item-name">${esc(item.name)}${badge}</span><span class="draft-item-time">${esc(draftTimeLabel(item.savedAt))}</span></button><div class="draft-item-ops"><button type="button" class="draft-op" data-action="rename" title="重命名">改</button><button type="button" class="draft-op" data-action="saveas" title="另存为新项目">存</button><button type="button" class="draft-op" data-action="copy" title="复制项目">复</button><button type="button" class="draft-op danger" data-action="delete" title="删除项目">删</button></div></div>`;
  }).join('');
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
        else if (action === 'delete') armDelete(btn, id);
      };
    });
  });
}

/* 行内二次确认删除：不依赖浏览器 confirm（可能被「阻止此页面创建对话框」静默吞掉） */
function armDelete(btn, id) {
  if (btn.dataset.armed) {
    deleteDraft(id);
    return;
  }
  document.querySelectorAll('.draft-op.armed').forEach(resetArmedDelete);
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = '确认删除';
  btn.classList.add('armed');
  setTimeout(() => resetArmedDelete(btn), 3000);
}

function resetArmedDelete(btn) {
  if (!btn.dataset.armed) return;
  delete btn.dataset.armed;
  btn.textContent = btn.dataset.label || '删';
  btn.classList.remove('armed');
}

function switchDraft(id) {
  if (id === activeDraftId()) { closeDraftPanel(); return; }
  if (draftDirty && !confirm('当前项目有未保存改动，切换后将丢失。继续切换？')) return;
  if (!restoreDraftById(id)) { setStatus('项目不存在或已损坏', 'error'); return; }
  const meta = listDrafts().find((item) => item.id === id);
  const hasCloudModels = pendingModelMeta.some((item) => item.cloud);
  $('footer').textContent = `已切换到项目「${meta?.name || ''}」${hasCloudModels ? '，正在从云端恢复模型…' : '；请重新导入 GLB'}`;
  refreshDraftUI();
  closeDraftPanel();
}

function createDraftFromCurrent(name) {
  const id = uid('draft');
  if (!writeDraft(id, name)) return;
  setActiveDraftId(id);
  $('footer').textContent = `已创建项目「${name}」`;
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
  if (!confirm('新建空白项目将清空当前工作区，当前项目已保留。继续？')) return;
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
  $('footer').textContent = `已新建项目「${name}」；请导入 GLB`;
  refreshDraftUI();
  closeDraftPanel();
}

function renameDraft(id) {
  const list = listDrafts();
  const meta = list.find((item) => item.id === id);
  if (!meta) return;
  const name = promptDraftName(meta.name);
  if (name === null || name === meta.name) return;
  const payload = readDraftPayload(id);
  if (payload) {
    payload.project = { ...payload.project, name, displayTitle: name };
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(payload));
  }
  meta.name = name;
  saveDraftList(list);
  if (id === activeDraftId()) {
    // 活动项目：同步改项目本身（表单 + 状态），自动保存会把新名推到云端
    state.project = { ...state.project, name, displayTitle: name };
    $('project-name').value = name;
    $('display-title').value = name;
    $('project-title').textContent = name;
    markDraft('项目已重命名');
  } else {
    pushProjectToCloud(id);
  }
  refreshDraftUI();
  setStatus(`项目已重命名为「${name}」`, 'ok');
}

function copyDraft(id) {
  const source = readDraftPayload(id);
  const meta = listDrafts().find((item) => item.id === id);
  if (!source) { setStatus('源项目不存在或已损坏', 'error'); return; }
  const name = promptDraftName(`${meta?.name || '项目'}-副本`);
  if (name === null) return;
  const newId = uid('draft');
  const savedAt = now();
  localStorage.setItem(DRAFT_PREFIX + newId, JSON.stringify({ ...source, savedAt }));
  const list = listDrafts();
  list.unshift({ id: newId, name, savedAt });
  saveDraftList(pruneDraftList(list, newId));
  refreshDraftUI();
  pushProjectToCloud(newId); // 副本直接推云端
  setStatus(`已复制为「${name}」`, 'ok');
}

function deleteDraft(id) {
  const list = listDrafts();
  const meta = list.find((item) => item.id === id);
  if (!meta) return;
  localStorage.removeItem(DRAFT_PREFIX + id);
  cloudDeleteProject(id);
  const next = list.filter((item) => item.id !== id);
  saveDraftList(next);
  if (activeDraftId() === id) {
    if (next.length) {
      restoreDraftById(next[0].id);
      $('footer').textContent = `已删除并切换到项目「${next[0].name}」${pendingModelMeta.some((item) => item.cloud) ? '，正在从云端恢复模型…' : '；请重新导入 GLB'}`;
    } else {
      setActiveDraftId('');
      clearWorkspaceModels();
      state.project = { projectId: 'AN-REVIEW-001', displayTitle: '4. 模拟电路实训室', name: '模拟电路实训室', version: 'V1.0', templateVersion: '1.2', courses: defaultCourses.map((course) => ({ ...course })) };
      state.reviews = { byModel: {} };
      state.selectedCourseId = null;
      const fieldMap = { displayTitle: 'display-title', projectId: 'project-id', name: 'project-name', version: 'project-version' };
      Object.entries(fieldMap).forEach(([key, fieldId]) => { $(fieldId).value = state.project[key] || ''; });
      refreshAll();
      $('footer').textContent = '已删除当前项目，工作区已重置';
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
    const hasCloudModels = pendingModelMeta.some((item) => item.cloud);
    $('footer').textContent = `已恢复项目「${meta?.name || ''}」${meta?.savedAt ? `（${draftTimeLabel(meta.savedAt)}）` : ''}${hasCloudModels ? '，正在从云端恢复模型…' : '；请重新导入 GLB'}`.trim();
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
    $('rail-import').textContent = `导入到 ${target.code}`;
    $('rail-import').title = `将 GLB 导入「${target.code} ${target.name}」`;
    $('rail-import').disabled = false;
  } else {
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
$('rail-import').onclick = (event) => { event.stopPropagation(); openImportMenu($('rail-import')); };
$('rail-prev').onclick = () => $('course-cards').scrollBy({ left: -260, behavior: 'smooth' });
$('rail-next').onclick = () => $('course-cards').scrollBy({ left: 260, behavior: 'smooth' });
function updateCourseRailControls() { const rail = $('course-cards'); $('rail-prev').disabled = rail.scrollLeft <= 1; $('rail-next').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1; }
$('course-cards').addEventListener('scroll', updateCourseRailControls, { passive: true });
window.addEventListener('resize', updateCourseRailControls);
function moveModelToCourse(modelId, courseId) { const model = state.models.find((item) => item.modelId === modelId); if (!model || model.courseId === courseId) return; model.courseId = courseId; model.sortOrder = Math.max(0, ...state.models.filter((item) => item.courseId === courseId).map((item) => item.sortOrder)) + 1; state.selectedCourseId = courseId; refreshModels(); populateModel(); markDraft('模型已移动到新课程'); }
function disposeObject(root) { root?.traverse((node) => { if (!node.isMesh) return; node.geometry?.dispose?.(); for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material?.dispose?.(); }); }
function deleteModel(modelId) { const model = state.models.find((item) => item.modelId === modelId); if (!model) return; const issueCount = state.reviews.byModel[modelId]?.issues?.length || 0; const detail = issueCount ? `模型“${model.displayName}”已有 ${issueCount} 条审核问题，删除后会一并删除这些问题。` : `确认删除模型“${model.displayName}”？`; if (!confirm(`${detail}\n此操作不可恢复。`)) return; if (state.currentId === modelId) { resetHighlight(model.gltf.scene); scene.remove(model.gltf.scene); disposeObject(model.gltf.scene); state.currentId = null; state.selected = null; } state.models = state.models.filter((item) => item.modelId !== modelId); delete state.modelCloudRefs[modelId]; delete state.reviews.byModel[modelId]; if (!current()) { $('hud').textContent = '未选择模型'; } refreshAll(); markDraft('模型及其审核问题已删除'); }
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
function collectNodes(gltf) {
  const nodes = [];
  gltf.scene.traverse((node) => {
    if (node === gltf.scene) return;
    const id = node.userData?.persistentNodeId || node.userData?.extras?.persistentNodeId || candidate(node, gltf.scene);
    nodes.push({ nodePath: path(node, gltf.scene), nodeName: node.name || '未命名节点', persistentNodeId: id, candidate: !node.userData?.extras?.persistentNodeId, nodeType: node.type });
  });
  return nodes;
}

function bindPendingNodes(nodes, pendingNodes) {
  if (!Array.isArray(pendingNodes)) return;
  for (const node of nodes) {
    const bound = pendingNodes.find((item) => item.nodePath === node.nodePath);
    if (bound?.persistentNodeId) { node.persistentNodeId = bound.persistentNodeId; node.candidate = !!bound.candidate; }
  }
}

/** webkitRelativePath 归一化：反斜杠转 /、去首尾斜杠；无路径语义（单文件导入）返回空串 */
function normalizeRelPath(file) {
  const raw = file?.webkitRelativePath || '';
  return String(raw).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

async function addFiles(files, opts = {}) {
  const course = selectedCourse();
  if (!course) { setStatus('请先选择课程，再导入 GLB', 'warn'); return; }
  const forceRelPath = typeof opts.relPath === 'string' ? opts.relPath : '';
  const glbFiles = [...files].filter((item) => item.name.toLowerCase().endsWith('.glb'));
  let restoredCount = 0;
  for (const file of glbFiles) {
    try {
      const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
      const relPath = forceRelPath || normalizeRelPath(file);
      const model = { modelId: uid('model'), fileName: file.name, displayName: file.name.replace(/\.glb$/i, ''), version: state.project.version || 'V1.0', sortOrder: state.models.length + 1, courseId: course.courseId, requirement: '', relPath, file, gltf, nodes: collectNodes(gltf) };
      const pending = pendingModelMeta.find((item) => item.fileName === file.name && (item.courseId === course.courseId || item.courseId === 'uncategorized'));
      if (pending) {
        model.modelId = pending.modelId || model.modelId;
        model.displayName = pending.displayName || model.displayName;
        model.requirement = pending.requirement || '';
        model.version = pending.version || model.version;
        model.courseId = pending.courseId && pending.courseId !== 'uncategorized' ? pending.courseId : course.courseId;
        model.sortOrder = pending.sortOrder ?? model.sortOrder;
        bindPendingNodes(model.nodes, pending.nodes);
        pendingModelMeta = pendingModelMeta.filter((item) => item !== pending);
        restoredCount += 1;
      }
      state.models.push(model);
      uploadModelToCloud(model);
    } catch { setStatus(`${file.name} 加载失败`, 'error'); }
  }
  refreshAll();
  if (!state.currentId && state.models[0]) selectModel(state.models[0].modelId);
  $('files').value = '';
  const restoreNote = restoredCount ? `，已恢复 ${restoredCount} 个模型元数据` : '';
  markDraft(`已导入 ${glbFiles.length} 个模型到 ${course.code} ${course.name}${restoreNote}`);
}
function updatePackage() { const total = state.models.reduce((sum, model) => sum + model.file.size, 0); $('bytes').textContent = size(total); $('single').disabled = !total || total > LIMIT; $('zip').disabled = !total; if (total) setStatus(total > LIMIT ? '超过 20 MB，请使用 ZIP' : '可导出单 HTML 或 ZIP', total > LIMIT ? 'warn' : 'ok'); }
function refreshAll() { syncProject(); refreshCourseEditor(); refreshModels(); populateModel(); refreshTree(); }
function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function chunks(buffer) { const bytes = new Uint8Array(buffer), result = []; for (let offset = 0; offset < bytes.length; offset += 0x8000) { let text = ''; for (const byte of bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))) text += String.fromCharCode(byte); result.push(btoa(text)); } return result; }
async function payload(inline) { const project = projectData(); return { schemaVersion: 2, submitToken: (typeof __CLOUD_SUBMIT_TOKEN__ !== 'undefined' ? __CLOUD_SUBMIT_TOKEN__ : '') || undefined, project: { ...project, models: await Promise.all(state.models.map(async (model) => ({ ...project.models.find((item) => item.modelId === model.modelId), base64Chunks: inline ? chunks(await model.file.arrayBuffer()) : undefined }))) }, review: { ...state.reviews, projectId: project.projectId, projectConclusion: '', updatedAt: now() }, mode: inline ? 'inline' : 'folder' }; }
/* 未审审核包壳（单 HTML 导出与 ZIP 内 审核器.html 共用）；页签兜底名与审核端 PAGE_TITLE 常量保持一致 */
function reviewerHtml(data) { return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"><title>3D 模型审核</title></head><body><div id="app"></div><script>window.__AN_REVIEW_PAYLOAD__=${JSON.stringify(data).replace(/</g, '\\u003c')};</script><script>${reviewerRuntime}</script></body></html>`; }
/* —— 审核包在线预览上传（P2）：最近产物记录 + toast + 一键上传 —— */
const LAST_PACKAGE_KEY = 'an-review-last-package';
let lastPackage = null; // { html, filename }（仅内存；刷新后需重新导出）

let toastTimer = null;
function showToast(html, timeout = 8000) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (timeout) toastTimer = setTimeout(() => el.classList.remove('show'), timeout);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('链接已复制到剪贴板', 'ok');
  } catch {
    try {
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      setStatus('链接已复制到剪贴板', 'ok');
    } catch { setStatus('复制失败，请手动复制链接', 'warn'); }
  }
}

function updateUploadButton() {
  const btn = $('upload-preview');
  if (!btn) return;
  let meta = null;
  try { meta = JSON.parse(localStorage.getItem(LAST_PACKAGE_KEY)); } catch { /* ignore */ }
  const known = Boolean(lastPackage || meta?.filename);
  btn.disabled = !known;
  btn.textContent = '上传在线预览';
  btn.title = lastPackage
    ? `将最近导出的「${lastPackage.filename}」上传为在线预览链接`
    : meta?.filename
      ? `上次导出「${meta.filename}」的内容已不在内存（页面刷新过），点击后请先重新导出单 HTML`
      : '将最近一次导出的单 HTML 审核包上传为在线预览链接';
  // 最近导出文件名单独一行小字展示，超长省略 + 悬停全文，避免拼进按钮文案撑爆宽度
  const hint = $('upload-hint');
  if (hint) {
    const filename = lastPackage?.filename || meta?.filename || '';
    hint.textContent = filename ? `最近导出：${filename}` : '';
    hint.title = filename;
    hint.hidden = !filename;
  }
}

function rememberPackage(html, filename) {
  lastPackage = { html, filename };
  localStorage.setItem(LAST_PACKAGE_KEY, JSON.stringify({ filename, savedAt: now() }));
  updateUploadButton();
}

function bindToastUpload() {
  const btn = $('toast-upload');
  if (btn) btn.onclick = uploadLastPackage;
}

async function uploadLastPackage() {
  if (!cloud.available) { setStatus('未配置云端 Token，无法上传在线预览', 'warn'); return; }
  if (!lastPackage) { setStatus('最近导出内容已不在内存（页面刷新过），请重新导出单 HTML 后再上传', 'warn'); return; }
  showToast(`「${esc(lastPackage.filename)}」已下载，正在上传在线预览…`, 0);
  try {
    const res = await cloud.uploadReviewPackage(lastPackage.html, lastPackage.filename.replace(/\.html$/i, ''));
    showToast(`在线预览已生成，可直接发给审核员：<a class="toast-link" href="${esc(res.url)}" target="_blank" rel="noopener">${esc(res.url)}</a><button class="button" id="toast-copy" type="button">复制链接</button>`, 0);
    $('toast-copy').onclick = () => copyText(res.url);
    setStatus('审核包已上传，链接可发给审核员', 'ok');
    markDraft('审核包已上传在线预览');
  } catch {
    setStatus('审核包上传失败（文件已下载成功），请检查网络后重试', 'error');
    showToast('文件已下载，上传失败<button class="button" id="toast-upload" type="button">重试</button>');
    bindToastUpload();
  }
}

function notifyExported(kind, filename, html) {
  if (kind === 'single') {
    // 一键导出+上传：下载后自动上传在线预览，toast 直接给出链接（失败可重试）
    rememberPackage(html, filename);
    uploadLastPackage();
  } else {
    showToast(`已导出「${esc(filename)}」（在线预览请使用单 HTML 导出）`);
  }
}

/* —— 在线预览链接管理（P3）：未审/已审页签 + 行内二次确认删除 —— */
let reviewLinksCache = null;
let reviewLinksTab = 'pending';
let reviewLinksGen = 0;
const REVIEWLINKS_ICON = {
  refresh: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.55-3.7M13.2 2.7v2.9h-2.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3H4.2A1.7 1.7 0 0 0 2.5 4.7V11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  del: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.8 4.4h10.4M6.4 4.4V3.2h3.2v1.2M4.6 4.4l.55 8.2a1.1 1.1 0 0 0 1.1 1h2.5a1.1 1.1 0 0 0 1.1-1l.55-8.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M7 3.5h6.6l4.9 4.9V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13.2 3.8v5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

function buildReviewLinksPanel() {
  const el = document.createElement('div');
  el.id = 'reviewlinks-mask';
  el.className = 'library-mask hidden';
  el.innerHTML = `<div class="library-panel reviewlinks-panel" role="dialog" aria-label="在线预览链接管理"><div class="library-head reviewlinks-head"><div class="reviewlinks-title"><h3>在线预览链接</h3><span class="reviewlinks-count" id="reviewlinks-count">0</span></div><div class="reviewlinks-head-ops"><button class="button reviewlinks-iconbtn" id="reviewlinks-refresh" type="button" title="重新拉取服务器列表" aria-label="刷新">${REVIEWLINKS_ICON.refresh}</button><button class="button reviewlinks-iconbtn" id="reviewlinks-close" type="button" title="关闭" aria-label="关闭">×</button></div></div><div class="reviewlinks-tabs"><button class="reviewlinks-tab" id="tab-pending" type="button">未审核</button><button class="reviewlinks-tab" id="tab-reviewed" type="button">已审核</button></div><div class="reviewlinks-search"><input id="reviewlinks-search" type="text" placeholder="按课程名搜索…" autocomplete="off" /></div><div id="reviewlinks-list" class="reviewlinks-list"></div><p class="library-hint">删除后链接立即失效（文件移入归档，可人工恢复）</p></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (event) => { if (event.target === el) closeReviewLinks(); });
  $('reviewlinks-close').onclick = closeReviewLinks;
  $('tab-pending').onclick = () => { reviewLinksTab = 'pending'; renderReviewLinks(); };
  $('tab-reviewed').onclick = () => { reviewLinksTab = 'reviewed'; renderReviewLinks(); };
  $('reviewlinks-refresh').onclick = () => { reviewLinksCache = null; renderReviewLinks(); };
  $('reviewlinks-search').oninput = () => renderReviewLinks();
}

function openReviewLinks() {
  if (!cloud.available) { setStatus('未配置云端，链接管理不可用', 'warn'); return; }
  if (!$('reviewlinks-mask')) buildReviewLinksPanel();
  $('reviewlinks-mask').classList.remove('hidden');
  reviewLinksCache = null;
  renderReviewLinks();
}
function closeReviewLinks() { $('reviewlinks-mask')?.classList.add('hidden'); }

async function renderReviewLinks() {
  const listEl = $('reviewlinks-list');
  if (!listEl) return;
  // 代际令牌：并发渲染时（如刷新后立刻切页签），后恢复的过期响应不得覆盖新状态
  const gen = ++reviewLinksGen;
  $('tab-pending')?.classList.toggle('active', reviewLinksTab === 'pending');
  $('tab-reviewed')?.classList.toggle('active', reviewLinksTab === 'reviewed');
  if (!reviewLinksCache) {
    listEl.innerHTML = '<div class="draft-empty">正在加载…</div>';
    try {
      const res = await cloud.listReviews();
      if (gen !== reviewLinksGen) return;
      reviewLinksCache = Array.isArray(res.reviews) ? res.reviews : [];
    } catch {
      if (gen !== reviewLinksGen) return;
      listEl.innerHTML = '<div class="draft-empty">加载失败，请检查网络后点「刷新」重试</div>';
      return;
    }
  }
  const kw = ($('reviewlinks-search')?.value || '').trim().toLowerCase();
  // 成对去重：原始链接一旦有对应的已审产物即被取代，两个页签都不再显示（删除已审版后自动恢复）。
  // 配对规则双兼容：新服务端用 sidecar 元数据（同名 name + reviewed 标志），旧服务端回退「-已审」后缀约定。
  // 注意不看原始条目自身的 reviewed 标志——旧服务端会把有已审产物的原始条目也标成 reviewed=true
  const nameKey = (n) => n.replace(/\.html$/i, '');
  const reviewedKeys = new Set(
    reviewLinksCache.filter((item) => item.reviewed).map((item) => nameKey(item.name))
      .flatMap((key) => [key, key.replace(/-已审$/, '')])
  );
  const superseded = (item) => {
    const key = nameKey(item.name);
    return !key.endsWith('-已审') && reviewedKeys.has(key);
  };
  const items = reviewLinksCache.filter((item) => (reviewLinksTab === 'reviewed' ? item.reviewed : !item.reviewed) && !superseded(item) && (!kw || item.name.toLowerCase().includes(kw)));
  const countEl = $('reviewlinks-count');
  if (countEl) countEl.textContent = String(items.length);
  if (!items.length) {
    const emptyMain = kw ? `没有匹配「${kw}」的链接` : reviewLinksTab === 'reviewed' ? '还没有已回传的审核结果' : '还没有未审核的链接';
    const emptySub = kw ? '换个关键词试试' : reviewLinksTab === 'reviewed' ? '审核端打开链接点「回传审核结果」后出现在这里' : '导出单 HTML 后自动上传到服务器';
    listEl.innerHTML = `<div class="reviewlinks-empty">${REVIEWLINKS_ICON.file}<p class="reviewlinks-empty-main">${esc(emptyMain)}</p><p class="reviewlinks-empty-sub">${esc(emptySub)}</p></div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => `<div class="reviewlinks-item" data-name="${esc(item.name)}" data-url="${esc(item.url)}"><div class="reviewlinks-info"><span class="reviewlinks-name">${esc(item.name.replace(/\.html$/i, ''))}</span><span class="reviewlinks-meta">${esc(item.uploadedAt.replace('T', ' '))} · ${esc(size(item.size))}</span></div><div class="reviewlinks-ops"><button class="button" data-op="open" type="button">打开</button><button class="button reviewlinks-iconbtn" data-op="copy" type="button" title="复制链接" aria-label="复制链接">${REVIEWLINKS_ICON.copy}</button><button class="button reviewlinks-iconbtn" data-op="delete" type="button" title="删除" aria-label="删除">${REVIEWLINKS_ICON.del}</button></div></div>`).join('');
  listEl.querySelectorAll('.reviewlinks-item').forEach((row) => {
    const url = row.dataset.url;
    const name = row.dataset.name;
    row.querySelector('[data-op="open"]').onclick = () => window.open(url, '_blank', 'noopener');
    row.querySelector('[data-op="copy"]').onclick = () => copyText(url);
    const delBtn = row.querySelector('[data-op="delete"]');
    delBtn.onclick = () => {
      // 行内二次确认：首点变红显示「确认删除」，3s 超时还原图标（不依赖浏览器 confirm）
      if (delBtn.dataset.confirm !== '1') {
        delBtn.dataset.confirm = '1';
        delBtn.textContent = '确认删除';
        delBtn.classList.add('confirming');
        setTimeout(() => { delBtn.dataset.confirm = ''; delBtn.innerHTML = REVIEWLINKS_ICON.del; delBtn.classList.remove('confirming'); }, 3000);
        return;
      }
      deleteReviewLink(name);
    };
  });
}

async function deleteReviewLink(name) {
  setStatus(`正在删除「${name}」…`, 'warn');
  try {
    await cloud.deleteReview(name);
    reviewLinksCache = null;
    await renderReviewLinks();
    setStatus('链接已删除（文件已移入归档）', 'ok');
  } catch {
    setStatus('删除失败，请重试', 'error');
  }
}

async function exportSingle() {
  if (state.models.reduce((sum, model) => sum + model.file.size, 0) > LIMIT) return setStatus('超过 20 MB，请使用 ZIP', 'error');
  const data = await payload(true);
  const filename = `${safeName(state.project.name)}-审核器.html`;
  // 原始包名随 payload 注入：服务端短 ID 托管后 URL 不再含原名，审核端回传时从这里取（旧长链 URL 回退仍有效）
  data.upload = { origFilename: filename };
  const html = reviewerHtml(data);
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
  notifyExported('single', filename, html);
  markDraft('单 HTML 已导出');
}
async function exportZip() {
  const data = await payload(false);
  data.project.models = data.project.models.map((model) => ({ ...model, fileName: safeName(model.fileName) }));
  const files = {
    '审核器.html': strToU8(reviewerHtml(data)),
    'project.json': strToU8(JSON.stringify(data.project, null, 2)),
    'review/issues.json': strToU8(JSON.stringify(data.review, null, 2)),
  };
  for (const model of state.models) files[`models/${safeName(model.fileName)}`] = new Uint8Array(await model.file.arrayBuffer());
  for (const topic of [FOCUS_PART_TOPIC, LOAD_PACKAGE_TOPIC]) {
    const gifFile = topic.media?.file;
    if (!gifFile) continue;
    try {
      const res = await fetch(topic.base + gifFile);
      if (res.ok) files[`help/focus-part/${gifFile}`] = new Uint8Array(await res.arrayBuffer());
    } catch { /* 离线无 help 资源时跳过 */ }
  }
  download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${safeName(state.project.name)}-审核包.zip`);
  notifyExported('zip', `${safeName(state.project.name)}-审核包.zip`, null);
  markDraft('ZIP 审核包已导出');
}
function resize() { viewer.resize(); }

$('tree-filter').oninput = (event) => { state.treeQuery = event.target.value; refreshTree(); };
$('files').onchange = (event) => addFiles(event.target.files);
$('save').onclick = () => { flushDraftSave(); setStatus(cloud.available ? '项目已保存，正在同步到云端' : '项目已保存（未配置云端）', 'ok'); };
$('draft-toggle').onclick = (event) => { event.stopPropagation(); if ($('draft-panel').classList.contains('hidden')) openDraftPanel(); else closeDraftPanel(); };
$('draft-new').onclick = (event) => { event.stopPropagation(); newDraft(); };
$('draft-saveas').onclick = (event) => { event.stopPropagation(); saveDraftAs(); };
document.addEventListener('click', (event) => { if (!event.target.closest?.('.draft-menu')) closeDraftPanel(); });
window.addEventListener('beforeunload', (event) => {
  if (draftDirty) flushDraftSave();
  // 有模型还没传到云端（引用缺失）时阻止静默离开，避免"重开就丢模型"
  if (cloud.available && state.models.some((model) => !state.modelCloudRefs[model.modelId])) {
    event.preventDefault();
    event.returnValue = '';
  }
});
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
bindViewportTools(viewer, { explodeBtn: $('explode'), explodeSlider: $('explode-slider'), explodeRange: $('explode-range'), explodeValue: $('explode-value'), labelsBtn: $('labels') });
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
$('single').onclick = exportSingle; $('zip').onclick = exportZip;
$('upload-preview').onclick = uploadLastPackage;
$('review-links').onclick = openReviewLinks;
if ($('review-links')) $('review-links').disabled = !cloud.available;
['display-title', 'project-id', 'project-name', 'project-version'].forEach((id) => $(id).oninput = () => { syncProject(); markDraft(); });
$("model-name").oninput = () => { const model = current(); if (!model) return; model.displayName = $('model-name').value.trim() || model.fileName.replace(/\.glb$/i, ''); refreshModels(); markDraft(); };
$("model-course").onchange = (event) => { const model = current(); if (model) moveModelToCourse(model.modelId, event.target.value); };
$("model-requirement").oninput = () => { const model = current(); if (model) { model.requirement = $('model-requirement').value.trim(); markDraft(); } };
resize(); refreshAll(); bootDrafts(); reconcileCloud(); updateUploadButton();
mountHelpHotspot({ mount: document.getElementById('tree-help-slot'), topic: FOCUS_PART_TOPIC });
(() => { const raw = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (globalThis.__APP_VERSION__ || ''); const el = $('app-version'); if (el) el.textContent = raw ? `v${raw}` : ''; })();
