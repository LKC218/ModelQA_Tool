import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const outDir = new URL('../output/playwright/', import.meta.url);
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
await page.locator('[data-course-menu]').first().click();
await page.waitForTimeout(300);
const rows = await page.evaluate(() => [...document.querySelectorAll('.course-menu-model')].map((row) => ({
  label: row.querySelector('.status-mini-label')?.textContent || '',
  dot: row.querySelector('.status-dot')?.className || '',
  text: row.textContent.replace(/\s+/g, ' ').trim(),
})));
await page.screenshot({ path: shot('p0-course-menu.png'), fullPage: true });
console.log(JSON.stringify({ rows, errors }, null, 2));
await browser.close();
