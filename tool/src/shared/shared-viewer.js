import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* 双端共享的 3D 产品级视口：场景 / 相机 / 渲染管线 / 控制器 / 灯光 / HDRI 环境一次搭建，两端注入业务差异。
   渲染基准参照 three.js 官方产品渲染示例：IBL 环境照明为主 + 单 key light，ACES 色调映射与 sRGB
   输出由管线末端的 OutputPass 完成（后处理链不加 OutputPass 会整体发黑发灰）。
   端差异（拾取、线框、主题令牌、隔离业务）仍留在各端实现文件中。 */
export function createProductViewer({
  canvas,
  hdriSource = '/hdri/brown_photostudio_02_2k.hdr',
  exposure = 0.92,
  resizeSource = null,
  getRoot = null,
  onEnvironmentReady = null,
  onViewStateChanged = null,
}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8efe9);
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 1000); camera.position.set(2.8, 2.2, 4.2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  /* hover 淡描边在下；选中为双层：暗环（halo）在下、彩色芯线在上，亮底/银色材质上仍可读 */
  const hoverPass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  hoverPass.edgeStrength = 2.5; hoverPass.edgeGlow = 0; hoverPass.edgeThickness = 1; hoverPass.pulsePeriod = 0;
  hoverPass.visibleEdgeColor.set(0x1a7a50); hoverPass.hiddenEdgeColor.set(0x0a2a1a);
  composer.addPass(hoverPass);
  const outlineHaloPass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outlineHaloPass.edgeStrength = 8; outlineHaloPass.edgeGlow = 0; outlineHaloPass.edgeThickness = 4; outlineHaloPass.pulsePeriod = 0;
  outlineHaloPass.visibleEdgeColor.set(0x0a1f14); outlineHaloPass.hiddenEdgeColor.set(0x050a07);
  composer.addPass(outlineHaloPass);
  const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outlinePass.edgeStrength = 6; outlinePass.edgeGlow = 0; outlinePass.edgeThickness = 2; outlinePass.pulsePeriod = 0;
  outlinePass.visibleEdgeColor.set(0x0b6b42); outlinePass.hiddenEdgeColor.set(0x0a2a1a);
  composer.addPass(outlinePass);
  composer.addPass(new OutputPass());
  function setOutlineTargets(meshes) {
    selectOutlineTargets = meshes || [];
    outlinePass.selectedObjects = selectOutlineTargets;
    outlineHaloPass.selectedObjects = selectOutlineTargets;
    if (selectOutlineTargets.length) selectFxStart = performance.now();
  }
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .075;
  /* 灯光基准参照官方汽车示例：IBL 环境承担全局照明，仅保留一盏 key light 负责高光与投影 */
  const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(4, 6, 5);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  /* 接触阴影地面：ShadowMaterial 只显示投影本身，任意模型尺寸在 fit() 时按包围盒落位 */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  /* OutlinePass 的深度/掩码子渲染若扫到地面，会在地平线产生伪梯度并吞掉模型轮廓边
     （实测症状：选中无描边、地面外缘被描边）。让两个描边 pass 隐藏选中对象时一并隐藏地面。 */
  function excludeGroundFromOutline(pass) {
    if (typeof pass._changeVisibilityOfSelectedObjects !== 'function') return;
    const original = pass._changeVisibilityOfSelectedObjects.bind(pass);
    let groundVisible = true;
    pass._changeVisibilityOfSelectedObjects = (bVisible) => {
      original(bVisible);
      if (bVisible === false) { groundVisible = ground.visible; ground.visible = false; }
      else ground.visible = groundVisible;
    };
  }
  excludeGroundFromOutline(outlinePass); excludeGroundFromOutline(outlineHaloPass); excludeGroundFromOutline(hoverPass);
  const rgbeLoader = new RGBELoader(); const pmremGenerator = new THREE.PMREMGenerator(renderer); pmremGenerator.compileEquirectangularShader();
  rgbeLoader.load(hdriSource, (texture) => { texture.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmremGenerator.fromEquirectangular(texture).texture; pmremGenerator.dispose(); onEnvironmentReady?.(); }, undefined, (error) => console.warn('HDRI 加载失败，使用中性灯光回退', error));

  /* —— 标注层与爆炸状态（必须在首次 resize() 前初始化，resize/animate 都引用 labelRenderer） —— */
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'viewer-labels-layer';
  labelRenderer.domElement.setAttribute('aria-hidden', 'true');
  const labelHost = canvas.parentElement || document.body;
  if (getComputedStyle(labelHost).position === 'static') labelHost.style.position = 'relative';
  labelHost.appendChild(labelRenderer.domElement);
  const labelGroup = new THREE.Group(); labelGroup.visible = false; scene.add(labelGroup);
  const leaderMaterial = new THREE.LineBasicMaterial({ color: 0x0b6b42, transparent: true, opacity: 0.85 });
  let labelsOn = false;
  const LABEL_LIMIT = 24;

  let explodeRoot = null;
  let explodeParts = [];      /* { node, originalPos, offsetLocal } */
  let explodeFactor = 0;
  let explodeTarget = 0;
  const viewStateListeners = [];

  function resize() { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); composer.setSize(rect.width, rect.height); labelRenderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); }
  function fit(root) {
    if (!root) return;
    const box = new THREE.Box3().setFromObject(root), center = box.getCenter(new THREE.Vector3()), dimensions = box.getSize(new THREE.Vector3()), radius = Math.max(dimensions.length() * .55, .2);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(radius * .85, radius * .65, radius * 1.2));
    camera.near = Math.max(radius / 100, .001); camera.far = radius * 100; camera.updateProjectionMatrix();
    controls.maxPolarAngle = Math.PI * .495;
    /* key light 与阴影相机随包围盒缩放落位，保证任意尺寸模型的阴影贴图都覆盖有效区域 */
    key.position.copy(center).add(new THREE.Vector3(radius * 1.5, radius * 2.5, radius * 1.2));
    key.target.position.copy(center); key.target.updateMatrixWorld();
    const shadowCam = key.shadow.camera;
    shadowCam.left = -radius; shadowCam.right = radius; shadowCam.top = radius; shadowCam.bottom = -radius;
    shadowCam.near = radius * .5; shadowCam.far = radius * 8; shadowCam.updateProjectionMatrix();
    ground.scale.setScalar(radius * 6);
    ground.position.set(center.x, box.min.y - radius * .002, center.z);
    controls.update();
  }
  /* 模型入场景前调用：开启投影（阴影接收只在地面，避免模型自阴影痤疮） */
  function prepareModel(root) { root?.traverse((node) => { if (node.isMesh) node.castShadow = true; }); }
  window.addEventListener('resize', resize);
  if (resizeSource) new ResizeObserver(resize).observe(resizeSource);
  resize();

  /* —— 选中动效：瞬时打亮 400ms → 稳态低频呼吸；叠加选中件微 emissive —— */
  const SELECT_BASE = { outlineS: 6, haloS: 8, outlineT: 2, haloT: 4 };
  const SELECT_PEAK = { outlineS: 12, haloS: 14, outlineT: 3, haloT: 5 };
  const SELECT_BOOST_MS = 400;
  const SELECT_PULSE_MS = 2000;
  let selectFxStart = 0;
  let selectOutlineTargets = [];
  const glowOwners = new Map();
  const glowColor = new THREE.Color(0x0b6b42);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  function updateSelectOutlineFx() {
    if (!selectOutlineTargets.length) {
      outlinePass.edgeStrength = SELECT_BASE.outlineS;
      outlineHaloPass.edgeStrength = SELECT_BASE.haloS;
      outlinePass.edgeThickness = SELECT_BASE.outlineT;
      outlineHaloPass.edgeThickness = SELECT_BASE.haloT;
      return;
    }
    const elapsed = performance.now() - selectFxStart;
    let k;
    if (elapsed < SELECT_BOOST_MS) k = 1 - easeOutCubic(elapsed / SELECT_BOOST_MS);
    else {
      const amp = isolatedNode ? 0.22 : 0.12;
      k = amp * (0.5 + 0.5 * Math.sin(((elapsed - SELECT_BOOST_MS) / SELECT_PULSE_MS) * Math.PI * 2));
    }
    outlinePass.edgeStrength = SELECT_BASE.outlineS + (SELECT_PEAK.outlineS - SELECT_BASE.outlineS) * k;
    outlineHaloPass.edgeStrength = SELECT_BASE.haloS + (SELECT_PEAK.haloS - SELECT_BASE.haloS) * k;
    outlinePass.edgeThickness = SELECT_BASE.outlineT + (SELECT_PEAK.outlineT - SELECT_BASE.outlineT) * k;
    outlineHaloPass.edgeThickness = SELECT_BASE.haloT + (SELECT_PEAK.haloT - SELECT_BASE.haloT) * k;
  }
  function clearSelectGlow() {
    for (const [mesh, original] of glowOwners) {
      const current = mesh.material;
      if (current && current !== original) (Array.isArray(current) ? current : [current]).forEach((m) => m?.dispose?.());
      mesh.material = original;
    }
    glowOwners.clear();
  }
  function applySelectGlow(node) {
    clearSelectGlow();
    if (!node) return;
    const wrap = (material) => {
      const clone = material.clone();
      if (clone.emissive) { clone.emissive.copy(glowColor); clone.emissiveIntensity = 0.18; }
      if (stateWire) clone.wireframe = true;
      return clone;
    };
    for (const mesh of collectMeshes(node)) {
      if (glowOwners.has(mesh) || ghostOwners.has(mesh)) continue;
      const source = mesh.material;
      glowOwners.set(mesh, source);
      mesh.material = Array.isArray(source) ? source.map(wrap) : wrap(source);
    }
  }
  function animate() { requestAnimationFrame(animate); controls.update(); tickExplode(); updateSelectOutlineFx(); composer.render(); labelRenderer.render(scene, camera); watchModelRoot(); }

  /* hover 双态：pointermove 节流射线；隔离中禁用 hover，避免和淡化锁定冲突 */
  const hoverRaycaster = new THREE.Raycaster(); const hoverPointer = new THREE.Vector2();
  let lastHoverCheck = 0; let hoverObject = null; let selectedObject = null;
  const isWithin = (node, ancestor) => { for (let item = node; item; item = item.parent) { if (item === ancestor) return true; } return false; };
  function isInIsolated(node) { return isolatedNode != null && isWithin(node, isolatedNode); }
  function clearHover() { hoverObject = null; hoverPass.selectedObjects = []; canvas.style.cursor = ''; }
  canvas.addEventListener('pointermove', (event) => {
    if (isolatedNode) { if (hoverObject) clearHover(); return; }
    const stamp = performance.now();
    if (stamp - lastHoverCheck < 40) return; lastHoverCheck = stamp;
    const root = getRoot?.();
    const rect = canvas.getBoundingClientRect();
    hoverPointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    hoverRaycaster.setFromCamera(hoverPointer, camera);
    const hit = root ? hoverRaycaster.intersectObject(root, true)[0] : null;
    const target = hit && !isWithin(hit.object, selectedObject) && !ghostOwners.has(hit.object) ? hit.object : null;
    if (target !== hoverObject) {
      hoverObject = target;
      hoverPass.selectedObjects = target ? [target] : [];
      canvas.style.cursor = target ? 'pointer' : '';
    }
  });
  /* 零件隔离：非选中 mesh 克隆材质做幽灵淡化（opacity 0.15 / depthWrite false），纯视图态不写业务数据 */
  const ghostOwners = new Set();
  const ghostOriginal = new WeakMap();
  let isolatedNode = null;
  let stateWire = false;
  function collectMeshes(node) {
    const meshes = [];
    node?.traverse((item) => { if (item.isMesh) meshes.push(item); });
    return meshes;
  }
  function restoreGhostMeshes(root) {
    root?.traverse((node) => {
      if (!node.isMesh || !ghostOriginal.has(node)) return;
      const ghost = Array.isArray(node.material) ? node.material : [node.material];
      ghost.forEach((material) => material?.dispose?.());
      node.material = ghostOriginal.get(node);
      ghostOriginal.delete(node);
      node.renderOrder = 0;
      ghostOwners.delete(node);
    });
  }
  function clearIsolate() {
    restoreGhostMeshes(getRoot?.());
    isolatedNode = null;
    clearHover();
  }
  function setIsolate(node) {
    const root = getRoot?.();
    if (!root || !node) return clearIsolate();
    restoreGhostMeshes(root);
    const keep = new Set(collectMeshes(node));
    root.traverse((item) => {
      if (!item.isMesh || keep.has(item)) return;
      const source = Array.isArray(item.material) ? item.material : [item.material];
      const ghost = source.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = 0.15;
        clone.depthWrite = false;
        if (stateWire) clone.wireframe = true;
        return clone;
      });
      ghostOriginal.set(item, item.material);
      item.material = Array.isArray(item.material) ? ghost : ghost[0];
      const world = new THREE.Vector3();
      item.getWorldPosition(world);
      item.renderOrder = 500 + Math.round(world.distanceTo(camera.position) * 8);
      ghostOwners.add(item);
    });
    isolatedNode = node;
    clearHover();
  }
  function toggleIsolate(node = selectedObject) {
    if (isolatedNode && node && isolatedNode === node) clearIsolate();
    else if (node) setIsolate(node);
    else clearIsolate();
    return isolatedNode;
  }
  /* 选中态：更新描边目标、瞬时打亮相位、微 emissive；隔离目标由树/按钮显式 setIsolate */
  function setSelected(node) {
    selectedObject = node;
    selectFxStart = performance.now();
    if (node) applySelectGlow(node); else clearSelectGlow();
    if (hoverObject && (isWithin(hoverObject, selectedObject) || ghostOwners.has(hoverObject))) clearHover();
  }

  /* 线框开关由端调用，隔离克隆材质需要同步 wireframe */
  function setWireframe(on) {
    stateWire = !!on;
    const root = getRoot?.();
    root?.traverse((node) => {
      if (!node.isMesh) return;
      (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => { material.wireframe = stateWire; });
    });
  }

  /* —— 爆炸视图：按根下一层子节点（唯一分组时下钻一层）为爆炸单元，
        沿「单元世界中心 → 模型整体中心」反向偏移，世界偏移经父矩阵求逆换算为本地偏移。
        滑块即时、按钮 0↔1 指数趋近平滑；切模型自动还原位置并归零（onViewStateChanged 通知端）。
        状态变量与 labelRenderer 初始化见文件前部（首次 resize 前）。 —— */

  function cleanPartName(node) { return (node.name || '').replace(/_Empty$/i, '') || '未命名部件'; }
  function unitMeshCount(unit) { let count = 0; unit.traverse((item) => { if (item.isMesh) count++; }); return count; }

  /* 爆炸单元选取：根下一层；唯一分组时下钻一层；仍不足 2 个则不可炸 */
  function pickExplodeUnits(root) {
    let units = [...(root.children || [])];
    if (units.length === 1 && units[0].children?.length) units = [...units[0].children];
    const withMesh = units.filter((unit) => unitMeshCount(unit) > 0);
    return withMesh;
  }

  function buildExplode(root) {
    explodeParts = [];
    explodeRoot = root;
    if (!root) return;
    const units = pickExplodeUnits(root);
    if (units.length < 2) return;
    const sceneBox = new THREE.Box3().setFromObject(root);
    const sceneCenter = sceneBox.getCenter(new THREE.Vector3());
    const diag = sceneBox.getSize(new THREE.Vector3()).length();
    const gap = diag * 0.18;
    for (const unit of units) {
      const box = new THREE.Box3().setFromObject(unit);
      const center = box.getCenter(new THREE.Vector3());
      const dir = center.clone().sub(sceneCenter);
      const dist = dir.length();
      if (dist > 1e-6) dir.divideScalar(dist); else dir.set(0, 1, 0);
      const worldOffset = dir.multiplyScalar(dist + gap);
      /* 世界偏移 → 父节点本地偏移（兼容任意层级旋转/缩放） */
      const inv = new THREE.Matrix4().copy(unit.parent.matrixWorld).invert();
      const worldPos = unit.getWorldPosition(new THREE.Vector3());
      const localA = worldPos.clone().applyMatrix4(inv);
      const localB = worldPos.clone().add(worldOffset).applyMatrix4(inv);
      explodeParts.push({ node: unit, originalPos: unit.position.clone(), offsetLocal: localB.sub(localA) });
    }
  }

  function applyExplode(factor) {
    for (const part of explodeParts) {
      part.node.position.copy(part.originalPos).addScaledVector(part.offsetLocal, factor);
    }
    if (labelsOn) updateLabelAnchors();
  }

  function tickExplode() {
    if (explodeFactor === explodeTarget) return;
    const delta = explodeTarget - explodeFactor;
    const step = Math.sign(delta) * Math.max(Math.abs(delta) * 0.16, 0.004);
    explodeFactor = Math.abs(step) >= Math.abs(delta) ? explodeTarget : explodeFactor + step;
    applyExplode(explodeFactor);
  }

  function watchModelRoot() {
    const root = getRoot?.() || null;
    if (root === explodeRoot) return;
    /* 旧模型还原原始位置，避免再次载入时残留爆炸位移 */
    for (const part of explodeParts) part.node.position.copy(part.originalPos);
    explodeFactor = 0; explodeTarget = 0;
    buildExplode(root);
    if (labelsOn) buildLabels();
    const event = { reason: 'model-changed', explodable: explodeParts.length >= 2 };
    onViewStateChanged?.(event);
    viewStateListeners.forEach((listener) => listener(event));
  }

  /* —— 部件标注：CSS2D 芯片 + 垂直引线；锚点取单元世界包围盒顶面中心，随爆炸实时重算 —— */
  function labelTargets() {
    const root = getRoot?.();
    if (!root) return [];
    let units = pickExplodeUnits(root);
    if (units.length < 2) units = unitMeshCount(root) > 0 ? [root] : [];
    return units.slice(0, LABEL_LIMIT);
  }

  function buildLabels() {
    labelGroup.clear();
    if (leaderLines) { leaderLines.geometry.dispose(); leaderLines = null; }
    if (!labelsOn) { labelGroup.visible = false; return; }
    for (const unit of labelTargets()) {
      const element = document.createElement('div');
      element.className = 'model-label';
      element.textContent = cleanPartName(unit);
      const tag = new CSS2DObject(element);
      tag.userData.unit = unit;
      tag.userData.element = element;
      labelGroup.add(tag);
    }
    labelGroup.visible = labelGroup.children.length > 0;
    updateLabelAnchors();
  }

  function updateLabelAnchors() {
    /* 引线长度按模型整体尺寸的固定比例，避免爆炸后单元包围盒变大把标签推出视野 */
    const root = getRoot?.();
    const sceneDiag = root ? new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length() : 1;
    const lead = Math.max(sceneDiag * 0.05, 0.02);
    for (const tag of labelGroup.children) {
      const unit = tag.userData.unit;
      if (!unit) continue;
      const box = new THREE.Box3().setFromObject(unit);
      if (box.isEmpty()) continue;
      const center = box.getCenter(new THREE.Vector3());
      tag.position.set(center.x, box.max.y, center.z);
      tag.userData.leaderTip = new THREE.Vector3(center.x, box.max.y + lead, center.z);
    }
    syncLeaderLines();
  }

  let leaderLines = null;
  function syncLeaderLines() {
    const tags = labelGroup.children.filter((tag) => tag.userData.leaderTip);
    const positions = new Float32Array(tags.length * 6);
    tags.forEach((tag, index) => {
      const anchor = tag.position;
      const tip = tag.userData.leaderTip;
      positions.set([anchor.x, anchor.y, anchor.z, tip.x, tip.y, tip.z], index * 6);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (leaderLines) { leaderLines.geometry.dispose(); leaderLines.geometry = geometry; }
    else { leaderLines = new THREE.LineSegments(geometry, leaderMaterial); leaderLines.renderOrder = 900; labelGroup.add(leaderLines); }
  }

  function setExplode(target, { instant = false } = {}) {
    const root = getRoot?.();
    if (root !== explodeRoot) { buildExplode(root); }
    if (explodeParts.length < 2) return 0;
    explodeTarget = Math.min(Math.max(Number(target) || 0, 0), 1);
    if (instant) { explodeFactor = explodeTarget; applyExplode(explodeFactor); }
    return explodeTarget;
  }

  const api = {
    scene, camera, renderer, controls, composer, outlinePass, outlineHaloPass, hoverPass,
    resize, fit, prepareModel, setSelected, setIsolate, clearIsolate, toggleIsolate, setWireframe, setOutlineTargets,
    /* 爆炸：目标系数 0..1（instant=true 跳过过渡动画）；返回实际目标值，不可炸返回 0 */
    setExplode,
    isExplodable: () => explodeParts.length >= 2,
    get explodeTarget() { return explodeTarget; },
    get explodeFactor() { return explodeFactor; },
    /* 标注：开关 CSS2D 部件标签 + 引线，单元与爆炸单元一致 */
    setLabelsVisible(on) { labelsOn = !!on; buildLabels(); return labelsOn; },
    get labelsVisible() { return labelsOn; },
    /* 端上订阅视口状态变化（切模型复位爆炸/标注等），注册即回调一次当前态 */
    onViewState(listener) { if (typeof listener === 'function') viewStateListeners.push(listener); listener?.({ reason: 'init', explodable: explodeParts.length >= 2 }); },
    get isolated() { return isolatedNode; },
    isIsolating: () => isolatedNode != null,
    isInIsolated,
    /* 主题令牌：bg / env / outline 彩色芯 / outlineHalo 暗环 / hover */
    setTheme({ bg, env = 1.0, outline = null, outlineHidden = null, outlineHalo = null, outlineHaloHidden = null, hover = null }) {
      if (bg != null) scene.background = new THREE.Color(bg);
      scene.environmentIntensity = env;
      if (outline != null) { outlinePass.visibleEdgeColor.set(outline); glowColor.set(outline); }
      if (outlineHidden != null) outlinePass.hiddenEdgeColor.set(outlineHidden);
      if (outlineHalo != null) outlineHaloPass.visibleEdgeColor.set(outlineHalo);
      if (outlineHaloHidden != null) outlineHaloPass.hiddenEdgeColor.set(outlineHaloHidden);
      if (hover != null) hoverPass.visibleEdgeColor.set(hover);
      /* 标注引线跟随主题描边色，亮/暗主题都可读 */
      if (outline != null) leaderMaterial.color.set(outline);
    },
  };
  /* 渲染循环异步首帧启动：getRoot 回调可能引用端上尚未初始化的变量（TDZ），不可同步调用 */
  requestAnimationFrame(animate);
  /* 调试句柄：控制台/自动化测试可直接访问视口内部状态 */
  canvas.__productViewer = api;
  return api;
}
