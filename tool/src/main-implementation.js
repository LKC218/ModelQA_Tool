import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import reviewerRuntime from './generated/reviewer-runtime.js?raw';
import { renderCourseRail, renderTree, emptyState, nodeDisplayName } from './shared-components.js';
import './shared-ui.css';
import './styles.css';

const LIMIT = 20 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const loader = new GLTFLoader();
const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const safeName = (value) => String(value || '审核项目').replace(/[\\/:*?"<>|]/g, '_').trim() || '审核项目';
const defaultCourses = [['AN-01', '二极管认知与检测'], ['AN-02', '整流电路连接与检测'], ['AN-03', '滤波电路'], ['AN-04', '晶体管认知与检测'], ['AN-05', '单管放大电路'], ['AN-06', '集成运放认识'], ['AN-07', '转向灯不闪光故障检修']].map(([code, name], index) => ({ courseId: `course-${code}`, code, name, sortOrder: index + 1 }));
const state = { project: { projectId: 'AN-REVIEW-001', displayTitle: '4. 模拟电路实训室', name: '模拟电路实训室', version: 'V1.0', templateVersion: '1.2', courses: defaultCourses }, models: [], reviews: { byModel: {} }, currentId: null, selected: null, selectedCourseId: null, courseMenuId: null, courseQuery: '', draggedModelId: null, wire: false, expanded: new Set(defaultCourses.map((course) => course.courseId)) };

document.querySelector('#app').innerHTML = `<div class="tool-shell"><header class="topbar"><h1 id="project-title">4. 模拟电路实训室</h1><div class="actions"><button class="button theme-toggle" id="theme-toggle" type="button" title="切换主题" aria-label="切换到暗色主题">🌙</button><button class="button" id="save">保存草稿</button><button class="button" id="restore">恢复草稿</button><button class="button" id="open-settings" type="button" title="项目信息与课程编辑">项目设置</button><button class="button primary" id="export">导出审核包</button></div></header><nav class="course-rail" aria-label="课程选择"><div class="course-rail-heading"><span class="course-rail-step">选课</span><span id="rail-current" class="course-rail-current">点击卡片选择导入课程</span></div><div class="course-rail-main"><button class="rail-scroll" id="rail-prev" type="button" aria-label="查看上一组课程">‹</button><div id="course-cards" class="course-cards" tabindex="0"></div><button class="rail-scroll" id="rail-next" type="button" aria-label="查看下一组课程">›</button><button class="button rail-import" id="rail-import" type="button" disabled>先选择课程</button></div><div id="course-menu" class="course-menu hidden"></div></nav><main class="workspace"><aside class="sidebar left"><section class="panel legacy-course-panel"><div class="panel-heading"><h2>课程模型</h2><button class="text-button hidden" id="import" disabled>导入 GLB</button></div><p id="import-target" class="import-target">导入到：未选择课程</p><input id="files" type="file" accept=".glb,model/gltf-binary" multiple hidden><div id="models" class="course-list"></div></section><section class="panel tree-panel"><div class="panel-heading"><h2>模型层级</h2><span id="nodes">—</span></div><div id="tree-crumb" class="tree-crumb hidden"></div><div id="tree" class="tree"><div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">⌗</div><p class="tree-empty-title">选择模型后显示层级</p><p class="tree-empty-hint">导入 GLB 并选中模型，这里会列出全部零件</p></div></div></section></aside><section class="center"><div id="viewer" class="viewer-view"><canvas id="canvas"></canvas><div class="viewer-hud"><b id="hud">未选择模型</b></div><div class="viewer-toolbar"><button class="icon-button" id="fit" title="适配模型">适配</button><button class="icon-button" id="wire" title="线框查看">线框</button></div></div></section><aside class="sidebar right"><section class="panel"><div class="panel-heading"><h2>当前模型</h2><span id="model-state">-</span></div><label>名称<input id="model-name" disabled></label><label>所属课程<select id="model-course" disabled></select></label><label>审核要求<textarea id="model-requirement" placeholder="模型结构是否完整，外观与命名是否符合教学需求" disabled></textarea></label></section><section class="panel"><div class="panel-heading"><h2>问题定位</h2><span id="binding">-</span></div><div id="current-part" class="current-part">当前零件：未选择</div><details class="advanced"><summary>高级信息</summary><dl class="facts"><div><dt>节点路径</dt><dd id="node-path">-</dd></div><div><dt>节点标识</dt><dd id="node-id">-</dd></div></dl><label>persistentNodeId<input id="persistent-id" disabled></label></details><div class="binding-actions"><button class="button full" id="apply-id" disabled>将问题关联到此零件</button><button class="text-button full" id="replace-node" disabled>更换零件</button></div></section><section class="panel package-panel"><div class="panel-heading"><h2>审核包</h2><span id="bytes">0 B</span></div><button class="button primary full" id="single" disabled>单 HTML</button><button class="button full" id="zip" disabled>ZIP</button><p id="status" class="status">选择课程后可导入模型</p></section></aside></main><footer class="footer"><span id="footer">草稿未保存</span></footer><div id="drawer" class="drawer hidden" aria-hidden="true"><div class="drawer-mask" id="drawer-mask"></div><aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="项目设置"><div class="panel-heading"><h2>项目设置</h2><button class="icon-button" id="close-settings" type="button" aria-label="关闭项目设置">×</button></div><div class="config-block"><h2>项目信息</h2><div class="field-grid"><label>项目标题<input id="display-title" value="4. 模拟电路实训室"></label><label>项目编号<input id="project-id" value="AN-REVIEW-001"></label><label>项目名称<input id="project-name" value="模拟电路实训室"></label><label>版本<input id="project-version" value="V1.0"></label></div></div><div class="config-block"><div class="panel-heading"><h2>课程</h2><button class="text-button" id="add-course" type="button">添加课程</button></div><div id="course-editor" class="course-editor"></div></div></aside></div></div>`;

const THEME_KEY = 'modelqa-theme';
function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function themeTokens(theme) {
  return theme === 'dark'
    ? { bg: 0x080909, outline: 0xffb347, outlineHidden: 0x6b3a12, env: 0.55, bgInt: 0.28 }
    : { bg: 0xe8efe9, outline: 0x2f9b6a, outlineHidden: 0x1a5c3e, env: 0.72, bgInt: 0.45 };
}
function applyTheme(theme, persist = true) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist) localStorage.setItem(THEME_KEY, next);
  const tokens = themeTokens(next);
  scene.background = new THREE.Color(tokens.bg);
  scene.environmentIntensity = tokens.env;
  scene.backgroundIntensity = tokens.bgInt;
  outlinePass.visibleEdgeColor.set(tokens.outline);
  outlinePass.hiddenEdgeColor.set(tokens.outlineHidden);
  const btn = $('theme-toggle');
  if (btn) {
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
    btn.title = next === 'dark' ? '切换到亮色主题' : '切换到暗色主题';
    btn.setAttribute('aria-label', btn.title);
  }
}
document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';

const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8efe9);
const camera = new THREE.PerspectiveCamera(45, 1, .01, 1000); camera.position.set(2.8, 2.2, 4.2);
const renderer = new THREE.WebGLRenderer({ canvas: $('canvas'), antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
outlinePass.edgeStrength = 3;
outlinePass.edgeGlow = 0;
outlinePass.edgeThickness = 1;
outlinePass.pulsePeriod = 0;
outlinePass.visibleEdgeColor.set(0xffb347);
outlinePass.hiddenEdgeColor.set(0x6b3a12);
composer.addPass(outlinePass);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .075;
scene.environmentIntensity = 0.55; scene.backgroundIntensity = 0.28; scene.backgroundBlurriness = 0.38;
scene.add(new THREE.HemisphereLight(0xffffff, 0x252a31, 0.7)); const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(4, 6, 5); scene.add(key); const fill = new THREE.DirectionalLight(0xb9d5ff, 0.38); fill.position.set(-4, 2, -3); scene.add(fill);
const rgbeLoader = new RGBELoader(); const pmremGenerator = new THREE.PMREMGenerator(renderer); pmremGenerator.compileEquirectangularShader();
rgbeLoader.load('/hdri/brown_photostudio_02_2k.hdr', (texture) => { texture.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmremGenerator.fromEquirectangular(texture).texture; scene.background = texture; pmremGenerator.dispose(); }, undefined, (error) => console.warn('HDRI 加载失败，使用中性灯光回退', error));
applyTheme(currentTheme(), false);
$('theme-toggle').onclick = () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
const current = () => state.models.find((model) => model.modelId === state.currentId);
const selectedCourse = () => state.project.courses.find((course) => course.courseId === state.selectedCourseId);
const size = (bytes) => !bytes ? '0 B' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function path(node, root = current()?.gltf.scene) { const parts = []; for (let item = node; item && item !== root; item = item.parent) parts.unshift(`${item.name || '未命名节点'}[${item.parent ? item.parent.children.indexOf(item) + 1 : 1}]`); return parts.join(' / '); }
function candidate(node, root) { return `path:${path(node, root).replace(/\s+/g, '')}`; }
function syncProject() { state.project = { ...state.project, displayTitle: $('display-title').value.trim(), projectId: $('project-id').value.trim(), name: $('project-name').value.trim(), version: $('project-version').value.trim() }; $('project-title').textContent = state.project.displayTitle || state.project.name || '未命名项目'; }
function markDraft(text = '草稿待保存') { $('footer').textContent = text; }
function setStatus(text, type = '') { $('status').textContent = text; $('status').className = `status ${type}`; }
function projectData() { syncProject(); return { ...state.project, generatedAt: now(), courses: [...state.project.courses].sort((a, b) => a.sortOrder - b.sortOrder), models: state.models.map(({ modelId, fileName, displayName, version, sortOrder, courseId, requirement, file, nodes }) => ({ modelId, fileName, displayName, version, sortOrder, courseId, requirement, byteLength: file.size, nodes })) }; }
function refreshCourseEditor() { $('course-editor').innerHTML = state.project.courses.sort((a, b) => a.sortOrder - b.sortOrder).map((course) => `<div class="course-edit" data-course="${course.courseId}"><input data-key="code" value="${esc(course.code)}"><input data-key="name" value="${esc(course.name)}"><button class="remove-course" title="删除课程">×</button></div>`).join(''); document.querySelectorAll('.course-edit input').forEach((input) => input.oninput = (event) => { const course = state.project.courses.find((item) => item.courseId === event.target.closest('.course-edit').dataset.course); course[event.target.dataset.key] = event.target.value.trim(); refreshModels(); markDraft(); }); document.querySelectorAll('.remove-course').forEach((button) => button.onclick = (event) => { const id = event.target.closest('.course-edit').dataset.course; if (state.models.some((model) => model.courseId === id) && !confirm('该课程下仍有模型，删除课程后模型会移入“未归类”。继续吗？')) return; state.models.forEach((model) => { if (model.courseId === id) model.courseId = 'uncategorized'; }); state.project.courses = state.project.courses.filter((course) => course.courseId !== id); if (state.selectedCourseId === id) state.selectedCourseId = null; refreshAll(); markDraft(); }); }
function refreshModelsBase() { const courses = [...state.project.courses, { courseId: 'uncategorized', code: '', name: '未归类', sortOrder: Number.MAX_SAFE_INTEGER }]; $('models').innerHTML = courses.map((course) => { const models = state.models.filter((model) => model.courseId === course.courseId).sort((a, b) => a.sortOrder - b.sortOrder); if (!models.length && course.courseId === 'uncategorized') return ''; const open = state.expanded.has(course.courseId); return `<div class="course-group" data-course-group="${course.courseId}"><button class="course-row ${state.selectedCourseId === course.courseId ? 'selected' : ''}" data-course-toggle="${course.courseId}"><span>${open ? '▾' : '▸'} <b>${esc(course.code ? `${course.code} ${course.name}` : course.name)}</b></span><small>${models.length}</small></button><div class="course-models ${open ? '' : 'collapsed'}">${models.map((model) => `<div class="model-row ${model.modelId === state.currentId ? 'active' : ''}" draggable="true" data-model="${model.modelId}"><button class="model-select" type="button">${esc(model.displayName)}</button><button class="delete-model" type="button" title="删除模型" aria-label="删除 ${esc(model.displayName)}">×</button></div>`).join('')}</div></div>`; }).join('') || emptyState('⌗', '暂无模型', '选择课程后导入 GLB'); document.querySelectorAll('[data-course-toggle]').forEach((button) => button.onclick = () => selectCourse(button.dataset.courseToggle, true)); document.querySelectorAll('.model-select').forEach((button) => button.onclick = (event) => selectModel(event.target.closest('[data-model]').dataset.model)); document.querySelectorAll('.delete-model').forEach((button) => button.onclick = (event) => deleteModel(event.target.closest('[data-model]').dataset.model)); document.querySelectorAll('[data-model]').forEach((row) => { row.ondragstart = (event) => { state.draggedModelId = row.dataset.model; event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); }; row.ondragend = () => { state.draggedModelId = null; document.querySelectorAll('.course-group').forEach((group) => group.classList.remove('drop-target')); }; }); document.querySelectorAll('[data-course-group]').forEach((group) => { group.ondragover = (event) => { if (!state.draggedModelId) return; event.preventDefault(); group.classList.add('drop-target'); }; group.ondragleave = (event) => { if (!group.contains(event.relatedTarget)) group.classList.remove('drop-target'); }; group.ondrop = (event) => { event.preventDefault(); group.classList.remove('drop-target'); moveModelToCourse(state.draggedModelId, group.dataset.courseGroup); }; }); const target = selectedCourse(); const importButton = $('import'); importButton.disabled = !target; importButton.classList.toggle('hidden', !target); $('import-target').textContent = `导入到：${target ? `${target.code} ${target.name}` : '未选择课程'}`; updatePackage(); }
function courseModels(courseId) { return state.models.filter((model) => model.courseId === courseId).sort((a, b) => a.sortOrder - b.sortOrder); }
function refreshCourseRail() {
  renderCourseRail({
    cardsEl: $('course-cards'),
    menuEl: $('course-menu'),
    courses: state.project.courses,
    modelsOf: courseModels,
    modelTitle: (model) => model.displayName,
    metaHtml: (models) => `<span class="course-card-count">${models.length}</span> 模型`,
    activeCourseId: state.selectedCourseId,
    currentModelId: state.currentId,
    menuCourseId: state.courseMenuId,
    query: state.courseQuery,
    onSelectCourse: (courseId) => selectCourse(courseId),
    onMenuToggle: (courseId) => { state.courseMenuId = state.courseMenuId === courseId ? null : courseId; state.courseQuery = ''; refreshCourseRail(); },
    onMenuClose: () => { state.courseMenuId = null; refreshCourseRail(); },
    onQueryChange: (value) => { state.courseQuery = value; refreshCourseRail(); },
    onMenuModelOpen: (modelId) => { selectModel(modelId); state.courseMenuId = null; refreshCourseRail(); },
    onDeleteModel: (modelId) => deleteModel(modelId),
    drag: {
      rowStart: (modelId, event, row) => { state.draggedModelId = modelId; event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); },
      rowEnd: () => { state.draggedModelId = null; document.querySelectorAll('.course-card').forEach((card) => card.classList.remove('drop-target')); },
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
function selectCourse(courseId) { if (courseId === 'uncategorized') return; state.selectedCourseId = courseId; state.courseMenuId = null; state.courseQuery = ''; refreshModels(); setStatus(`当前导入课程：${selectedCourse()?.code || ''} ${selectedCourse()?.name || ''}`, 'ok'); }
function selectModel(id) { const model = state.models.find((item) => item.modelId === id); if (model?.courseId && model.courseId !== 'uncategorized') state.selectedCourseId = model.courseId; selectModelBase(id); }
document.addEventListener('pointerdown', (event) => { if (state.courseMenuId && !event.target.closest('.course-rail')) { state.courseMenuId = null; refreshCourseRail(); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.courseMenuId) { state.courseMenuId = null; refreshCourseRail(); } });
$('rail-import').onclick = () => $('files').click();
$('rail-prev').onclick = () => $('course-cards').scrollBy({ left: -260, behavior: 'smooth' });
$('rail-next').onclick = () => $('course-cards').scrollBy({ left: 260, behavior: 'smooth' });
function updateCourseRailControls() { const rail = $('course-cards'); $('rail-prev').disabled = rail.scrollLeft <= 1; $('rail-next').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1; }
$('course-cards').addEventListener('scroll', updateCourseRailControls, { passive: true });
window.addEventListener('resize', updateCourseRailControls);
function moveModelToCourse(modelId, courseId) { const model = state.models.find((item) => item.modelId === modelId); if (!model || model.courseId === courseId) return; model.courseId = courseId; model.sortOrder = Math.max(0, ...state.models.filter((item) => item.courseId === courseId).map((item) => item.sortOrder)) + 1; state.expanded.add(courseId); refreshModels(); populateModel(); markDraft('模型已移动到新课程'); }
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
    $('tree').innerHTML = emptyState('⌗', '选择模型后显示层级', '导入 GLB 并选中模型，这里会列出全部零件');
    return;
  }
  $('nodes').textContent = `${model.nodes.length} 节点`;
  renderTree($('tree'), model.gltf.scene, { selected: state.selected, onSelect: selectNode });
}
function highlightMeshes(node) { if (!node) return []; if (node.isMesh) return [node]; return node.children.filter((child) => child.isMesh); }
function resetHighlight() { outlinePass.selectedObjects = []; }
function clearNodePanel() { state.selected = null; $('current-part').textContent = '当前零件：未选择'; $('node-path').textContent = '-'; $('node-id').textContent = '-'; $('persistent-id').value = ''; $('persistent-id').disabled = true; $('apply-id').disabled = true; $('replace-node').disabled = true; $('binding').textContent = '-'; updateTreeCrumb(); }
function selectNode(node) { const model = current(); if (!model) return; resetHighlight(); state.selected = node; outlinePass.selectedObjects = highlightMeshes(node); const record = model.nodes.find((item) => item.nodePath === path(node)); $('current-part').textContent = `当前零件：${model.displayName} / ${node.name || '未命名节点'}`; $('node-path').textContent = path(node); $('node-id').textContent = record?.persistentNodeId || '-'; $('persistent-id').value = record?.persistentNodeId || candidate(node, model.gltf.scene); $('persistent-id').disabled = false; $('apply-id').disabled = false; $('replace-node').disabled = false; $('binding').textContent = record?.candidate ? '候选' : '已关联'; refreshTree(); }
function fit() { const root = current()?.gltf.scene; if (!root) return; const box = new THREE.Box3().setFromObject(root), center = box.getCenter(new THREE.Vector3()), dimensions = box.getSize(new THREE.Vector3()), radius = Math.max(dimensions.length() * .55, .2); controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(radius * .85, radius * .65, radius * 1.2)); camera.near = Math.max(radius / 100, .001); camera.far = radius * 100; camera.updateProjectionMatrix(); controls.update(); }
function populateModel() { const model = current(); ['model-name', 'model-course', 'model-requirement'].forEach((id) => $(id).disabled = !model); $('model-name').value = model?.displayName || ''; $('model-course').innerHTML = state.project.courses.map((course) => `<option value="${course.courseId}">${esc(`${course.code} ${course.name}`)}</option>`).join('') + '<option value="uncategorized">未归类</option>'; $('model-course').value = model?.courseId || 'uncategorized'; $('model-requirement').value = model?.requirement || ''; $('model-state').textContent = model ? `${model.nodes.length} 节点` : '-'; }
function selectModelBase(id) { const model = state.models.find((item) => item.modelId === id); if (!model) return; const old = current(); if (old) { resetHighlight(old.gltf.scene); scene.remove(old.gltf.scene); } state.currentId = id; state.selected = null; scene.add(model.gltf.scene); $('hud').textContent = model.displayName; $('nodes').textContent = `${model.nodes.length}`; clearNodePanel(); populateModel(); refreshModels(); refreshTree(); resize(); fit(); }
async function addFiles(files) { const course = selectedCourse(); if (!course) { setStatus('请先选择课程，再导入 GLB', 'warn'); return; } const glbFiles = [...files].filter((item) => item.name.toLowerCase().endsWith('.glb')); for (const file of glbFiles) { try { const gltf = await loader.parseAsync(await file.arrayBuffer(), ''); const nodes = []; gltf.scene.traverse((node) => { if (node === gltf.scene) return; const id = node.userData?.persistentNodeId || node.userData?.extras?.persistentNodeId || candidate(node, gltf.scene); nodes.push({ nodePath: path(node, gltf.scene), nodeName: node.name || '未命名节点', persistentNodeId: id, candidate: !node.userData?.extras?.persistentNodeId, nodeType: node.type }); }); state.models.push({ modelId: uid('model'), fileName: file.name, displayName: file.name.replace(/\.glb$/i, ''), version: state.project.version || 'V1.0', sortOrder: state.models.length + 1, courseId: course.courseId, requirement: '', file, gltf, nodes }); } catch { setStatus(`${file.name} 加载失败`, 'error'); } } refreshAll(); if (!state.currentId && state.models[0]) selectModel(state.models[0].modelId); $('files').value = ''; markDraft(`已导入 ${glbFiles.length} 个模型到 ${course.code} ${course.name}`); }
function updatePackage() { const total = state.models.reduce((sum, model) => sum + model.file.size, 0); $('bytes').textContent = size(total); $('single').disabled = !total || total > LIMIT; $('zip').disabled = !total; $('export').disabled = !total; if (total) setStatus(total > LIMIT ? '超过 20 MB，请使用 ZIP' : '可导出单 HTML 或 ZIP', total > LIMIT ? 'warn' : 'ok'); }
function refreshAll() { syncProject(); refreshCourseEditor(); refreshModels(); populateModel(); refreshTree(); }
function saveDraft() { syncProject(); localStorage.setItem('an-review-draft', JSON.stringify({ project: state.project, models: projectData().models, review: state.reviews, savedAt: now() })); markDraft('草稿已保存；恢复后需重新导入 GLB'); }
function restoreDraft() { try { const draft = JSON.parse(localStorage.getItem('an-review-draft')); if (!draft) return setStatus('未找到草稿'); state.project = { ...state.project, ...draft.project, courses: draft.project.courses?.length ? draft.project.courses : defaultCourses }; state.reviews = draft.review || { byModel: {} }; ['displayTitle', 'projectId', 'name', 'version'].forEach((key) => $({ displayTitle: 'display-title', projectId: 'project-id', name: 'project-name', version: 'project-version' }[key]).value = state.project[key] || ''); state.selectedCourseId = null; refreshAll(); markDraft('已恢复项目设置；请重新导入 GLB'); } catch { setStatus('草稿格式无效', 'error'); } }
function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function chunks(buffer) { const bytes = new Uint8Array(buffer), result = []; for (let offset = 0; offset < bytes.length; offset += 0x8000) { let text = ''; for (const byte of bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))) text += String.fromCharCode(byte); result.push(btoa(text)); } return result; }
async function payload(inline) { const project = projectData(); return { schemaVersion: 2, project: { ...project, models: await Promise.all(state.models.map(async (model) => ({ ...project.models.find((item) => item.modelId === model.modelId), base64Chunks: inline ? chunks(await model.file.arrayBuffer()) : undefined }))) }, review: { ...state.reviews, projectId: project.projectId, projectConclusion: '', updatedAt: now() }, mode: inline ? 'inline' : 'folder' }; }
function reviewerHtml(data) { return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>离线模型审核</title></head><body><div id="app"></div><script>window.__AN_REVIEW_PAYLOAD__=${JSON.stringify(data).replace(/</g, '\\u003c')};</script><script>${reviewerRuntime}</script></body></html>`; }
async function exportSingle() { if (state.models.reduce((sum, model) => sum + model.file.size, 0) > LIMIT) return setStatus('超过 20 MB，请使用 ZIP', 'error'); download(new Blob([reviewerHtml(await payload(true))], { type: 'text/html;charset=utf-8' }), `${safeName(state.project.name)}-审核器.html`); markDraft('单 HTML 已导出'); }
async function exportZip() { const data = await payload(false); data.project.models = data.project.models.map((model) => ({ ...model, fileName: safeName(model.fileName) })); const files = { '审核器.html': strToU8(reviewerHtml(data)), 'project.json': strToU8(JSON.stringify(data.project, null, 2)), 'review/issues.json': strToU8(JSON.stringify(data.review, null, 2)) }; for (const model of state.models) files[`models/${safeName(model.fileName)}`] = new Uint8Array(await model.file.arrayBuffer()); download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${safeName(state.project.name)}-审核包.zip`); markDraft('ZIP 审核包已导出'); }
function resize() { const rect = $('canvas').getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); composer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); }

$('import').onclick = () => $('files').click(); $('files').onchange = (event) => addFiles(event.target.files); $('save').onclick = saveDraft; $('restore').onclick = restoreDraft;
$('add-course').onclick = () => { const course = { courseId: uid('course'), code: `AN-${String(state.project.courses.length + 1).padStart(2, '0')}`, name: '新课程', sortOrder: state.project.courses.length + 1 }; state.project.courses.push(course); state.selectedCourseId = course.courseId; state.expanded.add(course.courseId); refreshAll(); markDraft(); };
const drawer = $('drawer');
function openDrawer() { drawer.classList.remove('hidden'); drawer.setAttribute('aria-hidden', 'false'); }
function closeDrawer() { drawer.classList.add('hidden'); drawer.setAttribute('aria-hidden', 'true'); }
$('open-settings').onclick = openDrawer;
$('close-settings').onclick = closeDrawer;
$('drawer-mask').onclick = closeDrawer;
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !drawer.classList.contains('hidden')) closeDrawer(); }); $('fit').onclick = fit;
$('wire').onclick = () => { state.wire = !state.wire; current()?.gltf.scene.traverse((node) => node.isMesh && (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => material.wireframe = state.wire)); $('wire').classList.toggle('active', state.wire); };
$('replace-node').onclick = () => { if (current()) resetHighlight(current().gltf.scene); clearNodePanel(); refreshTree(); setStatus('请选择需要关联问题的零件'); };
$('apply-id').onclick = () => { const model = current(), node = state.selected, id = $('persistent-id').value.trim(); if (!model || !node || !id) return; const record = model.nodes.find((item) => item.nodePath === path(node)); if (record) { record.persistentNodeId = id; record.candidate = false; } selectNode(node); markDraft('问题已关联到当前零件'); };
$('single').onclick = exportSingle; $('zip').onclick = exportZip; $('export').onclick = () => state.models.reduce((sum, model) => sum + model.file.size, 0) > LIMIT ? exportZip() : exportSingle();
['display-title', 'project-id', 'project-name', 'project-version'].forEach((id) => $(id).oninput = () => { syncProject(); markDraft(); });
$("model-name").oninput = () => { const model = current(); if (!model) return; model.displayName = $('model-name').value.trim() || model.fileName.replace(/\.glb$/i, ''); refreshModels(); markDraft(); };
$("model-course").onchange = (event) => { const model = current(); if (model) moveModelToCourse(model.modelId, event.target.value); };
$("model-requirement").oninput = () => { const model = current(); if (model) { model.requirement = $('model-requirement').value.trim(); markDraft(); } };
renderer.domElement.addEventListener('pointerdown', (event) => { const root = current()?.gltf.scene; if (!root || event.button !== 0) return; const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(root, true)[0]; if (hit) selectNode(hit.object); });
window.addEventListener('resize', resize); new ResizeObserver(resize).observe(document.querySelector('.center')); resize(); refreshAll();
function animate() { requestAnimationFrame(animate); controls.update(); composer.render(); } animate();
