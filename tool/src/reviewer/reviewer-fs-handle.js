/* 审核端目录 Handle 记忆：Chromium File System Access + IndexedDB。
   file:// 下 IDB 可能不可用，调用方需静默降级（至少记住文件夹名）。 */

const DB_NAME = 'an-reviewer-fs';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'lastPackageDir';
const NAME_KEY = 'an_reviewer_last_dir_name';

export function supportsDirectoryPicker() {
  return typeof globalThis.showDirectoryPicker === 'function';
}

export function rememberDirName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, String(name));
  } catch { /* 隐私模式忽略 */ }
}

export function getRememberedDirName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function clearRememberedDirName() {
  try {
    localStorage.removeItem(NAME_KEY);
  } catch { /* ignore */ }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB-unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb-open-failed'));
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function rememberPackageHandle(handle, name) {
  const label = name || handle?.name || '';
  rememberDirName(label);
  if (!handle) return false;
  try {
    await idbPut(HANDLE_KEY, { handle, name: label, savedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function forgetPackageHandle() {
  clearRememberedDirName();
  try {
    await idbDelete(HANDLE_KEY);
  } catch { /* ignore */ }
}

export async function loadPackageRecord() {
  try {
    const record = await idbGet(HANDLE_KEY);
    if (record?.handle) {
      return { handle: record.handle, name: record.name || record.handle.name || '' };
    }
  } catch { /* ignore */ }
  const name = getRememberedDirName();
  return name ? { handle: null, name } : null;
}

export async function queryDirectoryPermission(handle) {
  if (!handle?.queryPermission) return 'granted';
  try {
    return await handle.queryPermission({ mode: 'read' });
  } catch {
    return 'denied';
  }
}

export async function requestDirectoryPermission(handle) {
  if (!handle?.requestPermission) return 'granted';
  try {
    return await handle.requestPermission({ mode: 'read' });
  } catch {
    return 'denied';
  }
}

export async function ensureDirectoryPermission(handle) {
  let permission = await queryDirectoryPermission(handle);
  if (permission === 'granted') return true;
  permission = await requestDirectoryPermission(handle);
  return permission === 'granted';
}

export async function collectFilesFromDirectory(dirHandle, prefix = '') {
  const out = [];
  if (!dirHandle?.entries) return out;
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      try {
        Object.defineProperty(file, 'webkitRelativePath', { value: prefix + name, configurable: true });
      } catch { /* 部分环境只读 */ }
      out.push(file);
      continue;
    }
    if (handle.kind === 'directory') {
      const nested = await collectFilesFromDirectory(handle, `${prefix}${name}/`);
      out.push(...nested);
    }
  }
  return out;
}

export async function pickPackageDirectory() {
  if (!supportsDirectoryPicker()) return null;
  return globalThis.showDirectoryPicker({
    id: 'an-reviewer-package',
    mode: 'read',
    startIn: 'downloads',
  });
}

/** 启动恢复：有 handle 且权限已授予则返回 files；否则返回 needsGesture。 */
export async function tryLoadRememberedPackage() {
  const record = await loadPackageRecord();
  if (!record) return null;
  if (!record.handle) {
    return { needsGesture: true, name: record.name, hasHandle: false };
  }
  const permission = await queryDirectoryPermission(record.handle);
  if (permission === 'granted') {
    try {
      const files = await collectFilesFromDirectory(record.handle);
      if (!files.length) {
        return { needsGesture: true, name: record.name, hasHandle: true, empty: true };
      }
      return { files, handle: record.handle, name: record.name };
    } catch {
      return { needsGesture: true, name: record.name, hasHandle: true, error: true };
    }
  }
  return { needsGesture: true, name: record.name, hasHandle: true, permission };
}

/** 用户点击「打开上次文件夹」：请求权限并读出文件。 */
export async function openRememberedPackage() {
  const record = await loadPackageRecord();
  if (!record?.handle) return { ok: false, reason: 'no-handle', name: record?.name || '' };
  const allowed = await ensureDirectoryPermission(record.handle);
  if (!allowed) return { ok: false, reason: 'denied', name: record.name };
  try {
    const files = await collectFilesFromDirectory(record.handle);
    if (!files.length) return { ok: false, reason: 'empty', name: record.name };
    return { ok: true, files, handle: record.handle, name: record.name };
  } catch (error) {
    return { ok: false, reason: 'error', name: record.name, error };
  }
}

export function packageRootName(files) {
  for (const file of files || []) {
    const path = file.webkitRelativePath || '';
    if (path && path.includes('/')) return path.split('/')[0];
  }
  return '';
}
