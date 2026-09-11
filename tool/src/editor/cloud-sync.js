/* 云端通信层（P1）：开发端唯一的 fetch 出口。
   main-implementation.js 不直接 fetch 云端接口。
   Token / 基址经 vite define 注入（__CLOUD_TOKEN__ / __CLOUD_BASE__）：
   - 生产 dist：与站点同域（__CLOUD_BASE__ 为空串 → 相对路径直连），零 CORS；
   - 本地 dev：走 vite server.proxy（/api、/data、/reviews → 生产站点）。
   接口契约见 docs/实施方案/开发端云端持久化与审核包在线托管-实施计划-V1.0.md §5.1。 */

const TOKEN = typeof __CLOUD_TOKEN__ !== 'undefined' ? __CLOUD_TOKEN__ : (globalThis.__CLOUD_TOKEN__ || '');
const BASE = typeof __CLOUD_BASE__ !== 'undefined' ? __CLOUD_BASE__ : (globalThis.__CLOUD_BASE__ || '');

function absolute(url) {
  return /^https?:\/\//.test(url) ? url : BASE + url;
}

async function request(path, options = {}) {
  const resp = await fetch(absolute(path), {
    ...options,
    headers: { 'X-ModelQA-Token': TOKEN, ...(options.headers || {}) },
  });
  if (!resp.ok) throw new Error(`cloud ${path} -> ${resp.status}`);
  return resp.json();
}

export const cloud = {
  /** 是否已配置云端 Token（未配置时上层走纯本地路径） */
  get available() {
    return Boolean(TOKEN);
  },

  /** GET /api/projects → { projects: [{id,name,updatedAt}] } */
  listProjects() {
    return request('/api/projects');
  },

  /** GET /api/projects/<id> → 项目 JSON 原文（含 name） */
  async loadProject(id) {
    return request(`/api/projects/${encodeURIComponent(id)}`);
  },

  /** PUT /api/projects/<id>，payload 需含 name → { ok, updatedAt } */
  saveProject(id, payload) {
    return request(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  /** DELETE /api/projects/<id> → { ok } */
  deleteProject(id) {
    return request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** POST /api/models，body 为 GLB 二进制 → { hash, url, dedup }；
      fileName / relPath（相对路径，分类树用）经 encodeURIComponent 记入模型库元数据 */
  uploadModel(arrayBuffer, fileName = '', relPath = '') {
    const headers = {};
    if (fileName) headers['X-Model-Filename'] = encodeURIComponent(fileName);
    if (relPath) headers['X-ModelQA-Path'] = encodeURIComponent(relPath);
    return request('/api/models', { method: 'POST', headers, body: arrayBuffer });
  },

  /** GET /api/models/list → { models: [{hash, fileName, size, url}] }（云端模型库清单） */
  listModels() {
    return request('/api/models/list');
  },

  /** GET /data/models/<hash>.glb → ArrayBuffer */
  async fetchModel(url) {
    const resp = await fetch(absolute(url));
    if (!resp.ok) throw new Error(`cloud ${url} -> ${resp.status}`);
    return resp.arrayBuffer();
  },

  /** POST /api/upload，body 为审核包 HTML 全文 → { url }（P2 使用） */
  uploadReviewPackage(html, filename) {
    return request('/api/upload', {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent(filename) },
      body: html,
    });
  },

  /** GET /api/reviews/list → { reviews: [{name,size,uploadedAt,url,reviewed}] }（在线预览链接管理） */
  listReviews() {
    return request('/api/reviews/list');
  },

  /** DELETE /api/reviews/<name> → { ok }（软删除，移入 _archive） */
  deleteReview(name) {
    return request(`/api/reviews/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },
};
