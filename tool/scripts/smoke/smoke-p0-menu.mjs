import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const outDir = new URL('../../output/playwright/', import.meta.url);
await mkdir(outDir, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, outDir));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('model-title')?.textContent?.includes('1N4007'), null, { timeout: 30000 });
await page.waitForTimeout(500);

const hasMenuBtn = await page.locator('[data-course-menu]').count();
const listCount = await page.locator('.course-model-list .model-item').count();
const activeText = await page.locator('.course-model-list .model-item.active b').first().textContent().catch(() => '');
const listScroll = await page.evaluate(() => {
  const list = document.querySelector('.course-model-list');
  if (!list) return null;
  const style = getComputedStyle(list);
  return { maxH: style.maxHeight, scrollH: list.scrollHeight, clientH: list.clientHeight, overflowY: style.overflowY };
});

await page.screenshot({ path: shot('p0-course-model-list.png'), fullPage: true });
console.log(JSON.stringify({ hasMenuBtn, listCount, activeText, listScroll, errors }, null, 2));
await browser.close();
if (hasMenuBtn || errors.length || listCount < 1) process.exit(1);
