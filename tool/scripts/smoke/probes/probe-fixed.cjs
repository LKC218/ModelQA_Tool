const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: process.env.OUT + '/rev-fixed-full.png' });
  await page.screenshot({ path: process.env.OUT + '/rev-fixed-bottom-right.png', clip: { x: 900, y: 700, width: 540, height: 200 } });
  await page.screenshot({ path: process.env.OUT + '/rev-fixed-top.png', clip: { x: 0, y: 0, width: 1440, height: 80 } });
  const info = await page.evaluate(() => {
    const toolbar = document.querySelector('.viewer-toolbar');
    const hud = document.querySelector('.viewer-hud');
    const overlay = document.getElementById('folder-drop');
    const step = document.querySelector('.course-subtitle-step');
    const cur = document.getElementById('review-rail-current');
    const r = (el) => el ? el.getBoundingClientRect() : null;
    return {
      stageChildren: [...(document.querySelector('.stage')?.children || [])].map(c => c.className || c.id || c.tagName),
      toolbarParent: toolbar?.parentElement?.className,
      toolbar: { rect: r(toolbar), visibility: toolbar ? getComputedStyle(toolbar).visibility : null, text: toolbar?.innerText },
      hud: { rect: r(hud), visibility: hud ? getComputedStyle(hud).visibility : null, text: hud?.innerText?.slice(0,60) },
      overlay: { className: overlay?.className, display: overlay ? getComputedStyle(overlay).display : null },
      subtitle: `${step?.textContent || ''} ${cur?.textContent || ''}`,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
