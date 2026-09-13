/* labels e2e probe: real alternator glb -> enable part labels ->
   assert badge/title chips, occlusion fade on back view, screen-space
   declutter, tree hover/click linkage. ASCII-safe output. */
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
  payload.project.models[0].displayName = 'ALTERNATOR-LABELS';
  const jStart = pageSrc.indexOf('{', start);
  const modifiedSrc = pageSrc.slice(0, jStart) + JSON.stringify(payload) + pageSrc.slice(end);

  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: modifiedSrc, contentType: 'text/html; charset=utf-8' }));
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  const pass = (ok, msg) => out.push((ok ? 'PASS' : 'FAIL') + ' - ' + msg);

  /* A. enable labels via API */
  await page.evaluate(() => { const v = document.querySelector('canvas').__productViewer; v.setLabelsVisible(true); });
  await page.waitForTimeout(900);
  const chips = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('.viewer-labels-layer .model-label-host')];
    return {
      count: hosts.length,
      withBadge: hosts.filter((h) => { const n = h.querySelector('.model-label-no'); return n && /^\d+$/.test(n.textContent); }).length,
      withName: hosts.filter((h) => (h.querySelector('.model-label-name')?.textContent || '').trim().length > 0).length,
      withTitle: hosts.filter((h) => (h.title || '').trim().length > 0).length,
      seqOk: hosts.every((h, idx) => h.querySelector('.model-label-no')?.textContent === String(idx + 1)),
    };
  });
  pass(chips.count > 0 && chips.count <= 24, 'A. chips rendered within limit (count=' + chips.count + ')');
  pass(chips.withBadge === chips.count && chips.seqOk, 'A. numbered badges sequential (' + chips.withBadge + '/' + chips.count + ')');
  pass(chips.withName === chips.count && chips.withTitle === chips.count, 'A. name + title present (' + chips.withName + '/' + chips.withTitle + ' of ' + chips.count + ')');

  /* B. occlusion (assembled state): bottom-up view hides most tips, returning
     top view restores the exact occlusion set. */
  const occSetOf = () => page.evaluate(() => [...document.querySelectorAll('.viewer-labels-layer .model-label.is-occluded .model-label-name')].map((el) => el.textContent).sort().join('|'));
  await page.waitForTimeout(700);
  const frontSet = await occSetOf();
  await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    const t = v.controls.target, p = v.camera.position;
    const d = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
    v.camera.position.set(t.x, t.y - d, t.z);
    v.controls.update();
  });
  await page.waitForTimeout(1100);
  const occBottom = await page.evaluate(() => document.querySelectorAll('.viewer-labels-layer .model-label.is-occluded').length);
  pass(occBottom >= 12, 'B. bottom-up view occludes most tips (occluded=' + occBottom + '/24)');
  await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    const t = v.controls.target, p = v.camera.position;
    const d = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
    v.camera.position.set(t.x, t.y + d, t.z);
    v.controls.update();
  });
  await page.waitForTimeout(1100);
  const frontSet2 = await occSetOf();
  pass(frontSet2 === frontSet, 'B. returning top view restores occlusion set exactly');

  /* explode -> declutter & linkage are validated in the exploded state, the real usage flow */
  await page.evaluate(() => { const v = document.querySelector('canvas').__productViewer; v.setExplode(1); });
  try {
    await page.waitForFunction(() => {
      const v = document.querySelector('canvas').__productViewer;
      return v && v.explodeFactor === 1;
    }, null, { timeout: 15000, polling: 100 });
  } catch (e) { out.push('WARN explode not settled'); }
  await page.waitForTimeout(2800); /* camera lerp settle + declutter re-tick (500ms throttle) + 150ms transition */

  /* C. declutter: no pair overlapping more than 40% of the smaller chip */
  const overlaps = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.viewer-labels-layer .model-label')];
    const rs = els.map((el) => el.getBoundingClientRect());
    const nos = els.map((el) => el.querySelector('.model-label-no')?.textContent);
    const badPairs = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const ox = Math.min(rs[i].right, rs[j].right) - Math.max(rs[i].left, rs[j].left);
      const oy = Math.min(rs[i].bottom, rs[j].bottom) - Math.max(rs[i].top, rs[j].top);
      if (ox <= 0 || oy <= 0) continue;
      if (ox * oy >= Math.min(rs[i].width * rs[i].height, rs[j].width * rs[j].height) * 0.4) {
        badPairs.push({ a: nos[i], b: nos[j], ox: +ox.toFixed(0), oy: +oy.toFixed(0), at: +rs[i].top.toFixed(0), bt: +rs[j].top.toFixed(0), dsA: els[i].dataset.avoidShift, dsB: els[j].dataset.avoidShift });
      }
    }
    return { chips: els.length, bad: badPairs.length, badPairs };
  });
  out.push('C-PAIRS ' + JSON.stringify(overlaps.badPairs.slice(0, 12)));
  pass(overlaps.chips > 0 && overlaps.bad === 0, 'C. declutter keeps overlap pairs at zero (bad=' + overlaps.bad + ' chips=' + overlaps.chips + ')');

  /* D. linkage: hover a chip -> matching tree row gets is-hint; click selects */
  const link = await page.evaluate(() => {
    const host = document.querySelector('.viewer-labels-layer .model-label-host');
    if (!host) return { ok: false, why: 'no chip' };
    const name = host.title;
    host.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    const hinted = document.querySelector('#tree .tree-node.is-hint');
    const hintUuid = hinted?.dataset.uuid || '';
    const hintMatch = !!hinted && hinted.textContent.includes(name.slice(0, 4));
    host.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    const cleared = !document.querySelector('#tree .tree-node.is-hint');
    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: !!hinted && cleared, name, hintUuid: hintUuid.slice(0, 8), hintMatch, cleared };
  });
  await page.waitForTimeout(400);
  const clicked = await page.evaluate(() => ({
    part: document.querySelector('#current-part')?.textContent || '',
    active: !!document.querySelector('#tree .tree-node.active'),
  }));
  pass(link.ok, 'D. hover chip hints tree row and clears on leave (hint=' + link.hintUuid + ' match=' + link.hintMatch + ')');
  pass(clicked.active && clicked.part.includes(link.name?.slice(0, 4) || '\u0000'), 'D. click chip selects node (part="' + clicked.part.slice(0, 40) + '")');

  pass(errors.length === 0, 'E. zero pageerrors (' + errors.length + ')');

  await page.screenshot({ path: 'G:/项目/模型审核工具/tool/output/labels/labels-front.png' });
  await page.evaluate(() => document.querySelector('#theme-toggle')?.click());
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'G:/项目/模型审核工具/tool/output/labels/labels-dark.png' });
  fs.writeFileSync('G:/项目/模型审核工具/tool/output/labels/labels-e2e.log', out.join('\n'), 'utf8');
  await browser.close();
})().catch((e) => { fs.writeFileSync('G:/项目/模型审核工具/tool/output/labels/labels-e2e.log', 'FATAL ' + String(e).slice(0, 800), 'utf8'); process.exit(1); });
