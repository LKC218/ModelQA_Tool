const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};
  for (const [name, url] of [['dev','http://localhost:5173/'],['rev','http://localhost:5173/reviewer-preview.html']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    results[name] = await page.evaluate(() => {
      const isolate = document.getElementById('isolate');
      const hints = [...document.querySelectorAll('.tree-empty-hint, [id="tree"]')].map(el => el.textContent || '').join(' | ');
      return {
        isolateText: isolate?.textContent,
        isolateTitle: isolate?.title,
        treeHint: document.querySelector('.tree-empty-hint')?.textContent || document.getElementById('tree')?.innerText?.slice(0,80),
        bodyHasDanhua: document.body.innerText.includes('淡化其他'),
      };
    });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
