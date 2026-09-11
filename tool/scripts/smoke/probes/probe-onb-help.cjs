const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const boot = await page.evaluate(() => ({
    onbOpen: !!document.getElementById('onb-root')?.classList.contains('is-open'),
    hasOnbBtn: !!document.getElementById('help-hotspot-btn-onb'),
    hasDefaultBtn: !!document.getElementById('help-hotspot-btn'),
    badge: document.querySelector('[data-onb-badge]')?.textContent?.trim(),
    slotHidden: document.querySelector('[data-onb-help-slot]')?.hidden,
  }));

  const btn = page.locator('#help-hotspot-btn-onb');
  if (!(await btn.count())) {
    console.log(JSON.stringify({ boot, error: 'missing onb hotspot' }, null, 2));
    await browser.close();
    process.exit(1);
  }
  // 直接 DOM click，避免 playwright hover 先开弹层再被 click 关掉
  await page.evaluate(() => document.getElementById('help-hotspot-btn-onb').click());
  await page.waitForTimeout(300);
  const opened = await page.locator('#help-hotspot-pop-onb').evaluate((el) => ({
    open: !el.classList.contains('hidden'),
    zIndex: getComputedStyle(el).zIndex,
    title: el.querySelector('.help-hotspot-title')?.textContent,
    body: el.querySelector('.help-hotspot-body')?.textContent,
    tips: el.querySelector('.help-hotspot-tips')?.textContent,
    imgOk: (el.querySelector('img')?.naturalWidth || 0) > 0,
    imgComplete: !!el.querySelector('img')?.complete,
  }));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const afterEsc = await page.evaluate(() => ({
    popHidden: document.getElementById('help-hotspot-pop-onb')?.classList.contains('hidden'),
    onbStillOpen: !!document.getElementById('onb-root')?.classList.contains('is-open'),
  }));

  // 再次打开后点「下一步」应隐藏热点（inline 样例包第 1 步已 ready）
  await page.evaluate(() => document.getElementById('help-hotspot-btn-onb').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const next = document.querySelector('[data-onb-next]');
    if (next && !next.disabled) next.click();
  });
  await page.waitForTimeout(400);
  const afterNext = await page.evaluate(() => ({
    badge: document.querySelector('[data-onb-badge]')?.textContent?.trim(),
    slotHidden: document.querySelector('[data-onb-help-slot]')?.hidden,
    popHidden: document.getElementById('help-hotspot-pop-onb')?.classList.contains('hidden') !== false,
    onbStillOpen: !!document.getElementById('onb-root')?.classList.contains('is-open'),
  }));

  // 树热点仍可用
  const treeHotspot = await page.evaluate(() => !!document.getElementById('help-hotspot-btn'));

  console.log(JSON.stringify({ boot, opened, afterEsc, afterNext, treeHotspot }, null, 2));
  const ok = boot.onbOpen && boot.hasOnbBtn && boot.hasDefaultBtn && !boot.slotHidden
    && opened.open && opened.title === '加载审核包' && opened.imgOk
    && Number(opened.zIndex) >= 1000
    && afterEsc.popHidden && afterEsc.onbStillOpen && treeHotspot
    && afterNext.slotHidden && afterNext.onbStillOpen;
  await browser.close();
  if (!ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
