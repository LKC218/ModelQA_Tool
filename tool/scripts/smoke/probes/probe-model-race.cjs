/* 竞态复现：在首个模型加载未完成时触发第二次加载（连点模型卡 / 点课程卡后立刻点模型），
   检查场景内是否同时残留两个模型根对象。
   Usage: TARGET=<url> OUT=<outdir> GAP=200 node probe-model-race.cjs */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const TARGET = process.env.TARGET;
const OUT = process.env.OUT || 'G:/项目/模型审核工具/tool/output/playwright';
const GAP = Number(process.env.GAP || 200);

if (!TARGET) { console.error('missing TARGET'); process.exit(1); }

(async () => {
  const report = { target: TARGET, gap: GAP, steps: [], assets: [], errors: [] };
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  page.on('response', (r) => { if (/reviews\/assets\//.test(r.url())) report.assets.push({ url: r.url().split('/').pop().slice(0, 12), status: r.status() }); });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 200)); });

  const dumpScene = () => page.evaluate(() => {
    const c = document.querySelector('canvas');
    const v = c && c.__productViewer;
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
      nodes: (document.getElementById('nodes') || {}).textContent || '',
    };
  });

  const snap = async (label) => {
    const s = await dumpScene();
    report.steps.push({ label, ...s });
    await page.screenshot({ path: `${OUT}/race-${label}.png` });
    return s;
  };

  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());
  await page.waitForTimeout(300);
  await snap('0-baseline');

  /* A. 连点两张模型卡，间隔 GAP —— 第一次加载尚未完成 */
  await page.evaluate((gap) => {
    const list = document.querySelectorAll('.model-item-main');
    list[1] && list[1].click();
    setTimeout(() => { const l2 = document.querySelectorAll('.model-item-main'); l2[3] && l2[3].click(); }, gap);
  }, GAP);
  await page.waitForTimeout(9000);
  await snap(`A-rapid-two-cards-gap${GAP}`);

  /* B. 等加载稳定后，再点另一张卡，确认能否自愈 */
  await page.evaluate(() => { const l = document.querySelectorAll('.model-item-main'); l[0] && l[0].click(); });
  await page.waitForTimeout(9000);
  await snap('B-after-settle-click');

  fs.writeFileSync(OUT + '/model-race-report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    steps: report.steps.map((s) => ({ label: s.label, modelRoots: s.modelRoots, title: s.title, nodes: s.nodes, roots: (s.roots || []).map((r) => `${r.name || r.type}:${r.meshes}`) })),
    assets: report.assets.length,
    errors: report.errors.slice(0, 3),
  }, null, 2));
  await browser.close();
})();
