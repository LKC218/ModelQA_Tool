/* diagnostic probe: load REAL alternator model (84 nodes) into reviewer preview,
   explode, then dump mesh world positions to find NaN/Inf/fly-away. ASCII-safe. */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

(async () => {
  const out = [];
  const pageSrc = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');
  const key = 'window.__AN_REVIEW_PAYLOAD__=';
  const start = pageSrc.indexOf(key);
  let i = pageSrc.indexOf('{', start), depth = 0, inStr = false, end = -1;
  for (; i < pageSrc.length; i++) {
    const c = pageSrc[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const payload = JSON.parse(pageSrc.slice(pageSrc.indexOf('{', start), end));
  const glb = fs.readFileSync('G:/项目/模型审核工具/Model/MT-电机控制实训/MT-07 发电机不发电故障检修/汽车交流发电机.glb');
  payload.project.models[0].base64Chunks = [glb.toString('base64')];
  payload.project.models[0].byteLength = glb.length;
  payload.project.models[0].displayName = 'ALTERNATOR-DIAG';
  const jStart = pageSrc.indexOf('{', start);
  const modifiedSrc = pageSrc.slice(0, jStart) + JSON.stringify(payload) + pageSrc.slice(end);
  out.push('payload size MB=' + (modifiedSrc.length / 1048576).toFixed(1));

  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: modifiedSrc, contentType: 'text/html; charset=utf-8' }));
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  const before = await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    let maxAbs = 0, meshCount = 0;
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    v.scene.traverse((n) => {
      if (!n.isMesh) return;
      meshCount++;
      const e = n.matrixWorld.elements;
      for (const x of [e[12], e[13], e[14]]) maxAbs = Math.max(maxAbs, Math.abs(x));
      if ((n.name || '').includes('\u4EA4\u6D41\u53D1\u7535\u673A')) {
        n.geometry.computeBoundingBox();
        const g = n.geometry.boundingBox;
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          const p = [xi ? g.max.x : g.min.x, yi ? g.max.y : g.min.y, zi ? g.max.z : g.min.z];
          const wx = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
          const wy = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
          const wz = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
          [wx, wy, wz].forEach((w, k) => { mn[k] = Math.min(mn[k], w); mx[k] = Math.max(mx[k], w); });
        }
      }
    });
    const origDiag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    return { maxAbs: +maxAbs.toFixed(2), meshCount, explodable: v.isExplodable(), factor: v.explodeFactor, origDiag: +origDiag.toFixed(3) };
  });
  out.push('BEFORE ' + JSON.stringify(before));

  /* T2: 相机连续性断言 —— 动画中途相机已显著退远（旧逻辑中途原地不动，settle 后一次性猛拉） */
  const camInitial = await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    return +v.camera.position.distanceTo(v.controls.target).toFixed(2);
  });
  await page.evaluate(() => { const v = document.querySelector('canvas').__productViewer; v.setExplode(1); });
  const samples = await page.evaluate(() => new Promise((resolve) => {
    const v = document.querySelector('canvas').__productViewer;
    const rows = [], t0 = Date.now();
    const timer = setInterval(() => {
      rows.push({ t: Date.now() - t0, factor: +v.explodeFactor.toFixed(3), dist: +v.camera.position.distanceTo(v.controls.target).toFixed(2) });
      if (v.explodeFactor === 1 || Date.now() - t0 > 3000) { clearInterval(timer); resolve(rows); }
    }, 60);
  }));
  const mid = samples.find((s) => s.factor > 0.15 && s.factor < 0.95);
  out.push('CAM-MID initial=' + camInitial + ' trace=' + JSON.stringify(samples));
  out.push('CAM-CONTINUOUS ' + (mid && mid.dist > camInitial * 1.05
    ? 'PASS (mid factor=' + mid.factor + ' dist=' + mid.dist + ' > initial ' + camInitial + ')'
    : 'FAIL (mid=' + JSON.stringify(mid) + ' initial=' + camInitial + ')'));
  try {
    await page.waitForFunction(() => {
      const v = document.querySelector('canvas').__productViewer;
      return v && v.explodeFactor === 1;
    }, null, { timeout: 15000, polling: 100 });
  } catch (e) { out.push('WARN factor not settled'); }
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    let meshCount = 0, nanCount = 0, maxAbs = 0, maxMesh = '';
    const far = [];
    v.scene.traverse((n) => {
      if (!n.isMesh) return;
      meshCount++;
      const e = n.matrixWorld.elements;
      const p = [e[12], e[13], e[14]];
      let bad = false;
      for (const x of p) { if (!isFinite(x)) { nanCount++; bad = true; } else maxAbs = Math.max(maxAbs, Math.abs(x)); }
      if (bad && far.length < 10) far.push({ name: n.name, p: p.map((x) => String(x).slice(0, 12)) });
      if (!bad && Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) > 500 && far.length < 10) far.push({ name: n.name, p: p.map((x) => +x.toFixed(1)) });
      if (!bad && (!maxMesh || Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) > 0)) { /* track farthest name */ }
    });
    const cam = v.camera.position.toArray().map((x) => +x.toFixed(2));
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    v.scene.traverse((n) => {
      if (!n.isMesh || !(n.name || '').includes('\u4EA4\u6D41\u53D1\u7535\u673A')) return;
      n.geometry.computeBoundingBox();
      const g = n.geometry.boundingBox;
      const e = n.matrixWorld.elements;
      for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
        const p = [xi ? g.max.x : g.min.x, yi ? g.max.y : g.min.y, zi ? g.max.z : g.min.z];
        const wx = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
        const wy = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
        const wz = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
        [wx, wy, wz].forEach((w, k) => { mn[k] = Math.min(mn[k], w); mx[k] = Math.max(mx[k], w); });
      }
    });
    const explodedDiag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    return { meshCount, nanCount, maxAbs: +maxAbs.toFixed(2), far, cam, factor: v.explodeFactor, explodedDiag: +explodedDiag.toFixed(3) };
  });
  out.push('AFTER ' + JSON.stringify(after));
  if (before.origDiag > 0) {
    const ratio = +(after.explodedDiag / before.origDiag).toFixed(2);
    out.push('CONCENTRATION ratio(exploded/orig)=' + ratio + (ratio <= 4 ? ' PASS(<=4)' : ' FAIL(>4)'));
  }
  out.push('pageerrors: ' + JSON.stringify(errors));
  await page.screenshot({ path: 'G:/项目/模型审核工具/tool/output/explode2/alternator-diag.png' });
  fs.writeFileSync('G:/项目/模型审核工具/tool/output/explode2/alternator-diag.log', out.join('\n'), 'utf8');
  await browser.close();
})().catch((e) => { fs.writeFileSync('G:/项目/模型审核工具/tool/output/explode2/alternator-diag.log', 'FATAL ' + String(e).slice(0, 800), 'utf8'); process.exit(1); });
