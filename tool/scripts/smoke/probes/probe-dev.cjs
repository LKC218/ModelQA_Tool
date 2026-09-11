const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.OUT + '/dev-top.png', clip: { x: 0, y: 0, width: 1440, height: 120 } });
  await page.screenshot({ path: process.env.OUT + '/dev-full.png', fullPage: false });
  const subtitle = await page.evaluate(() => {
    const el = document.getElementById('course-subtitle') || document.querySelector('.topbar-course-subtitle');
    const step = document.querySelector('.course-subtitle-step');
    const cur = document.getElementById('rail-current');
    const toolbar = document.querySelector('.viewer-toolbar');
    const fit = document.getElementById('fit');
    const wire = document.getElementById('wire');
    const cs = el ? getComputedStyle(el) : null;
    return {
      title: document.getElementById('project-title')?.textContent,
      subtitleHtml: el?.outerHTML?.slice(0, 300),
      stepText: step?.textContent,
      stepColor: step ? getComputedStyle(step).color : null,
      stepDisplay: step ? getComputedStyle(step).display : null,
      curText: cur?.textContent,
      curColor: cur ? getComputedStyle(cur).color : null,
      curDisplay: cur ? getComputedStyle(cur).display : null,
      subtitleDisplay: cs?.display,
      subtitleWidth: el?.getBoundingClientRect?.().width,
      subtitleHeight: el?.getBoundingClientRect?.().height,
      toolbarHtml: toolbar?.outerHTML?.slice(0, 300),
      toolbarRect: toolbar ? toolbar.getBoundingClientRect() : null,
      toolbarZ: toolbar ? getComputedStyle(toolbar).zIndex : null,
      toolbarDisplay: toolbar ? getComputedStyle(toolbar).display : null,
      fitRect: fit ? fit.getBoundingClientRect() : null,
      fitDisplay: fit ? getComputedStyle(fit).display : null,
      wireDisplay: wire ? getComputedStyle(wire).display : null,
    };
  });
  console.log(JSON.stringify(subtitle, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
