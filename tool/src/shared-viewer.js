import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

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
    const list = meshes || [];
    outlinePass.selectedObjects = list;
    outlineHaloPass.selectedObjects = list;
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

  function resize() { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); composer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); }
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
  function animate() { requestAnimationFrame(animate); controls.update(); composer.render(); } animate();

  /* hover 双态：pointermove 节流射线；隔离中禁用 hover，避免和淡化锁定冲突 */
  const hoverRaycaster = new THREE.Raycaster(); const hoverPointer = new THREE.Vector2();
  let lastHoverCheck = 0; let hoverObject = null; let selectedObject = null;
  const isWithin = (node, ancestor) => { for (let item = node; item; item = item.parent) { if (item === ancestor) return true; } return false; };
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
  /* 选中态仅更新描边/光标；隔离目标由树/按钮显式 setIsolate，画布点选在隔离中由端拦截 */
  function setSelected(node) {
    selectedObject = node;
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

  const api = {
    scene, camera, renderer, controls, composer, outlinePass, outlineHaloPass, hoverPass,
    resize, fit, prepareModel, setSelected, setIsolate, clearIsolate, toggleIsolate, setWireframe, setOutlineTargets,
    get isolated() { return isolatedNode; },
    isIsolating: () => isolatedNode != null,
    /* 主题令牌：bg / env / outline 彩色芯 / outlineHalo 暗环 / hover */
    setTheme({ bg, env = 1.0, outline = null, outlineHidden = null, outlineHalo = null, outlineHaloHidden = null, hover = null }) {
      if (bg != null) scene.background = new THREE.Color(bg);
      scene.environmentIntensity = env;
      if (outline != null) outlinePass.visibleEdgeColor.set(outline);
      if (outlineHidden != null) outlinePass.hiddenEdgeColor.set(outlineHidden);
      if (outlineHalo != null) outlineHaloPass.visibleEdgeColor.set(outlineHalo);
      if (outlineHaloHidden != null) outlineHaloPass.hiddenEdgeColor.set(outlineHaloHidden);
      if (hover != null) hoverPass.visibleEdgeColor.set(hover);
    },
  };
  /* 调试句柄：控制台/自动化测试可直接访问视口内部状态 */
  canvas.__productViewer = api;
  return api;
}
