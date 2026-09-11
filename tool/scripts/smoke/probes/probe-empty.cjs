const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Clear storage so preview starts empty if possible; also open root which may have no payload
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  // Force empty state by evaluating: remove payload if preview auto-loads
  await page.waitForTimeout(1000);
  // Check loaded preview first
  const loaded = await page.evaluate(() => ({
    overlayDisplay: getComputedStyle(document.getElementById('folder-drop')).display,
    toolbarVisibility: getComputedStyle(document.querySelector('.viewer-toolbar')).visibility,
    toolbarParent: document.querySelector('.viewer-toolbar')?.parentElement?.className,
  }));
  console.log('loaded-preview', JSON.stringify(loaded));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
