const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const dismissOnb = async () => {
    await page.evaluate(() => {
      const root = document.getElementById('onb-root');
      if (root) { root.classList.remove('is-open'); root.style.display = 'none'; }
    });
  };
  const probe = async (url) => {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await dismissOnb();
    const info = await page.evaluate(() => {
      const btn = document.getElementById('help-hotspot-btn');
      const inTopbar = !!btn?.closest('.topbar, .topbar-course-subtitle');
      const inTree = !!btn?.closest('.tree-panel, #tree-help-slot');
      const heading = btn?.closest('.panel-heading')?.innerText?.replace(/\s+/g, ' ').trim();
      return {
        exists: !!btn,
        inTopbar,
        inTree,
        heading,
        btnRect: btn ? btn.getBoundingClientRect() : null,
      };
    });
    await page.locator('#help-hotspot-btn').hover({ timeout: 5000 });
    await page.waitForTimeout(500);
    const pop = await page.locator('#help-hotspot-pop').evaluate(el => {
      const img = el.querySelector('img');
      return {
        hidden: el.classList.contains('hidden'),
        srcPrefix: (img?.getAttribute('src') || '').slice(0, 30),
        isData: (img?.getAttribute('src') || '').startsWith('data:'),
        naturalWidth: img?.naturalWidth,
        title: el.querySelector('.help-hotspot-title')?.textContent,
      };
    });
    await page.screenshot({ path: process.env.OUT + (url.includes('reviewer') ? '/hotspot-tree-rev.png' : '/hotspot-tree-dev.png') });
    // switch frame
    await page.locator('.help-hotspot-dot[data-i="2"]').click().catch(()=>{});
    await page.waitForTimeout(250);
    const frame3 = await page.locator('#help-hotspot-pop .help-hotspot-title').textContent();
    return { info, pop, frame3 };
  };
  const dev = await probe('http://localhost:5173/');
  const rev = await probe('http://localhost:5173/reviewer-preview.html');
  console.log(JSON.stringify({ dev, rev }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
