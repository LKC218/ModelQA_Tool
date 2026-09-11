const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const btn = page.locator('#help-hotspot-btn');
  const exists = await btn.count();
  const title = exists ? await btn.getAttribute('title') : null;
  if (exists) {
    await btn.hover();
    await page.waitForTimeout(500);
  }
  const pop = page.locator('#help-hotspot-pop');
  const popHidden = exists ? await pop.evaluate(el => el.classList.contains('hidden')) : null;
  const popInfo = exists ? await pop.evaluate(el => ({
    hidden: el.classList.contains('hidden'),
    title: el.querySelector('.help-hotspot-title')?.textContent,
    body: el.querySelector('.help-hotspot-body')?.textContent,
    imgSrc: el.querySelector('.help-hotspot-img')?.getAttribute('src'),
    imgNatural: el.querySelector('.help-hotspot-img')?.naturalWidth,
    dots: el.querySelectorAll('.help-hotspot-dot').length,
  })) : null;
  await page.screenshot({ path: process.env.OUT + '/hotspot-dev.png' });
  // reviewer
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const revBtn = page.locator('#help-hotspot-btn');
  const revExists = await revBtn.count();
  if (revExists) {
    await revBtn.hover();
    await page.waitForTimeout(500);
  }
  const revPop = revExists ? await page.locator('#help-hotspot-pop').evaluate(el => ({
    hidden: el.classList.contains('hidden'),
    title: el.querySelector('.help-hotspot-title')?.textContent,
    imgSrc: el.querySelector('.help-hotspot-img')?.getAttribute('src'),
    imgNatural: el.querySelector('.help-hotspot-img')?.naturalWidth,
  })) : null;
  await page.screenshot({ path: process.env.OUT + '/hotspot-rev.png' });
  console.log(JSON.stringify({ dev: { exists, title, popHidden, popInfo }, rev: { revExists, revPop } }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
