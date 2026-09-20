/* one-shot diagnostic: why is viewer-hud still visible on mobile */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const pageSrc = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('an-reviewer-onboarding-v1', 'done'); } catch (e) {} });
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageSrc }));
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => {
    const hud = document.querySelector('.viewer-hud');
    const info = { bodyClass: document.body.className, htmlClass: document.documentElement.className, hudDisplay: hud ? getComputedStyle(hud).display : 'null', hudParent: hud ? hud.parentElement.className : '' };
    const hits = [];
    const scan = (list, tag) => { for (const sheet of list) { let rules; try { rules = sheet.cssRules; } catch (e) { continue; } const walk = (rs) => { for (const r of rs) { if (r.cssRules) walk(r.cssRules); else if (r.selectorText && /viewer-hud/.test(r.selectorText)) hits.push({ from: tag, sel: r.selectorText, css: r.style.cssText.slice(0, 120), media: r.parentRule?.conditionText || '' }); } }; walk(rules); } };
    scan([...document.styleSheets], 'doc');
    scan([...(document.adoptedStyleSheets || [])], 'adopted');
    info.rules = hits;
    return info;
  });
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync('G:/项目/模型审核工具/tool/output/playwright/diag-hud.json', JSON.stringify(out, null, 1));
  await browser.close();
})();
