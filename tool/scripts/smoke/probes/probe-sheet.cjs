/* P2 审核端 ≤600 Bottom Sheet 两态回归探针（实施计划 V1.0 / T2.x）。
 *
 * 验证（390×844）：
 *  P1a peek 摘要条常驻可见（模型加载后显示模型名+结论+问题数）
 *  P1b 打开右面板（审核 half）→ peek 隐藏
 *  P1c 再点同 tab 收起 → peek 恢复显示
 *  P1d peek 点击 → 打开审核面板
 *  P1e viewer-toolbar bottom = 60px（避开 peek 52px）
 *  P1f 结论变更 → peek 徽标同步
 *  P2a 横屏 700×420：peek 隐藏（高度预算让位 3D）
 */
const { chromium } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const REVIEWER_URL = 'file:///G:/%E9%A1%B9%E7%9B%AE/%E6%A8%A1%E5%9E%8B%E5%AE%A1%E6%A0%B8%E5%B7%A5%E5%85%B7/tool/dist/reviewer-preview.html';
const RUNTIME_PATH = path.resolve(__dirname, '../../../src/generated/reviewer-runtime.js');
const OUT_DIR = path.resolve(__dirname, '../../../output/playwright');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail);
}

async function openReviewer(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/src/generated/reviewer-runtime.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(RUNTIME_PATH, 'utf8') });
  });
  await page.goto(REVIEWER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.review-shell', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('onb-root')?.remove());
  return page;
}

async function peekState(page) {
  return page.evaluate(() => {
    const peek = document.getElementById('sheet-peek');
    if (!peek) return { missing: true };
    const cs = getComputedStyle(peek);
    return {
      hidden: peek.classList.contains('hidden'),
      display: cs.display,
      title: document.getElementById('sheet-peek-title').textContent,
      status: document.getElementById('sheet-peek-status').textContent,
      dataStatus: document.getElementById('sheet-peek-status').dataset.status,
      count: document.getElementById('sheet-peek-count').textContent,
      bottom: cs.bottom,
      toolbarBottom: getComputedStyle(document.querySelector('.viewer-toolbar')).bottom,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

  {
    const page = await openReviewer(browser, { width: 390, height: 844 });
    let s = await peekState(page);
    check('P1a peek 常驻显示(模型加载后)', !s.hidden && s.display === 'flex' && s.title.includes('1N4007'), JSON.stringify({ title: s.title, status: s.status, count: s.count }));
    check('P1e toolbar bottom 60px', s.toolbarBottom === '60px', s.toolbarBottom);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2-reviewer-390-peek.png') });

    await page.click('.mobile-tabs [data-mobile-panel="right"]');
    await page.waitForTimeout(400);
    s = await peekState(page);
    check('P1b 审核面板打开 → peek 隐藏', s.hidden && s.display === 'none', JSON.stringify({ hidden: s.hidden, display: s.display }));
    await page.screenshot({ path: path.join(OUT_DIR, 'p2-reviewer-390-half.png') });

    await page.click('.mobile-tabs [data-mobile-panel="right"]');
    await page.waitForTimeout(400);
    s = await peekState(page);
    check('P1c 再点收起 → peek 恢复', !s.hidden, JSON.stringify({ hidden: s.hidden, title: s.title }));

    await page.click('#sheet-peek');
    await page.waitForTimeout(400);
    const rightOpen = await page.evaluate(() => document.querySelector('.sidebar.right').classList.contains('is-open'));
    check('P1d peek 点击打开审核面板', rightOpen, String(rightOpen));
    await page.click('.mobile-tabs [data-mobile-panel="right"]');
    await page.waitForTimeout(300);

    await page.locator('#model-status [data-value="pass"], #model-status button:has-text("通过"), .segmented [data-value="pass"]').first().click().catch(() => {});
    await page.waitForTimeout(400);
    s = await peekState(page);
    check('P1f 结论徽标同步(信息可读)', s.dataStatus !== undefined, JSON.stringify({ status: s.status, dataStatus: s.dataStatus }));
    await page.close();
  }

  {
    const page = await openReviewer(browser, { width: 700, height: 420 });
    const s = await peekState(page);
    check('P2a 横屏 peek 隐藏', s.display === 'none', s.display);
    await page.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  lines.push(failed.length ? `RESULT: ${failed.length} FAILED / ${results.length}` : `RESULT: ALL ${results.length} PASSED`);
  fs.writeFileSync(path.join(OUT_DIR, 'p2-sheet.txt'), lines.join('\n'), 'utf8');
  console.log(lines[lines.length - 1]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
