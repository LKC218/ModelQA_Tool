/* 切换模型时是否残留旧模型：逐步点击左侧模型卡，dump 场景根对象与资产请求累计数。
   Usage: TARGET=<url> OUT=<outdir> STEPS=3 node probe-model-switch.cjs */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const TARGET = process.env.TARGET;
const OUT = process.env.OUT || 'G:/项目/模型审核工具/tool/output/playwright';
const STEPS = Number(process.env.STEPS || 3);

if (!TARGET) { console.error('missing TARGET'); process.exit(1); }

(async () => {
  const report = { target: TARGET, steps: [], errors: [] };
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  let assetHits = 0;
  page.on('response', (r) => { if (/reviews\/assets\//.test(r.url())) assetHits++; });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 200)); });

  const dumpScene = () => page.evaluate(() => {
    const c = document.querySelector('canvas');
    const v = c && c.__productViewer;
    if (!v || !v.scene) return { error: 'no viewer' };
    const kids = [];
    v.scene.children.forEach((n) => {
      const t = n.type || '';
      if (/Light$/.test(t)) return;
      let meshes = 0; n.traverse((x) => { if (x.isMesh) meshes++; });
      kids.push({ type: t, name: n.name || '', meshes });
    });
    return {
      roots: kids,
      modelRoots: kids.filter((k) => k.meshes > 0).length,
      title: (document.getElementById('model-title') || {}).textContent || '',
      activeCard: (document.querySelector('.model-item.is-active, .model-item[aria-current]') || {}).textContent || '',
    };
  });

  const snap = async (label) => {
    const s = await dumpScene();
    report.steps.push({ label, assetHits, ...s });
    await page.screenshot({ path: `${OUT}/switch-${label}.png` });
    return s;
  };

  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());
  await page.waitForTimeout(500);
  await snap('0-initial');

  const cards = await page.evaluate(() => {
    const list = document.querySelectorAll('.model-item-main');
    return Array.from(list).map((el, i) => ({ i, text: (el.textContent || '').trim().slice(0, 30) }));
  });
  report.cards = cards;

  for (let step = 1; step <= STEPS; step++) {
    const ok = await page.evaluate((idx) => {
      const list = document.querySelectorAll('.model-item-main');
      if (!list[idx]) return false;
      list[idx].click();
      return true;
    }, step);
    if (!ok) { report.steps.push({ label: `${step}-missing` }); break; }
    await page.waitForTimeout(6000);
    await snap(`${step}-after-click-${step}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + '/model-switch-report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    cards: cards.length,
    steps: report.steps.map((s) => ({ label: s.label, assetHits: s.assetHits, modelRoots: s.modelRoots, roots: (s.roots || []).map((r) => `${r.name || r.type}:${r.meshes}`) })),
    errors: report.errors.slice(0, 3),
  }, null, 2));
  await browser.close();
})();
