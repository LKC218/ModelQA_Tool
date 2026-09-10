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
  onEnvironmentReady = null,
}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8efe9);
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 1000); camera.position.set(2.8, 2.2, 4.2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outlinePass.edgeStrength = 3; outlinePass.edgeGlow = 0; outlinePass.edgeThickness = 1; outlinePass.pulsePeriod = 0;
  outlinePass.visibleEdgeColor.set(0xffb347); outlinePass.hiddenEdgeColor.set(0x6b3a12);
  composer.addPass(outlinePass);
  composer.addPass(new OutputPass());
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .075;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x252a31, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(4, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d5ff, 0.38); fill.position.set(-4, 2, -3); scene.add(fill);
  const rgbeLoader = new RGBELoader(); const pmremGenerator = new THREE.PMREMGenerator(renderer); pmremGenerator.compileEquirectangularShader();
  rgbeLoader.load(hdriSource, (texture) => { texture.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmremGenerator.fromEquirectangular(texture).texture; pmremGenerator.dispose(); onEnvironmentReady?.(); }, undefined, (error) => console.warn('HDRI 加载失败，使用中性灯光回退', error));

  function resize() { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); composer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); }
  function fit(root) {
    if (!root) return;
    const box = new THREE.Box3().setFromObject(root), center = box.getCenter(new THREE.Vector3()), dimensions = box.getSize(new THREE.Vector3()), radius = Math.max(dimensions.length() * .55, .2);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(radius * .85, radius * .65, radius * 1.2));
    camera.near = Math.max(radius / 100, .001); camera.far = radius * 100; camera.updateProjectionMatrix();
    controls.update();
  }
  window.addEventListener('resize', resize);
  if (resizeSource) new ResizeObserver(resize).observe(resizeSource);
  resize();
  function animate() { requestAnimationFrame(animate); controls.update(); composer.render(); } animate();

  return {
    scene, camera, renderer, controls, outlinePass,
    resize, fit,
    /* 主题令牌注入：bg 场景背景、env 环境强度、outline/outlineHidden 选中描边颜色 */
    setTheme({ bg, env = 1.0, outline = null, outlineHidden = null }) {
      if (bg != null) scene.background = new THREE.Color(bg);
      scene.environmentIntensity = env;
      if (outline != null) outlinePass.visibleEdgeColor.set(outline);
      if (outlineHidden != null) outlinePass.hiddenEdgeColor.set(outlineHidden);
    },
  };
}
