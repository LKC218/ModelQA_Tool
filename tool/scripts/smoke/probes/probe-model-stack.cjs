/* 判定审核端"两个模型同屏堆叠"：统计模型资产请求次数、场景内 gltf 根对象、payload 形态。
   Usage: TARGET=<url|file://...> OUT=<outdir> node probe-model-stack.cjs
   证据链：assets 请求次数 = loadModel 实际执行次数；scene.children 里非灯光对象 = 同屏模型根数。 */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const TARGET = process.env.TARGET;
const OUT = process.env.OUT || 'G:/项目/模型审核工具/tool/output/playwright';

if (!TARGET) { console.error('missing TARGET'); process.exit(1); }

(async () => {
  const report = { target: TARGET, assets: [], fetchCalls: [], scene: null, payload: null, errors: [] };
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.addInitScript(() => {
    window.__ASSET_LOG__ = [];
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
        window.__ASSET_LOG__.push({ url: String(url), stack: String(new Error().stack || '').split('\n').slice(1, 8).join(' | ') });
      } catch { /* ignore */ }
      return origFetch.apply(this, args);
    };
  });

  page.on('pageerror', (e) => report.errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 240)); });
  page.on('response', async (r) => {
    const u = r.url();
    if (/assets|\.glb/i.test(u)) {
      const h = r.headers();
      report.assets.push({ url: u, status: r.status(), ct: h['content-type'] || '', len: h['content-length'] || '' });
    }
  });

  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    report.errors.push('goto: ' + String(e).slice(0, 240));
  }
  await page.waitForTimeout(10000);

  report.scene = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const v = c && c.__productViewer;
    if (!v || !v.scene) return { error: 'viewer not exposed' };
    const kids = [];
    v.scene.children.forEach((n) => {
      const t = n.type || '';
      if (/Light$/.test(t) || t === 'Scene' || t === 'Group' && !n.children.length) return;
      let meshes = 0; n.traverse((x) => { if (x.isMesh) meshes++; });
      kids.push({ type: t, name: n.name || '', meshes, children: n.children.length });
    });
    return { count: kids.length, children: kids };
  });

  report.payload = await page.evaluate(() => {
    const p = window.__AN_REVIEW_PAYLOAD__;
    if (!p) return null;
    return {
      schemaVersion: p.schemaVersion, mode: p.mode,
      models: (p.project && p.project.models ? p.project.models : []).map((m) => ({
        id: m.modelId, dataKey: m.dataKey, fileRef: m.fileRef,
        name: m.displayName || m.fileName, hasChunks: Array.isArray(m.base64Chunks),
      })),
      pool: (p.modelData || []).map((e) => ({ key: e.key, fileRef: e.fileRef, url: e.url, size: e.size, hasChunks: Array.isArray(e.base64Chunks) })),
    };
  });

  report.fetchCalls = await page.evaluate(() => (window.__ASSET_LOG__ || []).filter((r) => /assets|\.glb/i.test(r.url || '')));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + '/model-stack-report.json', JSON.stringify(report, null, 2), 'utf8');
  await page.screenshot({ path: OUT + '/model-stack.png' });
  console.log(JSON.stringify({
    assets: report.assets.length,
    sceneCount: report.scene && report.scene.count,
    scene: (report.scene && report.scene.children || []).map((k) => `${k.name || k.type}:${k.meshes}`),
    models: report.payload && report.payload.models && report.payload.models.length,
    errors: report.errors.slice(0, 3),
  }, null, 2));
  await browser.close();
})();
