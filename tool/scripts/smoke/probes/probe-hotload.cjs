/* hotload E2E probe: /runtime/ui.css overlay + silent fallback (ASCII-safe).
   Prereq: npm run dev (5173). Run: node probe-hotload.cjs (OUT=outdir).
   Case 1 hit  -> overlay <link> appended AFTER snapshot <style> and applied.
   Case 2 404  -> onerror removes link, page renders from snapshot CSS.
   Case 3 file:// -> protocol guard: no request issued, snapshot renders. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const GEN = fs.readFileSync('G:/项目/模型审核工具/tool/src/generated/reviewer-runtime.js', 'utf8');
const pageSrc = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };

/* file:// variant: inline runtime source in place of the script src (file url would 404 on /src/...) */
const srcRef = /<script[^>]*src="[^"]*reviewer-runtime\.js"[^>]*><\/script>/;
if (!srcRef.test(pageSrc)) { console.log('FAIL - preview runtime script tag not found'); process.exit(1); }
const inlinePage = pageSrc.replace(srcRef, () => '<script>' + GEN + '</script>');
const tmpFile = path.resolve(__dirname, '..', '..', '..', 'output', 'tmp-hotload-file.html');
fs.writeFileSync(tmpFile, inlinePage);

const MARK_CSS = '#app::after{content:"hotload-ok";position:fixed;left:-9999px;top:-9999px}';
const gotoRetry = async (page, url) => {
  for (let k = 0; k < 10; k++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); return; }
    catch (e) { if (k === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });

  /* case 1: hit -> overlay applied */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: pageSrc, contentType: 'text/html; charset=utf-8' }));
    await page.route('**/runtime/ui.css', (route) => route.fulfill({ body: MARK_CSS, contentType: 'text/css' }));
    await gotoRetry(page, 'http://localhost:5173/reviewer-preview.html');
    await page.waitForTimeout(2000);
    const link = await page.evaluate(() => !!document.querySelector('link[href="/runtime/ui.css"]'));
    const mark = await page.evaluate(() => getComputedStyle(document.querySelector('#app'), '::after').content);
    const appNodes = await page.evaluate(() => document.querySelectorAll('#app *').length);
    assert(link, 'hit: overlay link appended');
    assert(mark === '"hotload-ok"', `hit: overlay css applied (content=${mark})`);
    assert(appNodes > 0, `hit: app rendered from snapshot runtime (${appNodes} nodes)`);
    assert(errors.length === 0, `hit: no pageerror (${errors.length})`);
    await page.close();
  }

  /* case 2: 404 -> silent fallback */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: pageSrc, contentType: 'text/html; charset=utf-8' }));
    await page.route('**/runtime/ui.css', (route) => route.abort());
    await gotoRetry(page, 'http://localhost:5173/reviewer-preview.html');
    await page.waitForTimeout(2000);
    const link = await page.evaluate(() => document.querySelector('link[href="/runtime/ui.css"]'));
    const appNodes = await page.evaluate(() => document.querySelectorAll('#app *').length);
    assert(!link, '404: onerror removed overlay link');
    assert(appNodes > 0, `404: page rendered from snapshot css (${appNodes} nodes)`);
    assert(errors.length === 0, `404: no pageerror (${errors.length})`);
    await page.close();
  }

  /* case 3: file:// -> protocol guard */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('runtime/ui.css')) reqs.push(r.url()); });
    await page.goto('file:///' + tmpFile.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    const link = await page.evaluate(() => document.querySelector('link[href="/runtime/ui.css"]'));
    const appNodes = await page.evaluate(() => document.querySelectorAll('#app *').length);
    assert(reqs.length === 0, 'file: no css request issued (protocol guard)');
    assert(!link, 'file: no overlay link');
    assert(appNodes > 0, `file: page renders offline from snapshot (${appNodes} nodes)`);
    assert(errors.length === 0, `file: no pageerror (${errors.length})`);
    await page.close();
  }

  await browser.close();
  console.log('probe-hotload done');
})();
