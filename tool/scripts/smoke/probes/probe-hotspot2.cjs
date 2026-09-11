const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const dismissOnb = async () => {
    for (const sel of ['[data-onb-skip]', 'button:has-text("跳过")', '.onb-skip', '#onb-skip']) {
      const loc = page.locator(sel).first();
      if (await loc.count()) { try { await loc.click({ timeout: 1500 }); } catch {} }
    }
    await page.evaluate(() => {
      const root = document.getElementById('onb-root');
      if (root) root.classList.remove('is-open');
      root?.style && (root.style.display = 'none');
    });
  };
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  await dismissOnb();
  await page.waitForTimeout(300);
  const btn = page.locator('#help-hotspot-btn');
  const exists = await btn.count();
  if (exists) await btn.hover({ timeout: 5000 });
  await page.waitForTimeout(600);
  const popInfo = await page.locator('#help-hotspot-pop').evaluate(el => ({
    hidden: el.classList.contains('hidden'),
    title: el.querySelector('.help-hotspot-title')?.textContent,
    body: el.querySelector('.help-hotspot-body')?.textContent,
    tips: el.querySelector('.help-hotspot-tips')?.textContent,
    imgSrc: el.querySelector('.help-hotspot-img')?.getAttribute('src'),
    imgNatural: el.querySelector('.help-hotspot-img')?.naturalWidth,
    imgComplete: el.querySelector('.help-hotspot-img')?.complete,
    dots: el.querySelectorAll('.help-hotspot-dot').length,
  }));
  await page.screenshot({ path: process.env.OUT + '/hotspot-dev.png' });
  // click frame 2
  await page.locator('.help-hotspot-dot[data-i="1"]').click().catch(()=>{});
  await page.waitForTimeout(300);
  const frame2 = await page.locator('#help-hotspot-pop .help-hotspot-title').textContent();
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissOnb();
  await page.waitForTimeout(300);
  const revExists = await page.locator('#help-hotspot-btn').count();
  if (revExists) await page.locator('#help-hotspot-btn').hover({ timeout: 5000 });
  await page.waitForTimeout(600);
  const revPop = await page.locator('#help-hotspot-pop').evaluate(el => ({
    hidden: el.classList.contains('hidden'),
    title: el.querySelector('.help-hotspot-title')?.textContent,
    imgNatural: el.querySelector('.help-hotspot-img')?.naturalWidth,
    imgSrc: el.querySelector('.help-hotspot-img')?.getAttribute('src'),
  }));
  await page.screenshot({ path: process.env.OUT + '/hotspot-rev.png' });
  console.log(JSON.stringify({ devExists: exists, popInfo, frame2, revExists, revPop }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
