/* hotload prod smoke: upload a minimal snapshot HTML via /api/upload, open the
   hosted URL, assert the overlay link loads the live /runtime/ui.css, then hard-delete.
   ASCII-safe output. */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = 'https://3d.propanda.cn';
const TOKEN = fs.readFileSync('G:/项目/服务器部署/private/modelqa-token.txt', 'utf8').trim();
const HTML = fs.readFileSync('G:/项目/模型审核工具/tool/output/tmp-hotload-file.html');
const NAME = 'UI热更冒烟-20260914-审核器.html';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };

(async () => {
  /* 1) upload */
  const up = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(NAME), 'X-ModelQA-Token': TOKEN, 'Content-Type': 'text/html;charset=utf-8' },
    body: new Uint8Array(HTML),
  });
  const upBody = await up.json().catch(() => ({}));
  assert(up.ok && upBody.url, `upload ok -> ${upBody.url || JSON.stringify(upBody)}`);
  if (!upBody.url) process.exit(1);
  const hosted = upBody.url.startsWith('http') ? upBody.url : BASE + upBody.url;

  /* 2) open hosted URL, assert overlay + live css */
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let cssStatus = 0;
  page.on('response', (r) => { if (r.url().includes('/runtime/ui.css')) cssStatus = r.status(); });
  for (let k = 0; k < 3; k++) {
    try { await page.goto(hosted + '?nocache=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 }); break; }
    catch (e) { if (k === 2) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  await page.waitForTimeout(3000);
  const link = await page.evaluate(() => document.querySelector('link[href="/runtime/ui.css"]')?.href || '');
  const appNodes = await page.evaluate(() => document.querySelectorAll('#app *').length);
  assert(link.endsWith('/runtime/ui.css'), `hosted: overlay link present (${link})`);
  assert(cssStatus === 200, `hosted: live /runtime/ui.css loaded (status=${cssStatus})`);
  assert(appNodes > 0, `hosted: page renders (${appNodes} nodes)`);
  assert(errors.length === 0, `hosted: no pageerror (${errors.length})`);
  await browser.close();

  /* 3) cleanup: hard delete the smoke file */
  const id = hosted.split('/reviews/')[1] || '';
  const del = await fetch(`${BASE}/api/reviews/${encodeURIComponent(id)}?hard=1`, {
    method: 'DELETE', headers: { 'X-ModelQA-Token': TOKEN },
  });
  assert(del.ok, `cleanup: hard delete ${id} (status=${del.status})`);
  console.log('probe-hotload-prod done');
})();
