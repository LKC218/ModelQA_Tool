/* 引导流程不滚动 .stage（overflow:hidden）探针。
 *
 * 背景：ensureTargetVisible 原生 scrollIntoView 会把 overflow:hidden 的 .stage 当
 * 可程序滚动容器上滚内容，HUD(top:16px) 越过 .stage 顶边被裁切（"标签贴边"根因）。
 * 修复后只滚 overflowY auto/scroll 且真溢出的祖先。本探针走完整引导链，
 * 每步断言：.stage.scrollTop === 0、HUD 顶边不越过 .stage 顶边（未被裁）。
 *
 * 用法：
 *   node tool/scripts/smoke/probes/probe-onboarding-stage-scroll.cjs [url]
 *   url 默认 http://localhost:5173/reviewer-preview.html
 *
 * 依赖：playwright-core（隔离环境 NODE_PATH=C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules）
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.resolve(__dirname, '../../../output/probe-onboarding-stage-scroll');
const URL = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:5173/reviewer-preview.html';
const STORAGE_KEY = 'an_reviewer_onboarding_v2';
const MAX_STEPS = 16;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.addInitScript((key) => { try { localStorage.removeItem(key); } catch {} }, STORAGE_KEY);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

  // 引导自动打开（或点帮助入口打开）；等待卡片出现
  await page.waitForSelector('#onb-root.is-open [data-onb-card]', { timeout: 20000 });
  await page.waitForTimeout(400);

  const rows = [];
  let finished = false;

  for (let i = 0; i < MAX_STEPS; i += 1) {
    await page.waitForTimeout(350); // 等步骤动画/量测稳定（双 rAF + 渲染）
    const snapshot = await page.evaluate(() => {
      const stage = document.querySelector('.stage');
      const hud = document.querySelector('.viewer-hud');
      const root = document.getElementById('onb-root');
      const sr = stage ? stage.getBoundingClientRect() : null;
      const hr = hud ? hud.getBoundingClientRect() : null;
      return {
        badge: document.querySelector('[data-onb-badge]')?.textContent?.trim() || '',
        title: document.querySelector('[data-onb-title]')?.textContent?.trim() || '',
        onbOpen: !!root?.classList.contains('is-open'),
        stageScrollTop: stage ? stage.scrollTop : null,
        stageScrollLeft: stage ? stage.scrollLeft : null,
        stageTop: sr ? Math.round(sr.top) : null,
        hudTop: hr ? Math.round(hr.top) : null,
        hudVisible: !!(sr && hr && hr.bottom > sr.top && hr.top < sr.bottom),
        hudClipped: !!(sr && hr && hr.top < sr.top - 0.5), // HUD 顶边越过容器顶边 = 被裁
        nextText: document.querySelector('[data-onb-next]')?.textContent?.trim() || '',
      };
    });
    rows.push(snapshot);
    if (!snapshot.onbOpen) { finished = true; break; }
    await page.evaluate(() => document.querySelector('[data-onb-next]')?.click());
  }

  await page.waitForTimeout(400);
  const stillOpen = await page.evaluate(() => document.getElementById('onb-root')?.classList.contains('is-open') || false);
  if (!stillOpen) finished = true;

  const stepsObserved = rows.filter((r) => r.onbOpen);
  const checks = {
    onboardingOpened: stepsObserved.length > 0,
    onboardingFinished: finished,
    stageNeverScrolled: stepsObserved.every((r) => r.stageScrollTop === 0 && r.stageScrollLeft === 0),
    hudNeverClipped: stepsObserved.every((r) => r.hudClipped === false && r.hudVisible === true),
    viewportStepReached: stepsObserved.some((r) => /视口/.test(r.title)),
    noPageError: errors.length === 0,
  };
  const result = { url: URL, steps: rows, stepsObserved: stepsObserved.length, checks, errors, pass: Object.values(checks).every(Boolean) };

  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
  await browser.close();
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
