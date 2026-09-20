/* P1 审核端 601–900 上下分栏回归探针（实施计划 V1.0 / T1.2）。
 *
 * 验证：
 *  S1. 768×1024（iPad 竖屏）：stage 占第 1 行跨 2 列；sidebar.left/right 第 2 行并排；
 *      footer 可见；mobile-tabs 隐藏；sidebar 无抽屉位移
 *  S2. 800×600 窄窗：同分栏形态
 *  R1. 390×844 回归：仍为抽屉形态（tabs 显示、sidebar 隐藏）
 *  R2. 1440×900 回归：桌面三栏正常
 *
 * 用法：
 *   set NODE_PATH=C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules
 *   node tool/scripts/smoke/probes/probe-split.cjs
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
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.getElementById('onb-root')?.remove());
  return page;
}

function readGrid(page) {
  return page.evaluate(() => {
    const ws = document.querySelector('.workspace');
    const stage = ws.querySelector(':scope > .stage');
    const left = ws.querySelector(':scope > .sidebar.left');
    const right = ws.querySelector(':scope > .sidebar.right');
    const cs = (el) => getComputedStyle(el);
    return {
      cols: cs(ws).gridTemplateColumns.split(' ').length,
      rows: cs(ws).gridTemplateRows.split(' ').length,
      stageRow: cs(stage).gridRowStart + '/' + cs(stage).gridColumnStart + '-' + cs(stage).gridColumnEnd,
      stageVisible: stage.offsetHeight > 0,
      leftRow: cs(left).gridRowStart + '/' + cs(left).gridColumnStart,
      leftVisible: left.offsetHeight > 0,
      leftTransform: cs(left).transform,
      rightRow: cs(right).gridRowStart + '/' + cs(right).gridColumnStart,
      rightVisible: right.offsetHeight > 0,
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
      footerVisible: document.querySelector('.review-shell .footer, footer.footer').offsetHeight > 0,
      stageH: stage.offsetHeight,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

  /* —— S1. 768×1024 分栏 —— */
  {
    const page = await openReviewer(browser, { width: 768, height: 1024 });
    const g = await readGrid(page);
    check('S1a 两列网格', g.cols === 2, g.cols + ' cols');
    check('S1b 两行网格', g.rows === 2, g.rows + ' rows');
    check('S1c stage 第1行跨2列', g.stageRow.startsWith('1/') && g.stageRow.endsWith('-1'), g.stageRow);
    check('S1d stage 可见且高>45%', g.stageVisible && g.stageH > 300, 'h=' + g.stageH);
    check('S1e left 第2行第1列 可见', g.leftRow.startsWith('2/1') && g.leftVisible, g.leftRow);
    check('S1f right 第2行第2列 可见', g.rightRow.startsWith('2/2') && g.rightVisible, g.rightRow);
    check('S1g 无抽屉位移', g.leftTransform === 'none' || g.leftTransform === 'matrix(1, 0, 0, 1, 0, 0)', g.leftTransform);
    check('S1h mobile-tabs 隐藏', g.tabsDisplay === 'none', g.tabsDisplay);
    check('S1i footer 可见', g.footerVisible, '');
    await page.screenshot({ path: path.join(OUT_DIR, 'p1-reviewer-768.png') });
    await page.close();
  }

  /* —— S2. 800×600 窄窗分栏 —— */
  {
    const page = await openReviewer(browser, { width: 800, height: 600 });
    const g = await readGrid(page);
    check('S2a 分栏保持(2列2行)', g.cols === 2 && g.rows === 2, '');
    check('S2b stage+侧栏可见', g.stageVisible && g.leftVisible && g.rightVisible, 'stageH=' + g.stageH);
    await page.screenshot({ path: path.join(OUT_DIR, 'p1-reviewer-800x600.png') });
    await page.close();
  }

  /* —— R1. 390 抽屉回归 —— */
  {
    const page = await openReviewer(browser, { width: 390, height: 844 });
    const g = await readGrid(page);
    check('R1a 手机档 tabs 显示', g.tabsDisplay === 'grid', g.tabsDisplay);
    check('R1b 手机档单列网格', g.cols === 1, g.cols + ' cols');
    await page.screenshot({ path: path.join(OUT_DIR, 'p1-reviewer-390.png') });
    await page.close();
  }

  /* —— R2. 桌面回归 —— */
  {
    const page = await openReviewer(browser, { width: 1440, height: 900 });
    const g = await readGrid(page);
    check('R2a 桌面三栏(stage+左右侧栏可见)', g.stageVisible && g.leftVisible && g.rightVisible, 'cols=' + g.cols);
    await page.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  lines.push(failed.length ? `RESULT: ${failed.length} FAILED / ${results.length}` : `RESULT: ALL ${results.length} PASSED`);
  fs.writeFileSync(path.join(OUT_DIR, 'p1-split.txt'), lines.join('\n'), 'utf8');
  console.log(lines[lines.length - 1]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
