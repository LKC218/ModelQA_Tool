const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const probe = async (url) => {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const r=document.getElementById('onb-root'); if(r){r.classList.remove('is-open');r.style.display='none';} });
    const inTree = await page.evaluate(() => !!document.getElementById('help-hotspot-btn')?.closest('.tree-panel, #tree-help-slot'));
    await page.locator('#help-hotspot-btn').hover({ timeout: 5000 });
    await page.waitForTimeout(400);
    const pop = await page.locator('#help-hotspot-pop').evaluate(el => {
      const img = el.querySelector('img');
      return {
        open: !el.classList.contains('hidden'),
        title: el.querySelector('.help-hotspot-title')?.textContent,
        body: el.querySelector('.help-hotspot-body')?.textContent,
        srcPrefix: (img?.getAttribute('src')||'').slice(0, 24),
        isGif: (img?.getAttribute('src')||'').includes('gif'),
        naturalWidth: img?.naturalWidth,
        naturalHeight: img?.naturalHeight,
        hasDots: !!el.querySelector('.help-hotspot-dots'),
      };
    });
    await page.screenshot({ path: process.env.OUT + (url.includes('reviewer') ? '/gif-pop-rev.png' : '/gif-pop-dev.png') });
    return { inTree, pop };
  };
  const dev = await probe('http://localhost:5173/');
  const rev = await probe('http://localhost:5173/reviewer-preview.html');
  console.log(JSON.stringify({ dev, rev }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
