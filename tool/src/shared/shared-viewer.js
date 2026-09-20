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
  /* 触屏手感（Sketchfab 手势基准）：单指旋转、双指缩放+平移；降低灵敏度防触摸过冲。桌面鼠标不受影响 */
  const isCoarsePointer = (typeof matchMedia === 'function') && matchMedia('(pointer: coarse)').matches;
  if (isCoarsePointer) {
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.8; controls.panSpeed = 0.8;
  }
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
  /* 引线端点圆点：CanvasTexture 圆形贴图 + Points，固定像素大小（CAD 引线风格） */
  const dotTexture = (() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(16, 16, 13, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  })();
  const leaderDotMaterial = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, map: dotTexture, transparent: true, alphaTest: 0.3, color: 0x0b6b42 });
  let labelsOn = false;
  const LABEL_LIMIT = 24;

  let explodeRoot = null;
  let explodeParts = [];      /* { node, originalPos, offsetLocal } */
  let explodeFactor = 0;
  let explodeTarget = 0;
  const viewStateListeners = [];

  /* —— 定位爆炸联动状态：定位目标被遮挡时自动爆炸露出零件，动画结束后相机取景 —— */
  let pendingFrame = null;        /* { root, node }：等爆炸动画到位后再取景，避免取景到移动中的目标 */
  let frameGoal = null;           /* { pos, target, threshold }：相机取景的指数趋近目标 */
  let frameAfterExplode = false;  /* 手动爆炸（按钮/滑块）动画到位后：自动取景爆炸后整体包围盒，定位联动优先 */

  function resize() { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); composer.setSize(rect.width, rect.height); labelRenderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); }
  function fit(root) {
    if (!root) return;
    const box = new THREE.Box3().setFromObject(root), center = box.getCenter(new THREE.Vector3()), dimensions = box.getSize(new THREE.Vector3()), radius = Math.max(dimensions.length() * .55, .2);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(radius * .85, radius * .65, radius * 1.2));
    camera.near = Math.max(radius / 100, .001); camera.far = radius * 100; camera.updateProjectionMatrix();
    controls.maxPolarAngle = Math.PI * .495;
    /* 缩放距离护栏：按模型尺度限制拉近/拉远范围（触屏双指与滚轮同受控，防拉飞丢模型） */
    controls.minDistance = radius * 0.15; controls.maxDistance = radius * 8;
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
  /* 双击视口复位相机（桌面/触屏一致；OrbitControls 无双击行为，不冲突） */
  renderer.domElement.addEventListener('dblclick', () => { const root = getRoot?.(); if (root) fit(root); });
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
  let rafId = 0;
  function animate() { rafId = requestAnimationFrame(animate); controls.update(); tickExplode(); tickFrame(); tickLabels(); updateSelectOutlineFx(); composer.render(); labelRenderer.render(scene, camera); watchModelRoot(); }
  /* 页面不可见（切后台/锁屏）时停渲染循环省电，回前台恢复 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(rafId);
    else { rafId = requestAnimationFrame(animate); resize(); }
  });

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

  /* —— 爆炸视图：主轴分层排布 + 碰撞松弛（复刻 BRICSYS bbox 排布 + 碰撞响应法）。
        L1=根下一层总成：沿整体包围盒最长轴按投影排序依次堆叠（垂直方位保留原装配语境），
        间距 0.12×对角线；L2=总成内 ≥2 个含网格直接子件：沿「子件→总成中心」反向推到
        刚好离开总成包围盒 + 0.07×对角线（slab 出口距离），退化方向垂直于主轴。
        排布后 relaxExplodeOffsets 做 3 轮 AABB 相交推挤（MTV），保证两两分离、零件各有独立空间。
        世界偏移经父矩阵求逆换算为本地偏移；手动爆炸到位后相机自动取景爆炸后整体包围盒
        （定位联动优先，仍只取景被定位零件）；切模型自动还原位置并归零（onViewStateChanged 通知端）。
        状态变量与 labelRenderer 初始化见文件前部（首次 resize 前）。 —— */

  function cleanPartName(node) { return (node.name || '').replace(/_Empty$/i, '') || '未命名部件'; }
  function unitMeshCount(unit) { let count = 0; unit.traverse((item) => { if (item.isMesh) count++; }); return count; }

  /* 爆炸单元上限：防止深层模型被拆成大量碎片 */
  const EXPLODE_MAX_UNITS = 40;

  /* 爆炸单元选取（二级拆分）：L1=根下一层（唯一分组时下钻一层）；
     L2=总成内还有 ≥2 个含网格直接子件时一并纳入（螺栓等从总成中弹出），总量受上限约束。
     输出 L1 在前 L2 在后，标注切片行为与旧版一致；不足 2 个则不可炸 */
  function pickExplodeUnits(root) {
    let top = [...(root.children || [])];
    if (top.length === 1 && top[0].children?.length) top = [...top[0].children];
    top = top.filter((unit) => unitMeshCount(unit) > 0);
    if (top.length < 2) return top;
    const units = [...top];
    for (const parent of top) {
      const subs = (parent.children || []).filter((child) => unitMeshCount(child) > 0);
      if (subs.length < 2) continue;
      for (const sub of subs) {
        if (units.length >= EXPLODE_MAX_UNITS) return units;
        units.push(sub);
      }
    }
    return units;
  }

  function buildExplode(root) {
    explodeParts = [];
    explodeRoot = root;
    if (!root) return;
    const units = pickExplodeUnits(root);
    if (units.length < 2) return;
    const sceneBox = new THREE.Box3().setFromObject(root);
    const sceneCenter = sceneBox.getCenter(new THREE.Vector3());
    const sceneSize = sceneBox.getSize(new THREE.Vector3());
    const diag = sceneSize.length();
    /* 主轴 = 整体包围盒最长轴（电机类 = 转轴），L1 沿主轴分层排开 */
    const axis = sceneSize.x >= sceneSize.y && sceneSize.x >= sceneSize.z ? 'x' : (sceneSize.y >= sceneSize.z ? 'y' : 'z');
    const axisVec = new THREE.Vector3(); axisVec[axis] = 1;
    const gap = diag * 0.055;       /* 主轴排布的单元间净距（集中化：0.12 → 0.055） */
    const gapInner = diag * 0.03;   /* 总成内子件分离间距（集中化：0.07 → 0.03） */
    const unitSet = new Set(units);
    const boxes = new Map();
    const centers = new Map();
    const offsets = new Map();

    /* L1：按主轴投影升序（保持装配语义的相对顺序），沿主轴堆叠排开；垂直分量保留原方位 */
    const tops = units.filter((unit) => !unitSet.has(unit.parent));
    for (const unit of tops) {
      const box = new THREE.Box3().setFromObject(unit);
      boxes.set(unit, box);
      centers.set(unit, box.getCenter(new THREE.Vector3()));
    }
    tops.sort((a, b) => centers.get(a)[axis] - centers.get(b)[axis]);
    const boxLen = (box) => { const v = box.max[axis] - box.min[axis]; return Number.isFinite(v) ? v : 0; };
    const totalLen = tops.reduce((sum, unit) => sum + boxLen(boxes.get(unit)), 0) + gap * Math.max(tops.length - 1, 0);
    let cursor = sceneCenter[axis] - totalLen / 2;
    for (const unit of tops) {
      const len = boxLen(boxes.get(unit));
      const raw = (cursor + len / 2) - centers.get(unit)[axis];
      const delta = Number.isFinite(raw) ? raw : 0;
      cursor += len + gap;
      offsets.set(unit, delta ? axisVec.clone().multiplyScalar(delta) : new THREE.Vector3());
    }

    /* L2：沿「子件中心 → 总成中心」反向推到刚好离开总成包围盒 + gapInner（slab 出口距离）；
       同向退化时取垂直于主轴的方向，避免窜入主轴邻居空间 */
    for (const unit of units) {
      if (!unitSet.has(unit.parent)) continue;
      const box = new THREE.Box3().setFromObject(unit);
      boxes.set(unit, box);
      const center = box.getCenter(new THREE.Vector3());
      centers.set(unit, center);
      const parentBox = boxes.get(unit.parent);
      const parentCenter = centers.get(unit.parent);
      const dir = center.clone().sub(parentCenter);
      const dist = dir.length();
      if (dist > 1e-6) {
        dir.divideScalar(dist);
        /* 去掉主轴分量：子件挂在总成侧面（与 L1 轴列正交），不沿轴乱窜 */
        dir.addScaledVector(axisVec, -dir.dot(axisVec));
        if (dir.lengthSq() < 1e-6) {
          dir.set(0, 1, 0).addScaledVector(axisVec, -axisVec.y);
          if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
        }
        dir.normalize();
      } else {
        dir.set(0, 1, 0).addScaledVector(axisVec, -axisVec.y);
        if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
        dir.normalize();
      }
      let tExit = 0;
      for (const ax of ['x', 'y', 'z']) {
        if (Math.abs(dir[ax]) < 1e-9) continue;
        const edge = dir[ax] > 0 ? parentBox.max[ax] : parentBox.min[ax];
        tExit = Math.max(tExit, Math.abs(edge - parentCenter[ax]) / Math.abs(dir[ax]));
      }
      const size = box.getSize(new THREE.Vector3());
      const rChild = 0.5 * (Math.abs(dir.x) * size.x + Math.abs(dir.y) * size.y + Math.abs(dir.z) * size.z);
      const total = Math.max(dist, tExit + rChild) + gapInner;
      offsets.set(unit, dir.multiplyScalar(total - dist));
    }

    /* 世界偏移 → 父节点本地偏移（兼容任意层级旋转/缩放），并缓存松弛所需的世界空间数据 */
    for (const unit of units) {
      const worldOffset = offsets.get(unit) || new THREE.Vector3();
      const inv = new THREE.Matrix4().copy(unit.parent.matrixWorld).invert();
      const worldPos = unit.getWorldPosition(new THREE.Vector3());
      const localA = worldPos.clone().applyMatrix4(inv);
      const localB = worldPos.clone().add(worldOffset).applyMatrix4(inv);
      explodeParts.push({
        node: unit,
        originalPos: unit.position.clone(),
        offsetLocal: localB.sub(localA),
        ownWorld: worldOffset,
        origBox: boxes.get(unit),
        worldPos,
        localA,
        invMatrix: inv,
        parentUnit: unitSet.has(unit.parent) ? unit.parent : null,
      });
    }
    relaxExplodeOffsets(diag, sceneCenter);
  }

  /* 碰撞松弛：世界空间建模各单元总位移（L2 总位移 = 所属总成位移 + 自身相对位移），
     多轮 AABB 相交检测、沿最小重叠轴（MTV）渐进推挤；单步与总位移均有硬上限，防止
     深嵌套装配体（真实模型单元大量交叠）推挤发散把零件飞出视野（生产事故：滑动环飞至 794×模型尺度）。
     收敛后做整体重心回正（爆炸云中心平移回原模型中心，视觉对称），再把各单元自身相对位移
     经父矩阵逆换算回 offsetLocal（避免父位移重复叠加）。 */
  function relaxExplodeOffsets(diag, sceneCenter) {
    const parts = explodeParts;
    if (parts.length < 2) return;
    const margin = diag * 0.01;     /* 集中化：0.015 → 0.01 */
    const maxShift = diag * 1.0;    /* 单元总位移硬上限（集中化：2 → 1.0） */
    const maxStep = diag * 0.15;    /* 单对单轮推挤上限（集中化：0.25 → 0.15） */
    const idxOf = new Map(parts.map((part, i) => [part.node, i]));
    const parentIdx = parts.map((part) => (part.parentUnit ? idxOf.get(part.parentUnit) : -1));
    const own = parts.map((part) => part.ownWorld.clone());
    const disp = parts.map(() => new THREE.Vector3());
    const box = parts.map(() => new THREE.Box3());
    const ca = new THREE.Vector3();
    const cb = new THREE.Vector3();
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < parts.length; i++) {
        disp[i].copy(own[i]);
        if (parentIdx[i] >= 0) disp[i].add(disp[parentIdx[i]]);
        box[i].copy(parts[i].origBox).translate(disp[i]);
      }
      let moved = false;
      for (let a = 0; a < parts.length; a++) {
        for (let b = a + 1; b < parts.length; b++) {
          const A = box[a];
          const B = box[b];
          const ox = Math.min(A.max.x, B.max.x) - Math.max(A.min.x, B.min.x);
          const oy = Math.min(A.max.y, B.max.y) - Math.max(A.min.y, B.min.y);
          const oz = Math.min(A.max.z, B.max.z) - Math.max(A.min.z, B.min.z);
          if (ox <= 0 || oy <= 0 || oz <= 0) continue;
          moved = true;
          let ax = 'x';
          let o = ox;
          if (oy < o) { ax = 'y'; o = oy; }
          if (oz < o) { ax = 'z'; o = oz; }
          const half = Math.min(o * 0.5 + margin, maxStep);
          const centerA = A.getCenter(ca)[ax];
          const centerB = B.getCenter(cb)[ax];
          const sign = centerA > centerB ? 1 : (centerA < centerB ? -1 : (a < b ? 1 : -1));   /* 中心重合时按索引定序，防方向抖动 */
          own[a][ax] += sign * half;
          own[b][ax] -= sign * half;
        }
      }
      if (!moved) break;
    }
    /* 重心回正：爆炸云整体包围盒中心平移回原始模型中心（只改 L1 总位移，L2 随父跟随） */
    for (let i = 0; i < parts.length; i++) {
      disp[i].copy(own[i]);
      if (parentIdx[i] >= 0) disp[i].add(disp[parentIdx[i]]);
      box[i].copy(parts[i].origBox).translate(disp[i]);
    }
    const union = box[0].clone();
    for (let i = 1; i < parts.length; i++) union.union(box[i]);
    const shift = sceneCenter.clone().sub(union.getCenter(ca));
    if (Number.isFinite(shift.x + shift.y + shift.z)) {
      for (let i = 0; i < parts.length; i++) {
        if (parentIdx[i] < 0) own[i].add(shift);
      }
    }
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      for (const ax of ['x', 'y', 'z']) {
        if (own[i][ax] > maxShift) own[i][ax] = maxShift;
        else if (own[i][ax] < -maxShift) own[i][ax] = -maxShift;
      }
      const localB = part.worldPos.clone().add(own[i]).applyMatrix4(part.invMatrix);
      part.offsetLocal.copy(localB.sub(part.localA));
      if (!Number.isFinite(part.offsetLocal.x + part.offsetLocal.y + part.offsetLocal.z)) part.offsetLocal.set(0, 0, 0);
    }
  }

  function applyExplode(factor) {
    for (const part of explodeParts) {
      part.node.position.copy(part.originalPos).addScaledVector(part.offsetLocal, factor);
    }
    if (labelsOn) updateLabelAnchors();
  }

  function tickExplode() {
    if (explodeFactor === explodeTarget) { settleFrameAfterExplode(); return; }
    const delta = explodeTarget - explodeFactor;
    const step = Math.sign(delta) * Math.max(Math.abs(delta) * 0.16, 0.004);
    explodeFactor = Math.abs(step) >= Math.abs(delta) ? explodeTarget : explodeFactor + step;
    applyExplode(explodeFactor);
    /* 手动爆炸全程连续取景：相机同步跟随爆炸范围变化，避免动画结束后一次性猛拉 */
    if (frameAfterExplode && explodeTarget > 0) frameExploded();
    if (explodeFactor === explodeTarget) settleFrameAfterExplode();
  }

  function watchModelRoot() {
    const root = getRoot?.() || null;
    if (root === explodeRoot) return;
    /* 旧模型还原原始位置，避免再次载入时残留爆炸位移 */
    for (const part of explodeParts) part.node.position.copy(part.originalPos);
    explodeFactor = 0; explodeTarget = 0;
    pendingFrame = null; frameGoal = null; frameAfterExplode = false;
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

  /* 标签交互回调（P2 联动）：端上经 setLabelHandlers 注册，hover(unit|null)/click(unit) */
  let labelHandlers = null;
  function buildLabels() {
    /* 主动清理上次残留的 CSS2D DOM（renderer 对移除对象只 display:none 不删节点） */
    for (const tag of labelGroup.children) tag.element?.parentNode?.removeChild(tag.element);
    labelGroup.clear();
    if (leaderLines) { leaderLines.geometry.dispose(); leaderLines = null; }
    if (labelDots) { labelDots.geometry.dispose(); labelDots = null; }
    if (!labelsOn) { labelGroup.visible = false; return; }
    labelTargets().forEach((unit, index) => {
      const host = document.createElement('div');
      host.className = 'model-label-host';
      const name = cleanPartName(unit);
      host.title = name;
      const inner = document.createElement('div');
      inner.className = 'model-label';
      const no = document.createElement('i');
      no.className = 'model-label-no';
      no.textContent = String(index + 1);
      const nameEl = document.createElement('span');
      nameEl.className = 'model-label-name';
      nameEl.textContent = name;
      inner.append(no, nameEl);
      host.append(inner);
      const tag = new CSS2DObject(host);
      /* 芯片底边中点对齐锚点：renderer 每帧按 object.center 重写 transform，
         旧版写在 CSS 里的 translate(-50%,-100%) 从未生效（实际为中心对齐） */
      tag.center.set(0.5, 1);
      tag.userData.unit = unit;
      tag.userData.inner = inner;
      if (labelHandlers) {
        host.addEventListener('mouseenter', () => labelHandlers.onHover?.(unit, name));
        host.addEventListener('mouseleave', () => labelHandlers.onHover?.(null, ''));
        host.addEventListener('click', (event) => { event.stopPropagation(); labelHandlers.onClick?.(unit, name); });
      }
      labelGroup.add(tag);
    });
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
  let labelDots = null;
  function syncLeaderLines() {
    const tags = labelGroup.children.filter((tag) => tag.userData.leaderTip);
    const positions = new Float32Array(tags.length * 6);
    const dotPositions = new Float32Array(tags.length * 3);
    tags.forEach((tag, index) => {
      const anchor = tag.position;
      const tip = tag.userData.leaderTip;
      positions.set([anchor.x, anchor.y, anchor.z, tip.x, tip.y, tip.z], index * 6);
      dotPositions.set([tip.x, tip.y, tip.z], index * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (leaderLines) { leaderLines.geometry.dispose(); leaderLines.geometry = geometry; }
    else { leaderLines = new THREE.LineSegments(geometry, leaderMaterial); leaderLines.renderOrder = 900; labelGroup.add(leaderLines); }
    const dotGeometry = new THREE.BufferGeometry();
    dotGeometry.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
    if (labelDots) { labelDots.geometry.dispose(); labelDots.geometry = dotGeometry; }
    else { labelDots = new THREE.Points(dotGeometry, leaderDotMaterial); labelDots.renderOrder = 900; labelGroup.add(labelDots); }
  }

  /* —— 遮挡淡出 + 屏幕避让：相机变化时节流重算，静止后收敛 —— */
  const occlRaycaster = new THREE.Raycaster();
  let occlLast = { pos: new THREE.Vector3(1e9, 0, 0), tgt: new THREE.Vector3(1e9, 0, 0), t: 0 };
  function updateLabelOcclusion(root, diag) {
    for (const tag of labelGroup.children) {
      const tip = tag.userData.leaderTip;
      const unit = tag.userData.unit;
      const el = tag.userData.inner;
      if (!tip || !unit || !el) continue;
      const dir = new THREE.Vector3().subVectors(tip, camera.position);
      const dist = dir.length();
      if (dist < 1e-6) continue;
      occlRaycaster.set(camera.position, dir.normalize());
      occlRaycaster.far = dist - diag * 0.01;
      /* 命中且最近的非自身单元几何挡在 tip 之前 → 淡出（自身顶面/侧壁不算遮挡） */
      const blocked = occlRaycaster.intersectObject(root, true).some((hit) => {
        let o = hit.object;
        while (o) { if (o === unit) return false; o = o.parent; }
        return true;
      });
      el.classList.toggle('is-occluded', blocked);
    }
  }
  function updateLabelAvoid() {
    /* 增量模型：读当前视觉位置（含既有偏移），重叠即在现有 shift 上累加下移，
       单调收敛；不做基线还原——虚拟布局与真实视觉会分离导致漏判 */
    const rects = labelGroup.children
      .map((tag) => tag.userData.inner)
      .filter(Boolean)
      .map((el) => {
        const cur = Number(el.dataset.avoidShift || 0);
        return { el, cur, r: el.getBoundingClientRect(), add: 0 };
      });
    rects.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    /* 一维排队布局：b 的约束基于 a 本轮已更新的底边（级联），一轮即拉开整条链，
       避免链式同步位移导致的相对距离锁死 */
    for (let j = 1; j < rects.length; j++) {
      const b = rects[j];
      for (let i = 0; i < j; i++) {
        const a = rects[i];
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        if (ox <= 0) continue;
        const oyOverlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (oyOverlap <= 0) continue;
        /* 重叠面积不足小芯片 40% 的轻微压边不避让，防抖动 */
        if (ox * oyOverlap < Math.min(a.r.width * a.r.height, b.r.width * b.r.height) * 0.4) continue;
        const need = a.r.bottom - b.r.top + 6;
        if (need <= 0) continue;
        b.r.top += need; b.r.bottom += need;
        b.add += need;
      }
    }
    const anyAdd = rects.some((rc) => rc.add > 0);
    if (anyAdd) {
      for (const rc of rects) {
        if (rc.add > 0) {
          const target = rc.cur + rc.add;
          rc.el.dataset.avoidShift = String(target);
          rc.el.style.transform = 'translateY(' + target + 'px)';
        }
      }
    }
    /* 无 add 时不写 DOM（shift 保留，位置稳定收敛）。
       不做自动归零：锚点本身重叠的芯片组会陷入「推走→归零→又叠」震荡；
       shift 生命周期由 buildLabels 管理（重开标注/切模型/重建芯片即重置）。 */
  }
  function tickLabels() {
    if (!labelsOn || labelGroup.visible === false || labelGroup.children.length === 0) return;
    const now = performance.now();
    const camMoved = camera.position.distanceToSquared(occlLast.pos) > 1e-8 || controls.target.distanceToSquared(occlLast.tgt) > 1e-8;
    if (camMoved ? now - occlLast.t < 120 : now - occlLast.t < 500) return;
    const root = getRoot?.();
    if (!root) return;
    occlLast.pos.copy(camera.position); occlLast.tgt.copy(controls.target); occlLast.t = now;
    const diag = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length();
    updateLabelOcclusion(root, diag);
    updateLabelAvoid();
  }

  function setExplode(target, { instant = false } = {}) {
    const root = getRoot?.();
    if (root !== explodeRoot) { buildExplode(root); }
    if (explodeParts.length < 2) return 0;
    explodeTarget = Math.min(Math.max(Number(target) || 0, 0), 1);
    /* 手动爆炸路径：动画到位后自动取景整体包围盒（定位联动在 locateNode 中改走 pendingFrame） */
    frameAfterExplode = explodeTarget > 0;
    if (instant) { explodeFactor = explodeTarget; applyExplode(explodeFactor); }
    return explodeTarget;
  }

  /* —— 定位爆炸联动：定位 Issue 命中的零件若被装配体遮挡，自动爆炸露出 + 相机取景。
        遮挡判定：相机 → 目标包围盒 4 个采样点（中心/顶面/两侧）做 raycast，
        ≥2 个采样点在到达目标前命中无关几何即判遮挡（宁漏不误，避免对可见零件误爆炸）。
        隔离态的幽灵材质 mesh 视为可透视，不计入遮挡。 —— */
  const locateRaycaster = new THREE.Raycaster();
  function isNodeOccluded(node) {
    const root = getRoot?.();
    if (!root || !node) return false;
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) return false;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const margin = Math.max(size.length() * 0.05, 1e-3);
    const samples = [
      center,
      new THREE.Vector3(center.x, box.max.y, center.z),
      new THREE.Vector3(box.min.x + size.x * .5, center.y, box.max.z),
      new THREE.Vector3(box.max.x, center.y, box.min.z + size.z * .5),
    ];
    const targetMeshes = new Set(collectMeshes(node));
    const camPos = camera.position;
    let blocked = 0;
    for (const point of samples) {
      const dist = camPos.distanceTo(point);
      if (dist < 1e-6) continue;
      locateRaycaster.set(camPos, point.clone().sub(camPos).divideScalar(dist));
      locateRaycaster.far = Math.max(dist - margin, margin);
      const hit = locateRaycaster.intersectObject(root, true)[0];
      if (!hit) continue;
      if (targetMeshes.has(hit.object) || isWithin(hit.object, node)) continue;
      if (ghostOwners.has(hit.object)) continue;
      blocked++;
    }
    return blocked >= 2;
  }

  /* 相机取景：保持当前视线方向，仅按目标半径拉近 + 视点落到目标中心，指数趋近无瞬跳 */
  function frameNode(node) {
    if (!node) return;
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.7, 0.2);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(0.85, 0.65, 1.2);
    dir.normalize().multiplyScalar(radius * 1.7);
    frameGoal = { pos: center.clone().add(dir), target: center, threshold: Math.max(radius * 0.02, 0.005) };
  }

  /* 手动爆炸到位后取景：对爆炸后整体包围盒取景，保持视线方向仅拉远 + 对中（2.8×半径含标注/边缘余量），
     保证所有零部件始终在视锥内 */
  function frameExploded() {
    const root = explodeRoot || getRoot?.();
    if (!root) return;
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.2);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(0.85, 0.65, 1.2);
    dir.normalize().multiplyScalar(radius * 2.8);
    frameGoal = { pos: center.clone().add(dir), target: center, threshold: Math.max(radius * 0.02, 0.005) };
  }

  function tickFrame() {
    if (!frameGoal) return;
    camera.position.lerp(frameGoal.pos, 0.10);
    controls.target.lerp(frameGoal.target, 0.10);
    if (camera.position.distanceTo(frameGoal.pos) <= frameGoal.threshold && controls.target.distanceTo(frameGoal.target) <= frameGoal.threshold) frameGoal = null;
  }

  /* 爆炸/收拢动画到位后：定位联动优先取景挂起目标（此时零件位置才稳定）；
     手动爆炸则取景爆炸后整体包围盒（frameAfterExplode 标志一次性消费） */
  function settleFrameAfterExplode() {
    if (pendingFrame) {
      const { root, node } = pendingFrame;
      pendingFrame = null;
      if (root !== getRoot?.()) return;
      frameNode(node);
      return;
    }
    if (!frameAfterExplode) return;
    frameAfterExplode = false;
    if (explodeTarget > 0) frameExploded();
  }

  function notifyExplodeChanged() {
    const event = { reason: 'explode-changed', explodable: explodeParts.length >= 2 };
    onViewStateChanged?.(event);
    viewStateListeners.forEach((listener) => listener(event));
  }

  /* 定位组合入口：目标被遮挡且可炸 → 自动爆炸（动画到位后自动取景）；
     其余情况（目标可见 / 已处于爆炸态 / 不可炸）目标位置稳定，立即取景。
     不做自动收拢：爆炸态由用户手动关闭或切模型复位，行为可预期。 */
  function locateNode(node) {
    const root = getRoot?.();
    if (!root || !node) return { exploded: false };
    if (explodeParts.length >= 2 && explodeTarget < 1 && isNodeOccluded(node)) {
      setExplode(1);
      frameAfterExplode = false;   /* 定位联动：动画到位后只取景被定位零件，不做整体取景 */
      notifyExplodeChanged();
      pendingFrame = { root, node };
      return { exploded: true };
    }
    frameNode(node);
    return { exploded: false };
  }

  const api = {
    scene, camera, renderer, controls, composer, outlinePass, outlineHaloPass, hoverPass,
    resize, fit, prepareModel, setSelected, setIsolate, clearIsolate, toggleIsolate, setWireframe, setOutlineTargets,
    /* 爆炸：目标系数 0..1（instant=true 跳过过渡动画）；返回实际目标值，不可炸返回 0 */
    setExplode,
    /* 定位联动：目标被遮挡时自动爆炸露出并延迟取景，返回 { exploded } */
    locateNode,
    isNodeOccluded,
    isExplodable: () => explodeParts.length >= 2,
    get explodeTarget() { return explodeTarget; },
    get explodeFactor() { return explodeFactor; },
    /* 标注：开关 CSS2D 部件标签 + 引线，单元与爆炸单元一致 */
    setLabelsVisible(on) { labelsOn = !!on; buildLabels(); return labelsOn; },
    get labelsVisible() { return labelsOn; },
    /* 标签交互回调：onHover(unit|null, name) / onClick(unit, name)——供端上做层级树联动与选中 */
    setLabelHandlers(handlers) { labelHandlers = typeof handlers === 'function' ? { onClick: handlers } : (handlers || null); },
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
      if (outline != null) { leaderMaterial.color.set(outline); leaderDotMaterial.color.set(outline); }
    },
  };
  /* 渲染循环异步首帧启动：getRoot 回调可能引用端上尚未初始化的变量（TDZ），不可同步调用 */
  rafId = requestAnimationFrame(animate);
  /* 调试句柄：控制台/自动化测试可直接访问视口内部状态 */
  canvas.__productViewer = api;
  return api;
}
