const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.getElementById('onb-root')?.classList.remove('is-open'); const r=document.getElementById('onb-root'); if(r) r.style.display='none'; });
  await page.locator('#help-hotspot-btn').hover();
  await page.waitForTimeout(500);
  const ok = await page.locator('#help-hotspot-pop').evaluate(el => ({
    open: !el.classList.contains('hidden'),
    imgOk: el.querySelector('img')?.naturalWidth > 0,
    title: el.querySelector('.help-hotspot-title')?.textContent,
  }));
  // Escape closes
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closed = await page.locator('#help-hotspot-pop').evaluate(el => el.classList.contains('hidden'));
  console.log(JSON.stringify({ ok, closed }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
