/* P3 编辑端 ≤600 移动形态回归探针（实施计划 V1.0 / T3.x）。
 *
 * 验证：
 *  E1. 390×844：mobile-tabs 显示；footer 隐藏；sidebar 初始隐藏（抽屉）；无横滚
 *  E2. 点「模型」→ 左抽屉开；点「信息」→ 互斥切换（right 开 left 关）
 *  E3. 800×601–900：编辑端仍为桌面横滚（min-width 1120、footer 可见、tabs 隐藏）
 *  E4. 审核端 390 回归：peek 仍工作（is-reviewer is-app 双类共存）
 */
const { chromium } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const EDITOR_URL = 'file:///G:/%E9%A1%B9%E7%9B%AE/%E6%A8%A1%E5%9E%8B%E5%AE%A1%E6%A0%B8%E5%B7%A5%E5%85%B7/tool/dist/index.html';
const REVIEWER_URL = 'file:///G:/%E9%A1%B9%E7%9B%AE/%E6%A8%A1%E5%9E%8B%E5%AE%A1%E6%A0%B8%E5%B7%A5%E5%85%B7/tool/dist/reviewer-preview.html';
const RUNTIME_PATH = path.resolve(__dirname, '../../../src/generated/reviewer-runtime.js');
const OUT_DIR = path.resolve(__dirname, '../../../output/playwright');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

  /* —— E1/E2. 编辑端 390 移动形态 —— */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.tool-shell', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());

    const s = await page.evaluate(() => ({
      isApp: document.body.classList.contains('is-app') && document.body.classList.contains('is-editor'),
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
      tabCount: document.querySelectorAll('.mobile-tabs [data-mobile-panel]').length,
      footerDisplay: getComputedStyle(document.querySelector('.tool-shell .footer, .footer')).display,
      leftTransform: getComputedStyle(document.querySelector('.sidebar.left')).transform,
      scrollW: document.body.scrollWidth,
      viewportW: window.innerWidth,
      shellMinWidth: getComputedStyle(document.querySelector('.tool-shell')).minWidth,
    }));
    check('E1a 双根类 is-editor+is-app', s.isApp, '');
    check('E1b tabs 显示且 2 格', s.tabsDisplay === 'grid' && s.tabCount === 2, `${s.tabsDisplay} n=${s.tabCount}`);
    check('E1c footer 隐藏', s.footerDisplay === 'none', s.footerDisplay);
    check('E1d sidebar 初始隐藏', /matrix\(1, 0, 0, 1, 0, [1-9]/.test(s.leftTransform) || s.leftTransform.includes('matrix(1, 0, 0, 1, 0, 1'), s.leftTransform);
    check('E1e 无横滚(无 min-width)', s.scrollW <= s.viewportW && s.shellMinWidth !== '1120px', `scroll=${s.scrollW} minW=${s.shellMinWidth}`);

    await page.click('.mobile-tabs [data-mobile-panel="left"]');
    await page.waitForTimeout(400);
    let st = await page.evaluate(() => ({
      left: document.querySelector('.sidebar.left').classList.contains('is-open'),
      right: document.querySelector('.sidebar.right').classList.contains('is-open'),
    }));
    check('E2a 点「模型」开左抽屉', st.left && !st.right, JSON.stringify(st));
    await page.screenshot({ path: path.join(OUT_DIR, 'p3-editor-390-drawer.png') });

    await page.click('.mobile-tabs [data-mobile-panel="right"]');
    await page.waitForTimeout(400);
    st = await page.evaluate(() => ({
      left: document.querySelector('.sidebar.left').classList.contains('is-open'),
      right: document.querySelector('.sidebar.right').classList.contains('is-open'),
    }));
    check('E2b 点「信息」互斥切换', st.right && !st.left, JSON.stringify(st));
    check('E2c 无页面错误', errors.length === 0, errors.join(' ; ') || 'none');
    await page.close();
  }

  /* —— E3. 编辑端 800×600 窄窗保持桌面横滚 —— */
  {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.tool-shell', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());
    const s = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      shellMinWidth: getComputedStyle(document.querySelector('.tool-shell')).minWidth,
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
      footerVisible: document.querySelector('.footer').offsetHeight > 0,
    }));
    check('E3a 窄窗横滚保持(1120)', s.scrollW >= 1120 && s.shellMinWidth === '1120px', `scroll=${s.scrollW}`);
    check('E3b 窄窗 tabs 隐藏 + footer 可见', s.tabsDisplay === 'none' && s.footerVisible, `${s.tabsDisplay}`);
    await page.close();
  }

  /* —— E4. 审核端 390 回归（peek + is-reviewer/is-app 共存） —— */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/src/generated/reviewer-runtime.js', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(RUNTIME_PATH, 'utf8') });
    });
    await page.goto(REVIEWER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.review-shell', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());
    const s = await page.evaluate(() => ({
      peekHidden: document.getElementById('sheet-peek').classList.contains('hidden'),
      peekTitle: document.getElementById('sheet-peek-title').textContent,
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
    }));
    check('E4 审核端 peek 回归', !s.peekHidden && s.peekTitle.includes('1N4007') && s.tabsDisplay === 'grid', JSON.stringify(s));
    await page.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  lines.push(failed.length ? `RESULT: ${failed.length} FAILED / ${results.length}` : `RESULT: ALL ${results.length} PASSED`);
  fs.writeFileSync(path.join(OUT_DIR, 'p3-editor-mobile.txt'), lines.join('\n'), 'utf8');
  console.log(lines[lines.length - 1]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
