/* mobile density probe (v1.2.2 UI declutter, ASCII-safe).
   Prereq: npm run dev (5173). Run: node probe-mobile-density.cjs (OUT=outdir).
   Covers (reviewer, viewport 390x844, is-app mobile form):
     1. topbar single row: export group / theme / help hidden, folder+settings+more visible;
     2. course card single-row compact: meta-label hidden, count badge visible, outline vertical-center;
     3. viewer HUD hidden (status single-source = sheet-peek);
     4. viewer toolbar icon-only round buttons (tb-label hidden, border-radius 999px);
     5. sheet-peek + mobile-tabs intact;
     6. desktop sanity (1280x800): export-zip visible again, hud visible, tb-label visible. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };

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

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-proxy-server'] });
  try {
    /* ---- mobile: 390x844 ---- */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('an-reviewer-onboarding-v1', 'done'); } catch (e) {} });
    await page.route('**/reviewer-preview.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageSrc }));
    await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.course-card', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const onb = await page.$('#onb-root');
    if (onb) await page.evaluate(() => document.getElementById('onb-root')?.remove());

    const cs = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el); return { display: c.display, radius: c.borderRadius, minH: c.minHeight, minW: c.minWidth, hidden: !el.offsetParent && c.position !== 'fixed' ? c.display === 'none' : false, present: !!el }; }, sel);

    /* 1. topbar declutter */
    const zip = await cs('#export-zip');
    const more = await cs('#export-more-btn');
    const theme = await cs('#theme-toggle');
    const help = await cs('#onboarding-help');
    assert(zip && zip.display === 'none', 'mobile: #export-zip hidden');
    assert(more && more.display === 'none', 'mobile: #export-more-btn hidden');
    assert(theme && theme.display === 'none', 'mobile: #theme-toggle hidden');
    assert(help && help.display === 'none', 'mobile: #onboarding-help hidden');
    const folder = await cs('#folder');
    const settings = await cs('#app-settings-toggle');
    const mobileMore = await cs('#mobile-more');
    assert(folder && folder.display !== 'none', 'mobile: #folder visible');
    assert(settings && settings.display !== 'none', 'mobile: #app-settings-toggle visible');
    assert(mobileMore && mobileMore.display !== 'none', 'mobile: #mobile-more visible');
    const rows = await page.evaluate(() => {
      const tb = document.querySelector('.topbar');
      if (!tb) return 0;
      const leaves = [...tb.querySelectorAll('.topbar h1, .topbar-course-subtitle, .actions > *')].filter((el) => {
        const c = getComputedStyle(el);
        if (c.display === 'none' || el.hidden) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      });
      return new Set(leaves.map((el) => Math.round(el.getBoundingClientRect().top / 8))).size;
    });
    assert(rows <= 2, `mobile: topbar visual rows <= 2 (got ${rows})`);

    /* 2. course cards compact (payload has courses) */
    const cardSel = await cs('.course-card-select');
    const cardArticle = await cs('.course-card');
    const metaLabel = await cs('.course-card-meta-label');
    if (cardSel) {
      assert(cardSel.display === 'flex', 'mobile: course-card-select flex single-row');
      assert(cardArticle && cardArticle.radius !== '0px', `mobile: course-card rounded (got ${cardArticle && cardArticle.radius})`);
    } else assert(false, 'mobile: course-card-select present');
    if (metaLabel) assert(metaLabel.display === 'none', 'mobile: course-card-meta-label hidden');
    else console.log('SKIP - course-card-meta-label (no cards rendered)');
    const outline = await page.evaluate(() => {
      const el = document.querySelector('.course-card-outline');
      if (!el) return null;
      const c = getComputedStyle(el);
      const card = el.closest('.course-card').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { position: c.position, centered: Math.abs((b.top + b.height / 2) - (card.top + card.height / 2)) < 4 };
    });
    if (outline) assert(outline.position === 'absolute' && outline.centered, 'mobile: outline btn vertically centered');

    /* 3. HUD hidden */
    const hud = await cs('.viewer-hud');
    assert(hud && hud.display === 'none', 'mobile: viewer-hud hidden');

    /* 4. toolbar icon-only */
    const fit = await cs('#fit');
    assert(fit && fit.display !== 'none' && parseFloat(fit.minW) >= 38 && parseFloat(fit.minH) >= 38, `mobile: #fit round button >=38px (got ${fit && fit.minW}x${fit && fit.minH})`);
    assert(fit && fit.radius === '999px', `mobile: #fit circular (got ${fit && fit.radius})`);
    const fitLabel = await page.evaluate(() => {
      const el = document.querySelector('#fit .tb-label');
      return el ? getComputedStyle(el).display : null;
    });
    assert(fitLabel === 'none', 'mobile: tb-label hidden inside #fit');
    const svgOk = await page.evaluate(() => !!document.querySelector('#fit svg'));
    assert(svgOk, 'mobile: #fit has svg icon');
    const wireLabel = await page.evaluate(() => { const el = document.querySelector('#wire .tb-label'); return el ? getComputedStyle(el).display : null; });
    assert(wireLabel === 'none', 'mobile: tb-label hidden inside #wire');

    /* 5. peek + tabs intact */
    const peek = await cs('#sheet-peek');
    assert(peek && peek.display !== 'none', 'mobile: sheet-peek visible');
    const tabs = await cs('.mobile-tabs');
    assert(tabs && tabs.display !== 'none', 'mobile: mobile-tabs visible');

    await page.screenshot({ path: path.join(OUT, 'mobile-density-390.png'), fullPage: false });
    await ctx.close();

    /* ---- desktop sanity: 1280x800 ---- */
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    await page2.addInitScript(() => { try { localStorage.setItem('an-reviewer-onboarding-v1', 'done'); } catch (e) {} });
    await page2.route('**/reviewer-preview.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageSrc }));
    await page2.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(1500);
    const onb2 = await page2.$('#onb-root');
    if (onb2) await page2.evaluate(() => document.getElementById('onb-root')?.remove());
    const dzip = await page2.evaluate(() => getComputedStyle(document.querySelector('#export-zip')).display);
    assert(dzip !== 'none', 'desktop: #export-zip visible again');
    const dhud = await page2.evaluate(() => getComputedStyle(document.querySelector('.viewer-hud')).display);
    assert(dhud !== 'none', 'desktop: viewer-hud visible again');
    const dlabel = await page2.evaluate(() => getComputedStyle(document.querySelector('#fit .tb-label')).display);
    assert(dlabel !== 'none', 'desktop: tb-label visible (icon+text)');
    await ctx2.close();
  } finally {
    await browser.close();
  }
  console.log('DONE probe-mobile-density');
})();
