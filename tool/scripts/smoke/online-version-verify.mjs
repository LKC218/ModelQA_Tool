// 线上验证：生产站版本检测功能可用
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('G:\\项目\\模型审核工具\\node_modules\\@playwright\\cli\\node_modules\\playwright-core');

const lines = [];
const report = (ok, name, detail = '') => {
  const row = `${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`;
  lines.push(row);
  console.log(row);
};

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'], executablePath: 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  const res = await page.request.get('https://3d.propanda.cn/version.json?t=' + Date.now());
  const body = await res.json().catch(() => null);
  report(res.ok() && body?.version === '1.2.0', '线上 version.json 可达且版本正确', JSON.stringify(body));

  await page.goto('https://3d.propanda.cn/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#app-version', { timeout: 30000 });
  const dom = await page.evaluate(() => ({
    ver: document.getElementById('app-version')?.textContent || '',
    btn: !!document.getElementById('version-check'),
    bannerCls: document.getElementById('update-banner')?.className || '',
  }));
  report(dom.ver === 'v1.2.0', '线上 footer 版本号正确', dom.ver);
  report(dom.btn, '线上 ⟳ 按钮存在');
  report(dom.bannerCls.includes('hidden'), '线上提示条初始隐藏（版本一致）', dom.bannerCls);
  await page.waitForTimeout(3800);
  const bannerAfter = await page.evaluate(() => document.getElementById('update-banner')?.className || '');
  report(bannerAfter.includes('hidden'), '线上静默检测后不弹提示（版本一致）', bannerAfter);
} finally {
  await browser.close();
  await writeFile('G:\\项目\\模型审核工具\\tool\\output\\playwright\\online-verify-result.txt', lines.join('\n'), 'utf8');
  const failed = lines.filter((l) => l.startsWith('FAIL')).length;
  console.log(failed === 0 ? 'ONLINE ALL PASS' : `ONLINE FAILED: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}
