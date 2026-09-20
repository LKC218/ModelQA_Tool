/* P0 移动端作用域化回归探针（实施计划 V1.0 / T0.5）。
 *
 * 验证：
 *  A. 审核端 390×844：body.is-reviewer；mobile-tabs 可见；sidebar 初始隐藏、点 tab 可开；footer 隐藏
 *  B. 编辑端 800×600：body.is-editor；tool-shell min-width 1120 触发横滚；footer 可见；sidebar 流内可见
 *  C. 编辑端 1440×900：无横滚（桌面正常）
 *  D. 审核端 1440×900：sidebar 桌面正常可见
 *
 * 用法：
 *   set NODE_PATH=C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules
 *   node tool/scripts/smoke/probes/probe-mobile-scope.cjs
 */
const { chromium } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const EDITOR_URL = 'file:///G:/%E9%A1%B9%E7%9B%AE/%E6%A8%A1%E5%9E%8B%E5%AE%A1%E6%A0%B8%E5%B7%A5%E5%85%B7/tool/dist/index.html';
const REVIEWER_URL = 'file:///G:/%E9%A1%B9%E7%9B%AE/%E6%A8%A1%E5%9E%8B%E5%AE%A1%E6%A0%B8%E5%B7%A5%E5%85%B7/tool/dist/reviewer-preview.html';
const OUT_DIR = path.resolve(__dirname, '../../../output/playwright');
const RUNTIME_PATH = path.resolve(__dirname, '../../../src/generated/reviewer-runtime.js');

/* dist/reviewer-preview.html 是 dev-server 页（引用 /src/generated/reviewer-runtime.js），
   file:// 下 404；按 probe-e2e-dedup 配方 route 拦截 fulfill 本地 runtime。 */
async function openReviewer(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/src/generated/reviewer-runtime.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(RUNTIME_PATH, 'utf8') });
  });
  return page;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

  /* —— A. 审核端手机视口 —— */
  {
    const page = await openReviewer(browser, { width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(REVIEWER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.review-shell', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());

    const root = await page.evaluate(() => ({
      isReviewer: document.body.classList.contains('is-reviewer'),
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
      footerDisplay: getComputedStyle(document.querySelector('.review-shell .footer, footer.footer')).display,
      sidebarTransform: getComputedStyle(document.querySelector('.sidebar.left')).transform,
      sidebarBottom: getComputedStyle(document.querySelector('.sidebar.left')).bottom,
    }));
    check('A1 body.is-reviewer', root.isReviewer, JSON.stringify(root.isReviewer));
    check('A2 mobile-tabs 可见(grid)', root.tabsDisplay === 'grid', root.tabsDisplay);
    check('A3 footer 隐藏', root.footerDisplay === 'none', root.footerDisplay);
    check('A4 sidebar 初始隐藏(translateY)', /matrix\(1, 0, 0, 1, 0, (?!0\)$)/.test(root.sidebarTransform) || root.sidebarTransform.includes('matrix(1, 0, 0, 1, 0, 1'), root.sidebarTransform);
    check('A4b sidebar bottom 避开 tabs(56px)', root.sidebarBottom.startsWith('56px'), root.sidebarBottom);

    await page.click('.mobile-tabs [data-mobile-panel="left"]');
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => ({
      transform: getComputedStyle(document.querySelector('.sidebar.left')).transform,
      open: document.querySelector('.sidebar.left').classList.contains('is-open'),
    }));
    check('A5 点 tab 打开抽屉', opened.open && /matrix\(1, 0, 0, 1, 0, 0\)/.test(opened.transform), JSON.stringify(opened));
    await page.screenshot({ path: path.join(OUT_DIR, 'p0-reviewer-390-drawer.png') });
    check('A6 无页面错误', errors.length === 0, errors.join(' ; ') || 'none');
    await page.close();
  }

  /* —— B. 编辑端窄窗 —— */
  {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.tool-shell', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());

    const root = await page.evaluate(() => {
      const shell = document.querySelector('.tool-shell');
      const footer = document.querySelector('.tool-shell > .footer, body > .footer, .footer');
      const sidebar = document.querySelector('.sidebar.left');
      return {
        isEditor: document.body.classList.contains('is-editor'),
        shellMinWidth: getComputedStyle(shell).minWidth,
        bodyScrollW: document.body.scrollWidth,
        viewportW: window.innerWidth,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        footerVisible: footer ? footer.offsetHeight > 0 : null,
        footerDisplay: footer ? getComputedStyle(footer).display : 'missing',
        sidebarVisible: sidebar ? sidebar.offsetHeight > 0 : null,
        sidebarPosition: sidebar ? getComputedStyle(sidebar).position : 'missing',
        sidebarTransform: sidebar ? getComputedStyle(sidebar).transform : 'missing',
      };
    });
    check('B1 body.is-editor', root.isEditor, JSON.stringify(root.isEditor));
    check('B2 shell min-width 1120', root.shellMinWidth === '1120px', root.shellMinWidth);
    check('B3 横滚生效( scrollW≥1120 > 视口800 )', root.bodyScrollW >= 1120 && root.bodyScrollW > root.viewportW, `scroll=${root.bodyScrollW} viewport=${root.viewportW} overflowX=${root.bodyOverflowX}`);
    check('B4 footer 可见', root.footerVisible === true, root.footerDisplay);
    check('B5 sidebar 流内可见(position 非 fixed)', root.sidebarVisible === true && root.sidebarPosition !== 'fixed', `${root.sidebarPosition} h>0=${root.sidebarVisible}`);
    check('B6 sidebar 无隐藏位移', root.sidebarTransform === 'none' || root.sidebarTransform === 'matrix(1, 0, 0, 1, 0, 0)', root.sidebarTransform);
    await page.screenshot({ path: path.join(OUT_DIR, 'p0-editor-800.png') });
    check('B7 无页面错误', errors.length === 0, errors.join(' ; ') || 'none');
    await page.close();
  }

  /* —— C. 编辑端桌面无横滚 —— */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.tool-shell', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const root = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      viewportW: window.innerWidth,
      overflowX: getComputedStyle(document.body).overflowX,
    }));
    check('C1 桌面 1440 无横滚', root.scrollW <= root.viewportW, `scroll=${root.scrollW} viewport=${root.viewportW} overflowX=${root.overflowX}`);
    await page.close();
  }

  /* —— D. 审核端桌面正常 —— */
  {
    const page = await openReviewer(browser, { width: 1440, height: 900 });
    await page.goto(REVIEWER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.review-shell', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());
    const root = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar.left');
      const footer = document.querySelector('.review-shell .footer, footer.footer');
      return {
        sidebarVisible: sidebar.offsetHeight > 0,
        sidebarPosition: getComputedStyle(sidebar).position,
        footerVisible: footer.offsetHeight > 0,
      };
    });
    check('D1 审核端桌面 sidebar 可见', root.sidebarVisible, root.sidebarPosition);
    check('D2 审核端桌面 footer 可见', root.footerVisible, '');
    await page.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  lines.push(failed.length ? `RESULT: ${failed.length} FAILED / ${results.length}` : `RESULT: ALL ${results.length} PASSED`);
  fs.writeFileSync(path.join(OUT_DIR, 'p0-mobile-scope.txt'), lines.join('\n'), 'utf8');
  console.log(lines[lines.length - 1]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
