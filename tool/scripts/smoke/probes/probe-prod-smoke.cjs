/* P5 线上冒烟：生产站新产物特征核验（绕 index.html 缓存 ?v= 时间戳）。 */
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');
const path = require('node:path');
const fs = require('node:fs');

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const SITE = 'https://3d.propanda.cn';
const OUT_DIR = path.resolve(__dirname, '../../../output/playwright');
/* 期望版本跟随 package.json，避免每次 bump 都要改脚本 */
const EXPECT_VERSION = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')).version;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
  const stamp = Date.now();

  /* version.json */
  const resp = await browser.newPage();
  const vj = await resp.goto(`${SITE}/version.json?nocache=${stamp}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const vtext = await vj.text();
  let version = '';
  try { version = JSON.parse(vtext).version; } catch {}
  check('S1 version.json 在线', vj.ok() && version === EXPECT_VERSION, `http=${vj.status()} version=${version} (expect ${EXPECT_VERSION})`);
  await resp.close();

  /* 编辑端线上（手机视口 390×844） */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(`${SITE}/?v=${stamp}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.tool-shell', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.getElementById('onb-root')?.remove());
    const s = await page.evaluate(() => ({
      viewportCover: document.querySelector('meta[name=viewport]').content.includes('viewport-fit=cover'),
      isApp: document.body.classList.contains('is-app') && document.body.classList.contains('is-editor'),
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
      tabCount: document.querySelectorAll('.mobile-tabs [data-mobile-panel]').length,
      footerDisplay: getComputedStyle(document.querySelector('.footer')).display,
    }));
    check('S2 线上 viewport-fit=cover', s.viewportCover, '');
    check('S3 线上 is-app 根类 + 移动 tabs', s.isApp && s.tabsDisplay === 'grid' && s.tabCount === 2, JSON.stringify(s));
    check('S4 线上编辑端 footer 隐藏(移动形态)', s.footerDisplay === 'none', s.footerDisplay);
    await page.click('.mobile-tabs [data-mobile-panel="left"]');
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => document.querySelector('.sidebar.left').classList.contains('is-open'));
    check('S5 线上抽屉可开', open, String(open));
    check('S6 无页面错误', errors.length === 0, errors.join(' ; ') || 'none');
    await page.screenshot({ path: path.join(OUT_DIR, 'p5-prod-editor-390.png') });
    await page.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  lines.push(failed.length ? `RESULT: ${failed.length} FAILED / ${results.length}` : `RESULT: ALL ${results.length} PASSED`);
  fs.writeFileSync(path.join(OUT_DIR, 'p5-prod-smoke.txt'), lines.join('\n'), 'utf8');
  console.log(lines[lines.length - 1]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
