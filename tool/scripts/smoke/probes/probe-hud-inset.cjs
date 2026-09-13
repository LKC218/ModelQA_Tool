/* 视口左上角 HUD 内缩 token（--hud-inset）双端一致性探针。
 *
 * 背景：方案 A 将 .viewer-hud 的 top/left 从字面量改为共享 token --hud-inset，
 * 断点 16 → 12(≤1079) → 10(≤900) → 8(≤400) 全部经变量覆盖，双端单一来源。
 * 验证：开发端（dist 构建产物）与审核端（dev preview 页，含 .review-shell 覆盖共存）
 * 在 4 档视口宽度下 computed top/left 均符合期望值。
 *
 * 用法：
 *   node tool/scripts/smoke/probes/probe-hud-inset.cjs
 *
 * 依赖：playwright-core（隔离环境 NODE_PATH=C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules）
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.resolve(__dirname, '../../../output/probe-hud-inset');

const WIDTHS = [
  { w: 1440, h: 900, expect: '16px' },
  { w: 1000, h: 800, expect: '12px' },
  { w: 800, h: 700, expect: '10px' },
  { w: 380, h: 700, expect: '8px' },
];

const TARGETS = {
  editor: 'file:///G:/%E9%A1%B9%E7%9B%AE/%E6%A8%A1%E5%9E%8B%E5%AE%A1%E6%A0%B8%E5%B7%A5%E5%85%B7/tool/dist/index.html',
  reviewer: 'http://localhost:5173/reviewer-preview.html',
};

async function probePage(browser, name, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errorsOf[name].push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.viewer-hud', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('onb-root')?.remove());

  const rows = [];
  for (const { w, h, expect } of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const style = await page.evaluate(() => {
      const el = document.querySelector('.viewer-hud');
      const cs = getComputedStyle(el);
      return {
        top: cs.top,
        left: cs.left,
        tokenUsed: cs.getPropertyValue('--hud-inset').trim(),
        inReviewShell: !!el.closest('.review-shell'),
        text: (el.textContent || '').trim().slice(0, 40),
      };
    });
    rows.push({
      width: w,
      expect,
      top: style.top,
      left: style.left,
      token: style.tokenUsed,
      inReviewShell: style.inReviewShell,
      text: style.text,
      pass: style.top === expect && style.left === expect,
    });
  }
  await page.close();
  return rows;
}

const errorsOf = { editor: [], reviewer: [] };

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = {};
  for (const [name, url] of Object.entries(TARGETS)) {
    try {
      results[name] = { url, rows: await probePage(browser, name, url) };
    } catch (error) {
      results[name] = { url, fatal: String((error && error.message) || error) };
      errorsOf[name].push('fatal: ' + String((error && error.message) || error));
    }
  }
  await browser.close();

  const allRowsPass = Object.values(results).every(
    (r) => r.rows && r.rows.every((row) => row.pass)
  );
  const checks = {
    allRowsPass,
    editorProbed: !results.editor.fatal,
    reviewerProbed: !results.reviewer.fatal,
    reviewerInReviewShell:
      results.reviewer.rows && results.reviewer.rows.every((row) => row.inReviewShell),
    noPageError: errorsOf.editor.length === 0 && errorsOf.reviewer.length === 0,
  };
  const result = { results, errors: errorsOf, checks, pass: Object.values(checks).every(Boolean) };

  const outFile = path.join(OUT_DIR, 'result.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  process.exit(result.pass ? 0 : 1);
})().catch((e) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'result.json'),
    JSON.stringify({ fatal: String((e && e.message) || e), pass: false }, null, 2),
    'utf8'
  );
  process.exit(1);
});
