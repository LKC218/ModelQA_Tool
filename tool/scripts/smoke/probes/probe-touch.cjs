/* P4 3D 触摸增强回归探针（实施计划 V1.0 / T4.x）——审核端 preview（自带样例模型）。
 *
 * 验证（1280×800 桌面视口）：
 *  V1. controls 暴露且 fit 后有缩放护栏（minDistance/maxDistance > 0）
 *  V2. 滚轮拉远 24 次 → 相机距离被 maxDistance 护栏截住（有限距离，不再发散）
 *  V3. 双击 canvas → 相机复位（距离回到 fit 基准 ±1%）
 *  V4. 无页面错误
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

const dist = (page) => page.evaluate(() => {
  const v = document.getElementById('canvas').__productViewer;
  return { d: v.camera.position.distanceTo(v.controls.target), min: v.controls.minDistance, max: v.controls.maxDistance };
});

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.route('**/src/generated/reviewer-runtime.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(RUNTIME_PATH, 'utf8') });
  });
  await page.goto(REVIEWER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.getElementById('onb-root')?.remove());

  const s0 = await dist(page);
  check('V1a controls 暴露', !!s0 && isFinite(s0.d), JSON.stringify(s0));
  check('V1b fit 后缩放护栏生效', s0.min > 0 && s0.max > s0.min, `min=${s0.min.toFixed(3)} max=${s0.max.toFixed(3)}`);

  for (let i = 0; i < 24; i++) await page.mouse.move(640, 400), await page.mouse.wheel(0, 600);
  await page.waitForTimeout(900);
  const s1 = await dist(page);
  check('V2 拉远被 maxDistance 截住', s1.d <= s1.max * 1.01, `dist=${s1.d.toFixed(3)} max=${s1.max.toFixed(3)}`);

  await page.mouse.dblclick(640, 400);
  await page.waitForTimeout(1200);
  const s2 = await dist(page);
  check('V3 双击复位相机', Math.abs(s2.d - s0.d) < s0.d * 0.02, `after=${s2.d.toFixed(3)} base=${s0.d.toFixed(3)}`);
  check('V4 无页面错误', errors.length === 0, errors.join(' ; ') || 'none');

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  lines.push(failed.length ? `RESULT: ${failed.length} FAILED / ${results.length}` : `RESULT: ALL ${results.length} PASSED`);
  fs.writeFileSync(path.join(OUT_DIR, 'p4-touch.txt'), lines.join('\n'), 'utf8');
  console.log(lines[lines.length - 1]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
