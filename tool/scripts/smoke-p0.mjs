import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.SMOKE_BASE || 'http://localhost:5173';
const outDir = new URL('../output/playwright/', import.meta.url);
await mkdir(outDir, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, outDir));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

await page.goto(`${base}/reviewer-preview.html`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#model-title', { timeout: 30000 });
await page.waitForFunction(() => document.getElementById('model-title')?.textContent?.includes('1N4007'), null, { timeout: 30000 });
await page.waitForTimeout(800);

const snapshot = async () => page.evaluate(() => {
  const text = (id) => document.getElementById(id)?.textContent?.trim() || '';
  const classes = (id) => document.getElementById(id)?.className || '';
  const modelSeg = document.querySelector('#model-status button.is-on');
  const issueSeg = document.querySelector('#issue-status button.is-on');
  const hud = document.getElementById('hud-status');
  const issues = [...document.querySelectorAll('.issue')].map((el) => ({
    className: el.className,
    badge: el.querySelector('.issue-status-btn')?.textContent?.trim() || '',
    title: el.querySelector('b')?.textContent?.trim() || '',
  }));
  return {
    modelTitle: text('model-title'),
    hudHidden: hud?.classList.contains('hidden'),
    hudClass: hud?.className || '',
    hudIcon: hud?.querySelector('.hud-status-icon')?.textContent || '',
    hudText: hud?.querySelector('.hud-status-text')?.textContent || '',
    progress: document.getElementById('progress')?.textContent?.replace(/\s+/g, ' ') || '',
    progressTitle: document.getElementById('progress')?.title || '',
    modelReviewState: text('model-review-state'),
    modelReviewStateStatus: document.getElementById('model-review-state')?.dataset.status || '',
    modelSegOn: modelSeg?.dataset.status || '',
    issueSegOn: issueSeg?.dataset.status || '',
    noModelSelect: !document.getElementById('model-status')?.tagName?.toLowerCase?.() || document.getElementById('model-status')?.tagName,
    modelStatusTag: document.getElementById('model-status')?.tagName,
    issueStatusTag: document.getElementById('issue-status')?.tagName,
    issues,
    rowLabels: [...document.querySelectorAll('.status-mini-label')].map((el) => el.textContent.trim()),
  };
});

const before = await snapshot();
await page.screenshot({ path: shot('p0-initial.png'), fullPage: true });

// 改模型结论为通过
await page.click('#model-status button[data-status="pass"]');
await page.waitForTimeout(200);
const afterPass = await snapshot();
await page.screenshot({ path: shot('p0-pass.png'), fullPage: true });

// 打开问题状态菜单
const badge = page.locator('.issue-status-btn').first();
await badge.click();
await page.waitForTimeout(150);
const menuVisible = await page.locator('#issue-status-menu:not(.hidden)').count();
await page.screenshot({ path: shot('p0-issue-menu.png'), fullPage: true });
if (menuVisible) {
  await page.click('#issue-status-menu button[data-status="pass"]');
  await page.waitForTimeout(200);
}
const afterIssue = await snapshot();
await page.screenshot({ path: shot('p0-after-issue-status.png'), fullPage: true });

// 记录模型问题
await page.fill('#issue-text', '冒烟：新增模型级问题');
await page.click('#add-model');
await page.waitForTimeout(200);
const afterAdd = await snapshot();

const issueCountText = await page.locator('#issue-count').innerText();
console.log(JSON.stringify({
  before,
  afterPass,
  menuVisible,
  afterIssue,
  afterAdd: {
    issueCountText,
    issues: afterAdd.issues,
  },
  errors,
  pass: {
    hudRisk: before.hudClass.includes('risk') && before.hudText === '待改',
    progressThreeColor: before.progress.includes('通过') && before.progress.includes('待改') && before.progress.includes('阻断'),
    segmentedUsed: before.modelStatusTag === 'DIV' && before.issueStatusTag === 'DIV',
    passUpdatesHud: afterPass.hudClass.includes('pass') && afterPass.hudText === '通过',
    menuOpened: menuVisible > 0,
    noPageErrors: errors.length === 0,
  },
}, null, 2));

await browser.close();
