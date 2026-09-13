/* debug helper for explode2 probe — dump served HTML check + scene graph (ASCII-safe) */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

(async () => {
  const out = [];
  /* rebuild modifiedSrc exactly like the probe does */
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
  payload.project.models[0].displayName = 'NESTED-ASM-TEST';
  const jStart = pageSrc.indexOf('{', start);
  const modifiedSrc = pageSrc.slice(0, jStart) + JSON.stringify(payload) + pageSrc.slice(end);
  out.push('modifiedSrc len=' + modifiedSrc.length + ' containsName=' + modifiedSrc.includes('NESTED-ASM-TEST'));

  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: modifiedSrc, contentType: 'text/html; charset=utf-8' }));
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3500);
  out.push('htmlHasName=' + (await page.content()).includes('NESTED-ASM-TEST'));
  out.push('canvas=' + await page.evaluate(() => !!document.querySelector('canvas')));
  const sceneDump = await page.evaluate(() => {
    const v = document.querySelector('canvas')?.__productViewer;
    if (!v) return 'NO VIEWER';
    const dump = (n, d) => {
      if (d > 2) return '';
      let s = '\n' + '  '.repeat(d) + (n.name || n.type || '?') + (n.isMesh ? '*' : '');
      for (const c of (n.children || []).slice(0, 12)) s += dump(c, d + 1);
      return s;
    };
    return dump(v.scene, 0);
  });
  out.push('scene:' + sceneDump);
  out.push('pageerrors: ' + JSON.stringify(errors));
  out.push('console: ' + JSON.stringify(logs.slice(0, 8)));
  await page.screenshot({ path: 'G:/项目/模型审核工具/tool/output/explode2/debug.png' });
  fs.writeFileSync('G:/项目/模型审核工具/tool/output/explode2/debug.log', out.join('\n'), 'utf8');
  await browser.close();
})().catch((e) => { fs.writeFileSync('G:/项目/模型审核工具/tool/output/explode2/debug.log', 'FATAL ' + String(e), 'utf8'); process.exit(1); });
