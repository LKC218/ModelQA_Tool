import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('model-title')?.textContent?.includes('1N4007'), null, { timeout: 30000 });
await page.waitForTimeout(400);
const read = () => page.evaluate(() => {
  const pick = (id) => {
    const on = document.querySelector(`#${id} button.is-on`);
    if (!on) return { on: null };
    const cs = getComputedStyle(on);
    return {
      on: on.dataset.status,
      color: cs.color,
      bg: cs.backgroundColor,
      boxShadow: cs.boxShadow,
      fontWeight: cs.fontWeight,
    };
  };
  return { model: pick('model-status'), issue: pick('issue-status') };
});
console.log('initial', JSON.stringify(await read(), null, 2));
await page.click('#model-status button[data-status="block"]');
await page.waitForTimeout(200);
console.log('after block', JSON.stringify(await read(), null, 2));
await page.locator('#model-status').screenshot({ path: 'output/playwright/seg-on.png' });
await page.locator('#issue-status').screenshot({ path: 'output/playwright/seg-issue.png' });
await browser.close();
