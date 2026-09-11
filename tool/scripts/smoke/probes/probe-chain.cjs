const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const toolbar = document.querySelector('.viewer-toolbar');
    const chain = [];
    let el = toolbar;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        overflow: cs.overflow,
        width: cs.width,
        height: cs.height,
        rect: el.getBoundingClientRect(),
      });
      el = el.parentElement;
    }
    // find who sets visibility hidden - walk matched rules is hard; check stylesheet
    const sheets = [...document.styleSheets];
    const visRules = [];
    for (const sheet of sheets) {
      let rules;
      try { rules = [...sheet.cssRules]; } catch { continue; }
      for (const rule of rules) {
        if (rule.cssText && /visibility\s*:\s*hidden/.test(rule.cssText)) {
          visRules.push(rule.cssText.slice(0, 300));
        }
      }
    }
    return { chain, visRules, toolbarParent: toolbar?.parentElement?.className, stageChildren: [...(document.querySelector('.stage')?.children || [])].map(c => c.className || c.id || c.tagName) };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
