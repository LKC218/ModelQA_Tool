const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const r=document.getElementById('onb-root'); if(r){r.classList.remove('is-open');r.style.display='none';} });
  const info = await page.evaluate(() => {
    const btn = document.getElementById('help-hotspot-btn');
    const icon = btn?.querySelector('.help-hotspot-icon');
    const r = btn?.getBoundingClientRect();
    const cs = btn ? getComputedStyle(btn) : null;
    const ics = icon ? getComputedStyle(icon) : null;
    return {
      size: r ? { w: r.width, h: r.height } : null,
      bg: cs?.backgroundColor,
      border: cs?.borderColor,
      iconBg: ics?.backgroundColor,
      mask: (ics?.maskImage || ics?.webkitMaskImage || '').slice(0, 40),
      hasIconVar: !!btn?.style.getPropertyValue('--help-icon'),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
