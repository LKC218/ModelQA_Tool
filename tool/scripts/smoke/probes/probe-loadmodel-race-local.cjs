/* 本地竞态验证（不依赖线上）：dev shell payload 手术为 v3 inline + 池化引用，
   并对资产请求注入延迟，制造足够大的竞态窗口；在首个模型加载在途时点击第二张模型卡，
   然后统计场景内模型根对象数量。
   期望：修复前 = 2 个模型同屏；修复后 = 1 个。
   用法: DELAY=2500 GAP=0 node probe-loadmodel-race-local.cjs */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const OUT = process.env.OUT || 'G:/项目/模型审核工具/tool/output/playwright';
const DELAY = Number(process.env.DELAY || 2500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHELL = 'G:/项目/模型审核工具/tool/public/reviewer-preview.html';
const pageSrc = fs.readFileSync(SHELL, 'utf8');
const key = 'window.__AN_REVIEW_PAYLOAD__=';
const start = pageSrc.indexOf(key);
let i = pageSrc.indexOf('{', start), depth = 0, inStr = false, end = -1;
for (; i < pageSrc.length; i++) {
  const c = pageSrc[i];
  if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const originalPayload = JSON.parse(pageSrc.slice(pageSrc.indexOf('{', start), end));

const binByRef = new Map();
(originalPayload.project?.models || []).forEach((m, idx) => {
  if (!Array.isArray(m.base64Chunks) || !m.base64Chunks.length) return;
  binByRef.set(`probe-${idx}.glb`, Buffer.concat(m.base64Chunks.map((c) => Buffer.from(c, 'base64'))));
});

const FAKE = 'https://assets.probe.invalid/reviews/assets';
function buildSrc() {
  const p = JSON.parse(JSON.stringify(originalPayload));
  p.schemaVersion = 3;
  p.mode = 'external';
  const models = p.project.models || [];
  p.modelData = models.map((m, idx) => ({
    key: `probe-${idx}`,
    fileRef: `probe-${idx}.glb`,
    size: binByRef.get(`probe-${idx}.glb`)?.length || 0,
    url: `${FAKE}/probe-${idx}.glb`,
  }));
  /* schemaVersion>=4 才走 assetUrl 分支；这里用 3 + 池化 dataKey：modelChunks 命中池里的 base64 时才是 inline，
     故同时去掉 base64Chunks 并把 mode 设 external，令渲染端落到 fetch 分支需要 v4。改用 v4 形态。 */
  p.schemaVersion = 4;
  p.modelData = models.map((m, idx) => {
    const bin = binByRef.get(`probe-${idx}.glb`);
    return { key: `probe-${idx}`, fileRef: `probe-${idx}.glb`, size: bin?.length || 0, url: `${FAKE}/probe-${idx}.glb` };
  });
  p.project.models = models.map((m, idx) => {
    const { base64Chunks: _dropped, ...rest } = m;
    return { ...rest, dataKey: `probe-${idx}`, fileRef: `probe-${idx}.glb` };
  });
  /* 强制两个模型同属一个课程：dev shell 默认每课程模型数不定，统一后左栏必出两张卡 */
  const courses = (p.project.courses && p.project.courses.length)
    ? p.project.courses
    : [{ courseId: 'probe-course', code: '', name: 'probe case', sortOrder: 1 }];
  p.project.courses = courses;
  const cid = courses[0].courseId;
  p.project.models = p.project.models.map((m) => ({ ...m, courseId: cid }));
  return pageSrc.slice(0, pageSrc.indexOf('{', start)) + JSON.stringify(p) + pageSrc.slice(end);
}

(async () => {
  const report = { delay: DELAY, steps: [], assets: [], errors: [] };
  const src = buildSrc();
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 160)); });

  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: src, contentType: 'text/html; charset=utf-8' }));
  await page.route('**/reviews/assets/**', async (route) => {
    const ref = decodeURIComponent(route.request().url().split('/reviews/assets/')[1] || '');
    report.assets.push(ref);
    await sleep(DELAY);
    const bin = binByRef.get(ref);
    if (bin) return route.fulfill({ body: bin, contentType: 'model/gltf-binary' });
    return route.fulfill({ status: 404, body: 'missing' });
  });

  const dump = () => page.evaluate(() => {
    const v = document.querySelector('canvas')?.__productViewer;
    if (!v) return { error: 'no viewer' };
    const kids = [];
    v.scene.children.forEach((n) => {
      const t = n.type || '';
      if (/Light$/.test(t)) return;
      let meshes = 0; n.traverse((x) => { if (x.isMesh) meshes++; });
      kids.push({ name: n.name || t, meshes });
    });
    return { roots: kids, modelRoots: kids.filter((k) => k.meshes > 0).length, title: (document.getElementById('model-title') || {}).textContent || '' };
  });

  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 30000 });

  /* 等页面完全就绪：卡片 ≥2 且首个模型已加载完成（规避 dev 冷启动编译耗时带来的误判） */
  let waited = 0;
  for (; waited < 400; waited++) {
    const ready = await page.evaluate(() => {
      const cards = document.querySelectorAll('.model-item-main').length;
      const title = (document.getElementById('model-title') || {}).textContent || '';
      return cards >= 2 && title !== '' && title !== '等待模型';
    });
    if (ready) break;
    await sleep(100);
  }
  report.cardCount = await page.evaluate(() => document.querySelectorAll('.model-item-main').length);
  report.waitedMs = waited * 100;
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());
  report.steps.push({ label: '0-baseline', ...(await dump()), assets: report.assets.slice() });

  /* 连点两张不同模型卡：两次点击都落在第一次 fetch 的延迟窗口内 → 修复前应出现两个模型同屏 */
  await page.evaluate(() => document.querySelectorAll('.model-item-main')[1]?.click());
  await sleep(400);
  await page.evaluate(() => document.querySelectorAll('.model-item-main')[0]?.click());
  await sleep(DELAY * 2 + 4000);
  report.steps.push({ label: 'A-rapid-two-cards', ...(await dump()), assets: report.assets.slice() });
  await page.screenshot({ path: `${OUT}/local-race.png` });

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + '/local-race-report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    assetsRequested: report.assets.length,
    steps: report.steps.map((s) => ({ label: s.label, modelRoots: s.modelRoots, title: s.title, roots: (s.roots || []).map((r) => `${r.name}:${r.meshes}`) })),
    errors: report.errors.slice(0, 3),
  }, null, 2));
  await browser.close();
})();
