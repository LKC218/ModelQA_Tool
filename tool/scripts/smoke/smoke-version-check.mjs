// 版本检测功能 smoke：⟳ 按钮 + 顶栏提示条 + 强制刷新链路
// 前置：http://127.0.0.1:8471 已服务 tool/dist；脚本自身维护 dist/version.json 的写与清
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('G:\\项目\\模型审核工具\\node_modules\\@playwright\\cli\\node_modules\\playwright-core');
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:8471';
const distDir = fileURLToPath(new URL('../../dist/', import.meta.url));
const resultPath = fileURLToPath(new URL('../../output/playwright/version-check-result.txt', import.meta.url));

const lines = [];
const report = (ok, name, detail = '') => {
  const row = `${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`;
  lines.push(row);
  console.log(row);
};

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'], executablePath: 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
page.on('dialog', (dialog) => {
  lines.push(`DIALOG | ${dialog.type()} | ${dialog.message().replace(/\n/g, ' ')}`);
  dialog.accept();
});

try {
  // Phase 1: 无 version.json —— DOM 存在、静默检测不报错、提示条不出现
  await unlink(`${distDir}version.json`).catch(() => {});
  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#app-version', { timeout: 30000 });
  const dom = await page.evaluate(() => ({
    ver: document.getElementById('app-version')?.textContent || '',
    btn: !!document.getElementById('version-check'),
    bannerCls: document.getElementById('update-banner')?.className || '',
  }));
  report(dom.ver === 'v1.2.0', 'footer 版本号渲染 v1.2.0', dom.ver);
  report(dom.btn, '⟳ 检测按钮存在');
  report(dom.bannerCls.includes('hidden'), '提示条初始隐藏', dom.bannerCls);
  await page.waitForTimeout(3800);
  const dom2 = await page.evaluate(() => document.getElementById('update-banner')?.className || '');
  report(dom2.includes('hidden'), '无 version.json 时静默检测不弹提示', dom2);
  const fatalErrors = pageErrors.filter((e) => !e.includes('Failed to fetch') && !e.includes('404'));
  report(fatalErrors.length === 0, '无 JS 运行时错误', fatalErrors.join(' ; '));

  // Phase 2: 线上版本 9.9.9 —— 3.5s 后提示条出现
  await writeFile(`${distDir}version.json`, JSON.stringify({ version: '9.9.9', buildTime: 'test' }), 'utf8');
  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#app-version', { timeout: 30000 });
  await page.waitForTimeout(3800);
  const bannerShown = await page.evaluate(() => ({
    cls: document.getElementById('update-banner')?.className || '',
    text: document.getElementById('update-banner')?.textContent || '',
  }));
  report(!bannerShown.cls.includes('hidden'), '静默检测到新版本后提示条出现', bannerShown.cls);
  report(bannerShown.text.includes('检测到新版本'), '提示条文案正确', bannerShown.text);

  // Phase 3: 点击提示条 → 强制刷新带 ?v=
  await page.click('#update-banner');
  await page.waitForTimeout(1500);
  const urlAfterBanner = page.url();
  report(/[?&]v=\d+/.test(urlAfterBanner), '点击提示条触发 location.replace 带 ?v=', urlAfterBanner);

  // Phase 4: ⟳ 按钮 interactive —— confirm 弹窗出现并接受 → 再次强制刷新
  await page.waitForSelector('#version-check', { timeout: 30000 });
  const dialogCountBefore = lines.length;
  await page.click('#version-check');
  await page.waitForTimeout(1500);
  const dialogs = lines.slice(dialogCountBefore).filter((l) => l.startsWith('DIALOG'));
  report(dialogs.length === 1 && dialogs[0].includes('9.9.9'), '⟳ 点击弹出确认框且含新版本号', dialogs.join(' ; ') || '无弹窗');
  report(/[?&]v=\d+/.test(page.url()), '确认后强制刷新', page.url());

  // Phase 5: 版本一致 —— ⟳ 点击无弹窗，status 提示「已是最新版本」
  await writeFile(`${distDir}version.json`, JSON.stringify({ version: '1.2.0', buildTime: 'test' }), 'utf8');
  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#version-check', { timeout: 30000 });
  await page.waitForTimeout(3800);
  const sameVerBanner = await page.evaluate(() => document.getElementById('update-banner')?.className || '');
  report(sameVerBanner.includes('hidden'), '版本一致时提示条不出现', sameVerBanner);
  const dialogCountBefore2 = lines.length;
  await page.click('#version-check');
  await page.waitForTimeout(800);
  const statusText = await page.evaluate(() => document.getElementById('status')?.textContent || '');
  report(statusText.includes('已是最新版本'), '版本一致时 status 提示已是最新', statusText);
  const dialogs2 = lines.slice(dialogCountBefore2).filter((l) => l.startsWith('DIALOG'));
  report(dialogs2.length === 0, '版本一致时不弹确认框', dialogs2.join(' ; ') || '无弹窗');
} finally {
  await unlink(`${distDir}version.json`).catch(() => {});
  await browser.close();
  lines.push(pageErrors.length ? `PAGE_ERRORS | ${pageErrors.join(' ; ')}` : 'PAGE_ERRORS | none');
  await writeFile(resultPath, lines.join('\n'), 'utf8');
  const failed = lines.filter((l) => l.startsWith('FAIL')).length;
  console.log(failed === 0 ? 'ALL PASS' : `FAILED: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}
