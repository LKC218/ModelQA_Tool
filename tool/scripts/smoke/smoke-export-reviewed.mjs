import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.SMOKE_BASE || 'http://localhost:5173';
const outDir = new URL('../../output/export-reviewed/', import.meta.url);
await mkdir(outDir, { recursive: true });
const out = (name) => fileURLToPath(new URL(name, outDir));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

await page.goto(`${base}/reviewer-preview.html`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('model-title')?.textContent?.includes('1N4007'), null, { timeout: 30000 });
await page.waitForTimeout(500);
// 每次启动均会弹出引导；冒烟需先收起遮罩再点控件
if (await page.locator('#onb-root.is-open').count()) {
  await page.evaluate(() => {
    document.getElementById('onb-root')?.classList.remove('is-open');
    document.getElementById('onb-root')?.setAttribute('hidden', '');
  });
}

const buttons = await page.evaluate(() => ({
  htmlDisabled: document.getElementById('export-html')?.disabled ?? null,
  jsonDisabled: document.getElementById('export')?.disabled ?? null,
  htmlTitle: document.getElementById('export-html')?.title || '',
  hasRuntimeSrc: typeof globalThis.__AN_REVIEWER_RUNTIME_SRC__ === 'string' && globalThis.__AN_REVIEWER_RUNTIME_SRC__.length > 1000,
  runtimeSrcLen: (globalThis.__AN_REVIEWER_RUNTIME_SRC__ || '').length,
  mode: window.__AN_REVIEW_PAYLOAD__?.mode ?? null,
}));

// 改模型结论 + 新增 Issue
await page.click('#model-status button[data-status="pass"]');
await page.waitForTimeout(150);
await page.fill('#issue-text', '冒烟：导出前新增的模型问题');
await page.click('#add-model');
await page.waitForTimeout(150);

const beforeExport = await page.evaluate(() => {
  const review = window.__AN_REVIEW_PAYLOAD__?.review || {};
  // 内存 state 不直接暴露；从 DOM 校验
  return {
    modelSeg: document.querySelector('#model-status button.is-on')?.dataset.status || '',
    issueCount: document.getElementById('issue-count')?.textContent?.trim() || '',
    htmlDisabled: document.getElementById('export-html')?.disabled,
    jsonDisabled: document.getElementById('export')?.disabled,
  };
});

// 拦截下载：导出已审 HTML
const htmlDownloadPromise = page.waitForEvent('download', { timeout: 120000 });
await page.click('#export-html');
const htmlDownload = await htmlDownloadPromise;
const htmlName = htmlDownload.suggestedFilename();
await htmlDownload.saveAs(out(htmlName));

// 再导出 JSON
const jsonDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.click('#export');
const jsonDownload = await jsonDownloadPromise;
const jsonName = jsonDownload.suggestedFilename();
await jsonDownload.saveAs(out(jsonName));

const footerAfter = await page.locator('#footer').innerText();

// 校验已审 HTML 结构（不读 outerHTML，只检查下载文件）
const { readFileSync, statSync } = await import('node:fs');
const htmlPath = out(htmlName);
const htmlText = readFileSync(htmlPath, 'utf8');
const checks = {
  hasDoctype: htmlText.startsWith('<!doctype html>'),
  hasPayload: htmlText.includes('window.__AN_REVIEW_PAYLOAD__='),
  hasRuntimeSrcGlobal: htmlText.includes('__AN_REVIEWER_RUNTIME_SRC__='),
  hasSharedCss: htmlText.includes('__AN_SHARED_CSS__='),
  hasHdr: htmlText.includes('__AN_HDR_SOURCE__='),
  hasReviewedTitle: htmlText.includes('已审'),
  hasIssueText: htmlText.includes('冒烟：导出前新增的模型问题'),
  hasPassStatus: htmlText.includes('"modelStatus":"pass"') || htmlText.includes('"modelStatus": "pass"'),
  noOuterHtmlMark: !htmlText.includes('outerHTML'),
  sizeMB: Math.round(statSync(htmlPath).size / 1024 / 1024 * 100) / 100,
};

const jsonText = readFileSync(out(jsonName), 'utf8');
const jsonData = JSON.parse(jsonText);
const jsonChecks = {
  hasByModel: !!jsonData.byModel,
  hasProjectId: !!jsonData.projectId,
  hasExportedAt: !!jsonData.exportedAt,
  hasPass: Object.values(jsonData.byModel || {}).some((r) => r.modelStatus === 'pass'),
  hasIssue: Object.values(jsonData.byModel || {}).some((r) => (r.issues || []).some((i) => i.issueText?.includes('冒烟'))),
};

// 重开已审 HTML，验证离线闭环（file://）
const reviewedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const reviewedErrors = [];
reviewedPage.on('pageerror', (err) => reviewedErrors.push(`pageerror: ${err.message}`));
await reviewedPage.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load', timeout: 60000 });
await reviewedPage.waitForFunction(() => document.getElementById('model-title')?.textContent?.includes('1N4007'), null, { timeout: 30000 });
await reviewedPage.waitForTimeout(800);
const reopened = await reviewedPage.evaluate(() => ({
  modelSeg: document.querySelector('#model-status button.is-on')?.dataset.status || '',
  issueCount: document.getElementById('issue-count')?.textContent?.trim() || '',
  title: document.title,
  hasRuntimeSrc: typeof globalThis.__AN_REVIEWER_RUNTIME_SRC__ === 'string' && globalThis.__AN_REVIEWER_RUNTIME_SRC__.length > 1000,
  htmlDisabled: document.getElementById('export-html')?.disabled,
}));
await reviewedPage.screenshot({ path: out('reopened-reviewed.png'), fullPage: true });
await reviewedPage.close();

const reviewedSource = readFileSync(fileURLToPath(new URL('../../src/reviewer/reviewer-implementation.js', import.meta.url)), 'utf8');
const reviewedSourceHasFolder = reviewedSource.includes("mode: 'folder'") && reviewedSource.includes('FOLDER_HTML_HINT');
const folderLogicNote = 'folder 禁用由 canExportReviewedHtml() 在 mode=folder 时返回 false 实现；loadDirectory 会写 mode:folder';

await page.screenshot({ path: out('after-export.png'), fullPage: true });

const result = {
  buttons,
  beforeExport,
  htmlName,
  jsonName,
  footerAfter,
  checks,
  jsonChecks,
  reopened,
  reviewedErrors,
  reviewedSourceHasFolder,
  errors,
  folderLogicNote,
  pass: !errors.length && !reviewedErrors.length && checks.hasDoctype && checks.hasPayload && checks.hasRuntimeSrcGlobal && checks.hasReviewedTitle && checks.hasIssueText && checks.hasPassStatus && jsonChecks.hasByModel && jsonChecks.hasPass && jsonChecks.hasIssue && buttons.hasRuntimeSrc && !buttons.htmlDisabled && !buttons.jsonDisabled && reopened.hasRuntimeSrc && reopened.modelSeg === 'pass' && reviewedSourceHasFolder,
};

await writeFile(out('result.json'), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.pass ? 0 : 1);
