/* dedup E2E probe: export shared modelData pool by content hash (ASCII-safe).
   Prereq: npm run dev (5173). Run: node probe-e2e-dedup.cjs (OUT=outdir).
   Covers: (A) reviewer loads v3 payload (shared pool + dataKey/fileRef, cross-course switch);
           (B) reviewer still loads legacy v2 payload (base64Chunks);
           (C) editor export dedups same-content models (modelData pool, ZIP single copy, no draft leak). */
const fs = require('fs');
const path = require('path');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };

/* ---- payload surgery on reviewer-preview.html (same recipe as probe-e2e-explode2) ---- */
const pageSrc = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');
const key = 'window.__AN_REVIEW_PAYLOAD__=';
const start = pageSrc.indexOf(key);
if (start < 0) { console.error('payload key not found'); process.exit(1); }
let i = pageSrc.indexOf('{', start), depth = 0, inStr = false, end = -1;
for (; i < pageSrc.length; i++) {
  const c = pageSrc[i];
  if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const originalPayload = JSON.parse(pageSrc.slice(pageSrc.indexOf('{', start), end));
const originalSrc = pageSrc;

/* rebuild two distinct GLBs from preview model-0 (different node graph => different content hash) */
function rebuildGlb(gltf, bin, rootName) {
  const g = JSON.parse(JSON.stringify(gltf));
  g.nodes = [{ name: rootName, mesh: 0, scale: [0.6, 0.6, 0.6] }];
  g.scenes = [{ nodes: [0] }];
  const jsonBuf = Buffer.from(JSON.stringify(g), 'utf8');
  const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
  const jsonChunkLen = jsonBuf.length + jsonPad.length;
  const totalLen = 12 + 8 + jsonChunkLen + bin.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4); header.writeUInt32LE(totalLen, 8);
  const jsonHead = Buffer.alloc(8); jsonHead.writeUInt32LE(jsonChunkLen, 0); jsonHead.writeUInt32LE(0x4E4F534A, 4);
  return Buffer.concat([header, jsonHead, jsonBuf, jsonPad, bin]);
}
const glb0 = Buffer.concat(originalPayload.project.models[0].base64Chunks.map((c) => Buffer.from(c, 'base64')));
const jsonLen0 = glb0.readUInt32LE(12);
const gltf0 = JSON.parse(glb0.slice(20, 20 + jsonLen0).toString('utf8'));
const bin0 = glb0.slice(20 + jsonLen0);
const glbA = rebuildGlb(gltf0, bin0, 'DEDUP-A');
const glbB = rebuildGlb(gltf0, bin0, 'DEDUP-B');

/* build v3 payload: A1/A2 same content (shared key, course 0), B distinct (course 1); no base64Chunks on models */
const v3 = JSON.parse(JSON.stringify(originalPayload));
v3.schemaVersion = 3;
if (!v3.project.courses.length) v3.project.courses = [{ courseId: 'c0', code: 'C0', name: 'C0', sortOrder: 1 }];
if (v3.project.courses.length < 2) v3.project.courses.push({ courseId: 'c-extra', code: 'EX', name: 'Extra', sortOrder: 2 });
const courseA = v3.project.courses[0].courseId, courseB = v3.project.courses[1].courseId;
const mk = (n, courseId, dataKey, fileRef) => ({
  modelId: `m-${n}`, fileName: n, displayName: n, version: 'V1.0', sortOrder: 1,
  courseId, requirement: '', byteLength: glbA.length, nodes: [], dataKey, fileRef,
});
const KEY_A = 'aaa1111111111111111111111111111111111111111111111111111111111111';
const KEY_B = 'bbb2222222222222222222222222222222222222222222222222222222222222';
v3.modelData = [
  { key: KEY_A, fileRef: 'DEDUP-A-aaa11111.glb', base64Chunks: [glbA.toString('base64')] },
  { key: KEY_B, fileRef: 'DEDUP-B-bbb22222.glb', base64Chunks: [glbB.toString('base64')] },
];
v3.project.models = [mk('A1.glb', courseA, KEY_A, 'DEDUP-A-aaa11111.glb'), mk('A2.glb', courseA, KEY_A, 'DEDUP-A-aaa11111.glb'), mk('B.glb', courseB, KEY_B, 'DEDUP-B-bbb22222.glb')];
v3.review = { byModel: {} };
v3.mode = 'inline';
const v3Src = originalSrc.slice(0, originalSrc.indexOf('{', start)) + JSON.stringify(v3) + originalSrc.slice(end);

const MESH_SNAP = `(() => {
  const v = document.querySelector('canvas').__productViewer;
  if (!v) return { meshes: -1 };
  let count = 0;
  v.scene.traverse((n) => { if (n.isMesh && n.visible) count++; });
  return { meshes: count };
})()`;
const CURRENT_TITLE = `(() => document.getElementById('model-title')?.textContent || '')()`;

/* ---- Part A/B: reviewer loads v3 and v2 payloads ---- */
async function loadPreview(browser, src) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (src) await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: src, contentType: 'text/html; charset=utf-8' }));
  for (let k = 0; k < 10; k++) {
    try { await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
    catch (e) { if (k === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());
  return { page, errors };
}
async function openModel(page, courseId, modelId) {
  await page.evaluate((cid) => document.querySelector(`[data-course-select="${cid}"]`)?.click(), courseId);
  await page.waitForTimeout(400);
  await page.evaluate((mid) => document.querySelector(`[data-model="${mid}"] .model-item-main`)?.click(), modelId);
  await page.waitForTimeout(1500);
}

/* ---- Part C helpers: stored-entry filename count (ZIP level:0 => stored, no compression) ---- */
function countZipEntries(buf, needle) {
  let count = 0, idx = 0;
  const head = Buffer.from('PK\x03\x04', 'binary');
  while ((idx = buf.indexOf(head, idx)) !== -1) {
    const nameLen = buf.readUInt16LE(idx + 26);
    if (buf.slice(idx + 30, idx + 30 + nameLen).toString('utf8') === needle) count++;
    idx += 4;
  }
  return count;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });

  /* Part A: v3 payload with shared pool */
  {
    const { page, errors } = await loadPreview(browser, v3Src);
    const first = await page.evaluate(MESH_SNAP);
    assert(first.meshes > 0, `v3: first model (A1, pool entry 0) renders (${first.meshes} meshes)`);
    const rowsA = await page.evaluate((cid) => [...document.querySelectorAll(`[data-model]`)].filter((el) => document.querySelector(`[data-course-select="${cid}"]`)?.closest('article')?.classList.contains('active') || true).map((b) => b.dataset.model), courseA);
    assert(rowsA.length === 2, `v3: course A lists 2 model rows (got ${rowsA.length})`);
    await openModel(page, courseA, rowsA[1]);
    const title2 = await page.evaluate(CURRENT_TITLE);
    const second = await page.evaluate(MESH_SNAP);
    assert(second.meshes > 0 && /A2/.test(title2), `v3: A2 (same pool entry as A1) renders via dataKey (${title2.trim()})`);
    await openModel(page, courseB, 'm-B.glb');
    const title3 = await page.evaluate(CURRENT_TITLE);
    const third = await page.evaluate(MESH_SNAP);
    assert(third.meshes > 0 && /B\.glb/.test(title3), `v3: B (pool entry 1, cross course) renders (${title3.trim()})`);
    assert(errors.length === 0, `v3: zero pageerrors (${errors.length})`);
    if (errors.length) console.log(errors.join('\n'));
    await page.close();
  }

  /* Part B: legacy v2 payload regression */
  {
    const { page, errors } = await loadPreview(browser, null);
    const snap = await page.evaluate(MESH_SNAP);
    assert(snap.meshes > 0, `v2: legacy payload (base64Chunks) still renders (${snap.meshes} meshes)`);
    assert(errors.length === 0, `v2: zero pageerrors (${errors.length})`);
    await page.close();
  }

  /* Part C: editor export dedup */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    /* stub all cloud endpoints: uploads get deterministic hash by content; projects list empty; save ok */
    const seenBodies = new Map();
    await page.route('**/api/models', (route) => {
      const req = route.request();
      const raw = typeof req.postDataBuffer === 'function' ? req.postDataBuffer() : (req.postData() || '');
      const body = Buffer.from(raw, typeof raw === 'string' ? 'binary' : undefined) || Buffer.alloc(0);
      const bodyKey = body.toString('base64');
      if (!seenBodies.has(bodyKey)) seenBodies.set(bodyKey, `hash${seenBodies.size + 1}`.padEnd(12, '0'));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hash: seenBodies.get(bodyKey), url: `/data/models/${seenBodies.get(bodyKey)}.glb`, dedup: true }) });
    });
    await page.route('**/api/projects*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: route.request().method() === 'PUT' ? JSON.stringify({ ok: true, updatedAt: '2026-09-14 00:00:00' }) : JSON.stringify({ projects: [] }) }));
    await page.route('**/data/**', (route) => route.fulfill({ status: 404, body: '' }));
    for (let k = 0; k < 10; k++) {
      try { await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
      catch (e) { if (k === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
    }
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.querySelector('#onb-root')?.remove());
    /* fresh draft (E2E iron rule): confirm + prompt dialogs, project name carries smoke suffix */
    page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('云同步冒烟-导出去重') : d.accept()));
    await page.evaluate(() => document.getElementById('draft-new')?.click());
    await page.waitForTimeout(500);

    /* pick first course, then import 3 files: dup content x2 + distinct x1 */
    await page.evaluate(() => document.querySelector('[data-course-select]')?.click());
    await page.waitForTimeout(300);
    await page.setInputFiles('#files', [
      { name: 'dup-a.glb', mimeType: 'model/gltf-binary', buffer: glbA },
      { name: 'dup-a2.glb', mimeType: 'model/gltf-binary', buffer: glbA },
      { name: 'solo.glb', mimeType: 'model/gltf-binary', buffer: glbB },
    ]);
    await page.waitForTimeout(4000); /* addFiles parse + background uploads */
    const singleEnabled = await page.evaluate(() => !document.getElementById('single')?.disabled);
    assert(singleEnabled, 'editor: single export enabled after import');

    /* single HTML export -> inspect injected payload */
    const [dl1] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.evaluate(() => document.getElementById('single')?.click())]);
    const htmlPath = path.join(OUT, 'dedup-export.html');
    await dl1.saveAs(htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const pStart = html.indexOf(key);
    const payload = JSON.parse(html.slice(html.indexOf('{', pStart), html.indexOf('};</script>', pStart) + 1));
    assert(payload.schemaVersion === 3, `editor: schemaVersion 3 (got ${payload.schemaVersion})`);
    assert(Array.isArray(payload.modelData) && payload.modelData.length === 2, `editor: modelData pool = 2 unique contents (got ${payload.modelData?.length})`);
    assert(payload.project.models.length === 3, `editor: 3 models exported (got ${payload.project.models.length})`);
    const [m1, m2, m3] = payload.project.models;
    assert(m1.dataKey && m1.dataKey === m2.dataKey, 'editor: same-content models share dataKey');
    assert(m1.fileRef === m2.fileRef, 'editor: same-content models share fileRef');
    assert(!('base64Chunks' in m1) && !('base64Chunks' in m3), 'editor: models carry no inline base64Chunks');
    const poolA = payload.modelData.find((e) => e.key === m1.dataKey);
    const poolB = payload.modelData.find((e) => e.key === m3.dataKey);
    assert(poolA && Array.isArray(poolA.base64Chunks) && poolA.base64Chunks.join('').length > 0, 'editor: pool entry A holds base64 data');
    assert(poolB && m1.dataKey !== m3.dataKey, 'editor: distinct content gets distinct key');
    /* same content uploaded once to cloud too (stub saw 2 distinct bodies, not 3) */
    assert(seenBodies.size === 2, `editor: cloud uploads deduped by content (2 unique bodies, got ${seenBodies.size})`);

    /* manual save -> flush draft to localStorage, assert no v3 fields leak into storage */
    await page.evaluate(() => document.getElementById('save')?.click());
    await page.waitForTimeout(1000);
    const drafts = await page.evaluate(() => {
      const out = [];
      for (let k = 0; k < localStorage.length; k++) {
        const k2 = localStorage.key(k);
        if (k2.startsWith('an-review-draft:')) out.push(JSON.parse(localStorage.getItem(k2)));
      }
      return out;
    });
    const leak = drafts.some((d) => 'modelData' in d || (d.models || []).some((m) => 'dataKey' in m || 'fileRef' in m));
    assert(drafts.length > 0 && !leak, `editor: saved draft (${drafts.length}) contains no dataKey/fileRef/modelData (storage untouched)`);

    /* ZIP export -> assert single physical copy per unique content */
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.evaluate(() => document.getElementById('zip')?.click())]);
    const zipPath = path.join(OUT, 'dedup-export.zip');
    await dl2.saveAs(zipPath);
    const zip = fs.readFileSync(zipPath);
    assert(countZipEntries(zip, `models/${m1.fileRef}`) === 1, `zip: shared content written once (local header for ${m1.fileRef})`);
    assert(countZipEntries(zip, `models/${m3.fileRef}`) === 1, `zip: distinct content written once (${m3.fileRef})`);
    assert(countZipEntries(zip, 'models/dup-a.glb') === 0 && countZipEntries(zip, 'models/dup-a2.glb') === 0 && countZipEntries(zip, 'models/solo.glb') === 0, 'zip: no per-model original-name entries');

    assert(errors.length === 0, `editor: zero pageerrors (${errors.length})`);
    if (errors.length) console.log(errors.join('\n'));
    await page.close();
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
