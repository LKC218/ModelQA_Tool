/* 审核端页签文案探针：验证静态 <title>（浏览器页签）与页内 #title 两条独立通路。
 *
 * 背景：页签由静态 <title> 恒定决定、运行时从不修改；页内 h1 走 displayTitle → name → 兜底。
 * 详见 docs/实施方案/审核端页签命名-实施计划-V1.0.md
 *
 * 用法：
 *   node tool/scripts/smoke/probes/probe-page-title.cjs [url] [--blank-name]
 *   url 默认 http://localhost:5173/reviewer-preview.html
 *   --blank-name  拦截 payload 赋值并清空 displayTitle/name，用于验证页内兜底文案
 *
 * 依赖：playwright-core（隔离环境 NODE_PATH=C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules）
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.resolve(__dirname, '../../../output/probe-page-title');
const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith('http')) || 'http://localhost:5173/reviewer-preview.html';
const BLANK_NAME = args.includes('--blank-name');

const EXPECT = {
  untitledH1: '3D 模型审核',
  reviewedTitle: '3D 模型审核报告',
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  if (BLANK_NAME) {
    await page.addInitScript(() => {
      let value;
      Object.defineProperty(window, '__AN_REVIEW_PAYLOAD__', {
        configurable: true,
        get() { return value; },
        set(v) { if (v && v.project) { v.project.displayTitle = ''; v.project.name = ''; } value = v; },
      });
    });
  }

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#title', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const before = {
    documentTitle: await page.title(),
    h1Title: await page.locator('#title').innerText(),
  };

  await page.evaluate(() => document.getElementById('onb-root')?.remove());
  await page.waitForTimeout(300);

  let exported = { skipped: true };
  let reopened = { skipped: true };
  try {
    await page.evaluate(() => document.getElementById('export-more-btn').click());
    await page.waitForFunction(() => {
      const menu = document.getElementById('export-menu');
      return menu && !menu.classList.contains('hidden');
    }, null, { timeout: 8000 });

    const dl = page.waitForEvent('download', { timeout: 120000 });
    await page.evaluate(() => document.getElementById('export-html').click());
    const download = await dl;
    const name = download.suggestedFilename();
    const save = path.join(OUT_DIR, name.replace(/[\\/:*?"<>|]/g, '_'));
    await download.saveAs(save);

    const html = fs.readFileSync(save, 'utf8');
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    exported = {
      name,
      bytes: html.length,
      staticTitle: titleMatch ? titleMatch[1] : null,
      hasOldTitle: html.includes('离线模型审核'),
      pass: !!titleMatch && titleMatch[1] === EXPECT.reviewedTitle,
    };

    const reviewed = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    reviewed.on('pageerror', (e) => errors.push('reviewed pageerror: ' + e.message));
    await reviewed.goto('file:///' + save.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 60000 });
    await reviewed.waitForSelector('#title', { timeout: 30000 });
    await reviewed.waitForTimeout(1200);
    reopened = {
      documentTitle: await reviewed.title(),
      h1Title: await reviewed.locator('#title').innerText(),
    };
    await reviewed.close();
  } catch (error) {
    errors.push('export: ' + String((error && error.message) || error));
  }

  const checks = {
    blankNameRequested: BLANK_NAME,
    h1FallbackOk: BLANK_NAME ? before.h1Title === EXPECT.untitledH1 : true,
    reviewedStaticTitleOk: exported.pass === true,
    reviewedDocTitleOk: reopened.documentTitle === EXPECT.reviewedTitle,
    noOldTitleInArtifact: exported.hasOldTitle === false,
    noPageError: errors.length === 0,
  };
  const result = { url: URL, before, exported, reopened, checks, errors, pass: Object.values(checks).every(Boolean) };

  const outFile = path.join(OUT_DIR, 'result.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(result.pass ? 0 : 1);
})();
