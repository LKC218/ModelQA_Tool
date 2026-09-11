/* 云端模型库缩略图（P0）：GLB 离屏渲染一帧 → dataURL，IndexedDB 按 hash 缓存。
   契约见 docs/实施方案/云端模型库缩略图网格与文件夹树分类-实施计划-V1.0.md §6.1。
   设计要点：全库共享一个常驻 256px 离屏 WebGLRenderer；并发 2 的 FIFO 队列；
   任一环节失败返回 null（上层显示占位图标），不重试；IndexedDB 不可用降级为会话内存缓存。 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloud } from './cloud-sync.js';

const DB_NAME = 'modelqa-thumbs';
const STORE = 'thumbs';
const MAX_ENTRIES = 500;
const THUMB_PX = 256;
const CONCURRENCY = 2;

const memoryCache = new Map(); // hash -> dataURL（IndexedDB 不可用时的降级）
const pending = new Map(); // hash -> Promise<dataURL|null>（并发去重）
const queue = [];
let running = 0;

/* —— IndexedDB（约 40 行 kv 包装；参照 reviewer-fs-handle.js 的降级思路） —— */
let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('no idb')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'hash' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open failed'));
    });
  }
  return dbPromise;
}

function idbGet(hash) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(hash);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

function idbPut(entry) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  })).then(() => enforceCap());
}

function idbCount() {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function idbEvictOldest() {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); resolve(); } else resolve();
    };
    req.onerror = () => reject(req.error);
  }));
}

async function enforceCap() {
  try {
    while ((await idbCount()) > MAX_ENTRIES) await idbEvictOldest();
  } catch { /* 容量维护失败不影响主流程 */ }
}

/* —— 离屏渲染器（惰性创建，常驻复用） —— */
let renderer = null;
let renderScene = null;
let renderCamera = null;
const thumbLoader = new GLTFLoader();

function ensureRenderer() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(THUMB_PX, THUMB_PX);
    renderer.setClearColor(0x000000, 0);
    renderScene = new THREE.Scene();
    renderScene.add(new THREE.HemisphereLight(0xffffff, 0x889988, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(1, 2, 1.5);
    renderScene.add(sun);
    renderCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    return true;
  } catch {
    renderer = null;
    return false;
  }
}

/** 渲染单个 GLB：fetch → parse → 包围盒拟合相机 → toDataURL */
async function renderThumb(item) {
  if (!ensureRenderer()) return null;
  const buffer = await cloud.fetchModel(item.url);
  const gltf = await thumbLoader.parseAsync(buffer, '');
  const object = gltf.scene || gltf.scenes?.[0];
  if (!object) return null;
  renderScene.add(object);
  try {
    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return null;
    const dir = new THREE.Vector3(1, 0.75, 1).normalize();
    renderCamera.position.copy(sphere.center).addScaledVector(dir, sphere.radius * 2.6);
    renderCamera.lookAt(sphere.center);
    renderCamera.near = sphere.radius / 50;
    renderCamera.far = sphere.radius * 10;
    renderCamera.updateProjectionMatrix();
    renderer.render(renderScene, renderCamera);
    return renderer.domElement.toDataURL('image/jpeg', 0.85);
  } finally {
    renderScene.remove(object);
  }
}

/* —— 并发队列 —— */
function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift();
    running += 1;
    job().catch(() => {}).finally(() => { running -= 1; pump(); });
  }
}

/**
 * 获取模型缩略图 dataURL（失败返回 null，调用方显示占位）。
 * @param {{hash:string, url:string, fileName:string}} item 云端模型库条目
 */
export function getThumb(item) {
  if (!item?.hash || !item?.url) return Promise.resolve(null);
  if (memoryCache.has(item.hash)) return Promise.resolve(memoryCache.get(item.hash));
  if (pending.has(item.hash)) return pending.get(item.hash);
  const task = new Promise((resolve) => {
    queue.push(async () => {
      let dataUrl = null;
      try {
        const cached = await idbGet(item.hash);
        dataUrl = cached?.dataUrl || (await renderThumb(item));
        if (dataUrl) {
          memoryCache.set(item.hash, dataUrl);
          idbPut({ hash: item.hash, dataUrl, savedAt: Date.now() }).catch(() => {});
        }
      } catch { dataUrl = null; }
      resolve(dataUrl);
    });
    pump();
  });
  pending.set(item.hash, task);
  task.finally(() => pending.delete(item.hash));
  return task;
}
