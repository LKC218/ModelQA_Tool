/* payload v4 (external assets) E2E probe (ASCII-safe).
   Prereq: npm run dev (5173) + npm run prepare:reviewer already run.
   Run: node probe-v4-external.cjs (OUT=outdir).
   Surgery: original dev-shell payload (v3 inline base64) -> v4 external:
     schemaVersion=4, mode=external, modelData entries {key,fileRef,size,url} (no base64),
     submitToken injected. GLB binaries are decoded from the ORIGINAL base64 chunks and
     served via route interception of the fake asset URLs (simulates nginx /reviews/assets/).
   Asserts: model loads through fetch branch, asset requests hit expected URLs, submit
   button enabled, exported reviewed HTML carries v4 external payload (no base64). */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const results = [];
const assert = (cond, label) => { results.push(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- extract original payload from dev shell (same recipe as probe-model-list) ---- */
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

/* ---- decode glb binaries from original v2 inline chunks (models carry base64Chunks) ---- */
const glbByFileRef = new Map();
(originalPayload.project?.models || []).forEach((model, idx) => {
  if (!Array.isArray(model.base64Chunks) || !model.base64Chunks.length) return;
  const bin = Buffer.concat(model.base64Chunks.map((c) => Buffer.from(c, 'base64')));
  glbByFileRef.set(`probe-${idx}.glb`, bin);
});

/* ---- build v4 external payload (v2 source -> synthesize shared pool + dataKey/fileRef) ---- */
const FAKE_BASE = 'https://assets.probe.invalid/reviews/assets';
function buildV4Src() {
  const p = JSON.parse(JSON.stringify(originalPayload));
  p.schemaVersion = 4;
  p.mode = 'external';
  p.submitToken = 'probe-submit-token';
  const models = p.project.models || [];
  const keyByModelId = new Map();
  models.forEach((m, idx) => { keyByModelId.set(m.modelId, `probe-${idx}`); });
  p.modelData = models.map((m, idx) => ({
    key: `probe-${idx}`,
    fileRef: `probe-${idx}.glb`,
    size: glbByFileRef.get(`probe-${idx}.glb`)?.length || 0,
    url: `${FAKE_BASE}/probe-${idx}.glb`,
  }));
  /* v3+ 规范：models 改为 dataKey/fileRef 引用顶层池，不自带 base64Chunks（强制走 v4 fetch 分支） */
  p.project.models = models.map((m, idx) => {
    const { base64Chunks: _dropped, ...rest } = m;
    return { ...rest, dataKey: `probe-${idx}`, fileRef: `probe-${idx}.glb` };
  });
  return pageSrc.slice(0, pageSrc.indexOf('{', start)) + JSON.stringify(p) + pageSrc.slice(end);
}
const v4PayloadForAssert = JSON.parse(buildV4Src().slice(buildV4Src().indexOf('{', start), buildV4Src().lastIndexOf('}') + 1));

const DIALOG_OPEN = `(() => {
  const m = document.querySelector('.model-list-mask');
  return m ? !m.classList.contains('hidden') : false;
})()`;

async function partReviewer(browser) {
  const src = buildV4Src();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const assetHits = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: src, contentType: 'text/html; charset=utf-8' }));
  await page.route('**/reviews/assets/**', (route) => {
    const url = route.request().url();
    assetHits.push(url);
    const ref = decodeURIComponent(url.split('/reviews/assets/')[1] || '');
    const bin = glbByFileRef.get(ref);
    if (bin) return route.fulfill({ body: bin, contentType: 'model/gltf-binary' });
    return route.fulfill({ status: 404, body: 'missing asset' });
  });
  for (let k = 0; k < 10; k++) {
    try { await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
    catch (e) { if (k === 9) throw e; await sleep(3000); }
  }
  await sleep(2500);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  assert(glbByFileRef.size > 0, `V1 surgery: decoded ${glbByFileRef.size} glb(s) from original inline chunks`);
  assert(v4PayloadForAssert.schemaVersion === 4 && v4PayloadForAssert.mode === 'external', 'V2 surgery: payload is v4 external');
  assert(v4PayloadForAssert.modelData.every((e) => !e.base64Chunks && /^https?:\/\//.test(e.url)), 'V3 surgery: modelData entries carry url only (no base64)');

  /* open model list dialog and load first model -> must go through fetch branch */
  const firstCourseId = await page.evaluate(() => document.querySelector('.course-card:not(.empty) [data-course-outline]')?.dataset.courseOutline || '');
  assert(firstCourseId !== '', 'V4 reviewer: course with models present');
  await page.evaluate((cid) => document.querySelector(`[data-course-outline="${cid}"]`)?.click(), firstCourseId);
  await sleep(300);
  assert(await page.evaluate(DIALOG_OPEN), 'V5 reviewer: model list dialog opens');
  const rowCount = await page.evaluate(() => document.querySelectorAll('.model-list-row').length);
  assert(rowCount > 0, `V6 reviewer: dialog lists models (got ${rowCount})`);
  const expectRef = await page.evaluate(() => document.querySelector('.model-list-row')?.dataset.fileRef || '');
  await page.evaluate(() => document.querySelector('.model-list-row')?.click());
  await sleep(3000);
  assert(!(await page.evaluate(DIALOG_OPEN)), 'V7 reviewer: dialog closes after row click');
  const title = await page.evaluate(() => document.getElementById('model-title')?.textContent || '');
  assert(title.trim() !== '', `V8 reviewer: v4 external model loaded via fetch (title=${title})`);
  assert(assetHits.length >= 1, `V9 reviewer: asset fetch intercepted (${assetHits.length} hit(s))`);
  if (assetHits.length) {
    const expected = v4PayloadForAssert.modelData.map((e) => e.url);
    assert(expected.some((u) => assetHits[0] === u || assetHits[0].endsWith(u.split('/reviews/assets/')[1])), `V10 reviewer: fetched URL matches payload asset url (${assetHits[0]})`);
  }
  const nodes = await page.evaluate(() => document.getElementById('nodes')?.textContent || '');
  assert(/^\d+/.test(nodes.trim()) && !/^0/.test(nodes.trim()), `V11 reviewer: parsed node count (${nodes})`);
  const statusText = await page.evaluate(() => document.getElementById('status')?.textContent || '');
  if (statusText) results.push(`INFO - reviewer status: ${statusText.slice(0, 160)}`);

  /* submit button enabled (canSubmitReview: submitToken + http origin) */
  const submitEnabled = await page.evaluate(() => { const b = document.getElementById('submit-review'); return b ? !b.disabled && !b.hidden : null; });
  assert(submitEnabled === true, 'V12 reviewer: submit-review enabled for v4 external payload');

  /* export reviewed HTML -> download must carry v4 external payload without base64 */
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(() => document.getElementById('export-html')?.click());
  const download = await downloadPromise;
  const dlPath = await download.path();
  const dlHtml = fs.readFileSync(dlPath, 'utf8');
  const dlStart = dlHtml.indexOf('window.__AN_REVIEW_PAYLOAD__=');
  assert(dlStart > 0, 'V13 export: reviewed HTML contains payload marker');
  let dlPayload = null;
  try {
    const ds = dlHtml.indexOf('{', dlStart);
    let d = 0, s = false, de = -1;
    for (let j = ds; j < dlHtml.length; j++) {
      const c = dlHtml[j];
      if (s) { if (c === '\\') j++; else if (c === '"') s = false; continue; }
      if (c === '"') s = true;
      else if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) { de = j + 1; break; } }
    }
    dlPayload = JSON.parse(dlHtml.slice(ds, de));
  } catch { /* parse fail -> assert below catches */ }
  assert(dlPayload && dlPayload.schemaVersion === 4 && dlPayload.mode === 'external', 'V14 export: reviewed payload is v4 external');
  assert(dlPayload && Array.isArray(dlPayload.modelData) && dlPayload.modelData.every((e) => !e.base64Chunks && /^https?:\/\//.test(e.url)), 'V15 export: reviewed payload keeps external urls, no base64 chunks');
  assert(dlPayload && dlPayload.review && dlPayload.review.reviewedExportedAt, 'V16 export: review metadata stamped');
  const payloadSeg = dlHtml.slice(dlStart, dlHtml.indexOf(';</script>', dlStart));
  assert(!payloadSeg.includes('base64Chunks'), 'V17 export: payload segment free of base64Chunks (runtime source excluded from check)');

  assert(errors.length === 0, `V18 reviewer: no page errors (${errors.join(' ; ').slice(0, 200)})`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  try {
    await partReviewer(browser);
  } finally {
    await browser.close();
  }
})().catch((e) => { results.push(`FAIL - probe crashed: ${String(e).slice(0, 300)}`); process.exitCode = 1; })
  .finally(() => {
    fs.writeFileSync(process.env.OUT ? `${process.env.OUT}/probe-v4-external-result.txt` : 'probe-v4-external-result.txt', results.join('\n') + '\n', 'utf8');
    results.forEach((line) => console.log(line));
  });
