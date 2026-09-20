/* model-list dialog E2E probe (ASCII-safe).
   Prereq: npm run dev (5173). Run: node probe-model-list.cjs (OUT=outdir).
   Part A (editor): card outline button renders/disabled, open dialog, name w/o .glb,
                    subtitle version+size, row click jumps to model, ESC/mask close, no course switch.
   Part B (reviewer): payload injection, status dot + label, row click loads model, empty course disabled. */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const results = [];
const assert = (cond, label) => { results.push(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- reviewer payload surgery (same recipe as probe-e2e-dedup) ---- */
const pageSrc = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');
const key = 'window.__AN_REVIEW_PAYLOAD__=';
const start = pageSrc.indexOf(key);
if (start < 0) { console.error('payload key not found'); process.exit(1); }
let i = pageSrc.indexOf('{', start), depth = 0, inStr = false, end = -1;
for (; i < pageSrc.length; i++) {
  const c = pageSrc[i];
  if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const originalPayload = JSON.parse(pageSrc.slice(pageSrc.indexOf('{', start), end));

function buildReviewSrc() {
  const p = JSON.parse(JSON.stringify(originalPayload));
  p.review = p.review || {}; p.review.byModel = p.review.byModel || {};
  const models = p.project.models || [];
  if (models[0]) p.review.byModel[models[0].modelId] = { modelStatus: 'pass', modelNote: '', issues: [] };
  if (models[1]) {
    p.review.byModel[models[1].modelId] = { modelStatus: 'risk', modelNote: '', issues: [] };
    /* move models[1] into course of models[0] so one dialog shows both pass+risk */
    models[1].courseId = models[0].courseId;
    models[1].sortOrder = 2;
  }
  p.project.courses.push({ courseId: 'course-EMPTY', code: 'EM', name: '空课程', sortOrder: 99 });
  return pageSrc.slice(0, pageSrc.indexOf('{', start)) + JSON.stringify(p) + pageSrc.slice(end);
}

const DIALOG_OPEN = `(() => {
  const m = document.querySelector('.model-list-mask');
  return m ? !m.classList.contains('hidden') : false;
})()`;
const DIALOG_INFO = `(() => {
  const m = document.querySelector('.model-list-mask');
  if (!m) return { rows: 0 };
  return {
    title: m.querySelector('h3')?.textContent || '',
    rows: m.querySelectorAll('.model-list-row').length,
    names: [...m.querySelectorAll('.model-list-body b')].map((b) => b.textContent),
    subs: [...m.querySelectorAll('.model-list-body small')].map((s) => s.textContent),
    dots: [...m.querySelectorAll('.status-dot')].map((d) => d.className),
    foot: m.querySelector('.model-list-foot')?.textContent || '',
  };
})()`;

async function openDialogByCard(page, courseId) {
  await page.evaluate((cid) => document.querySelector(`[data-course-outline="${cid}"]`)?.click(), courseId);
  await sleep(300);
}

/* ---- Part A: editor ---- */
async function partEditor(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (let k = 0; k < 10; k++) {
    try { await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
    catch (e) { if (k === 9) throw e; await sleep(3000); }
  }
  await sleep(2000);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  const buttons = await page.locator('.course-card-outline').count();
  assert(buttons === 7, `A1 editor: 7 course cards each have outline button (got ${buttons})`);
  const allDisabled = await page.evaluate(() => [...document.querySelectorAll('.course-card-outline')].every((b) => b.disabled));
  assert(allDisabled, 'A2 editor: all outline buttons disabled when no models imported');

  await page.evaluate(() => document.querySelector('[data-course-select="course-AN-01"]')?.click());
  await sleep(600);
  await page.setInputFiles('#files', ['G:/项目/模型审核工具/Model/AN-模拟电路实训室/AN-01 二极管认知与检测/2AP9二极管.glb', 'G:/项目/模型审核工具/Model/AN-模拟电路实训室/AN-03 滤波电路/桥式整流模块.glb']);
  await sleep(3000);

  const enabled = await page.evaluate(() => !document.querySelector('[data-course-outline="course-AN-01"]')?.disabled);
  assert(enabled, 'A3 editor: outline button enabled after import to AN-01');
  const activeBefore = await page.evaluate(() => document.querySelector('.course-card.active')?.dataset.courseCard || '');

  await openDialogByCard(page, 'course-AN-01');
  assert(await page.evaluate(DIALOG_OPEN), 'A4 editor: dialog opens on outline click');
  const info = await page.evaluate(DIALOG_INFO);
  assert(info.rows === 2, `A5 editor: dialog lists 2 models (got ${info.rows})`);
  assert(info.names.length === 2 && info.names.every((n) => !/\.glb/i.test(n)), `A6 editor: names without .glb (${info.names.join('|')})`);
  assert(info.subs.every((s) => /V1\.0/.test(s) && /KB/.test(s)), `A7 editor: subtitle has version+size (${info.subs.join('|')})`);
  assert(/AN-01/.test(info.title), `A8 editor: dialog title contains course code (${info.title})`);
  const activeAfter = await page.evaluate(() => document.querySelector('.course-card.active')?.dataset.courseCard || '');
  assert(activeBefore === activeAfter && activeAfter === 'course-AN-01', 'A9 editor: outline click does not switch active course');

  const firstName = info.names[0];
  await page.evaluate(() => document.querySelector('.model-list-row')?.click());
  await sleep(1500);
  const closedAfterRow = await page.evaluate(DIALOG_OPEN).then((v) => !v);
  assert(closedAfterRow, 'A10 editor: dialog closes after row click');
  const hud = await page.evaluate(() => document.getElementById('hud')?.textContent || '');
  assert(hud.includes(firstName), `A11 editor: row click jumps to model (hud=${hud} ~ ${firstName})`);

  await openDialogByCard(page, 'course-AN-01');
  await page.keyboard.press('Escape');
  await sleep(200);
  assert(!(await page.evaluate(DIALOG_OPEN)), 'A12 editor: ESC closes dialog');
  await openDialogByCard(page, 'course-AN-01');
  await page.mouse.click(120, 450);
  await sleep(200);
  assert(!(await page.evaluate(DIALOG_OPEN)), 'A13 editor: mask click closes dialog');
  assert(errors.length === 0, `A14 editor: no page errors (${errors.join(' ; ').slice(0, 200)})`);
  await page.close();
}

/* ---- Part B: reviewer ---- */
async function partReviewer(browser) {
  const src = buildReviewSrc();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: src, contentType: 'text/html; charset=utf-8' }));
  for (let k = 0; k < 10; k++) {
    try { await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
    catch (e) { if (k === 9) throw e; await sleep(3000); }
  }
  await sleep(2500);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  const emptyDisabled = await page.evaluate(() => document.querySelector('[data-course-outline="course-EMPTY"]')?.disabled ?? null);
  assert(emptyDisabled === true, 'B1 reviewer: empty course outline button disabled');

  const firstCourseId = await page.evaluate(() => document.querySelector('.course-card:not(.empty) [data-course-outline]')?.dataset.courseOutline || '');
  await openDialogByCard(page, firstCourseId);
  assert(await page.evaluate(DIALOG_OPEN), 'B2 reviewer: dialog opens on outline click');
  const info = await page.evaluate(DIALOG_INFO);
  assert(info.rows > 0, `B3 reviewer: dialog lists models (got ${info.rows})`);
  assert(info.names.every((n) => !/\.glb/i.test(n)), `B4 reviewer: names without .glb (${info.names.join('|')})`);
  assert(info.dots.length === info.rows && info.dots.some((d) => /pass/.test(d)) && info.dots.some((d) => /risk/.test(d)), `B5 reviewer: status dots rendered (${info.dots.join('|')})`);
  assert(info.subs.some((s) => s === '通过') && info.subs.some((s) => s === '待改'), `B6 reviewer: status labels as subtitle (${info.subs.join('|')})`);

  const target = info.names[0];
  await page.evaluate(() => document.querySelector('.model-list-row')?.click());
  await sleep(2000);
  assert(!(await page.evaluate(DIALOG_OPEN)), 'B7 reviewer: dialog closes after row click');
  const title = await page.evaluate(() => document.getElementById('model-title')?.textContent || '');
  assert(title.includes(target), `B8 reviewer: row click loads model (${title} ~ ${target})`);

  await openDialogByCard(page, firstCourseId);
  await page.keyboard.press('Escape');
  await sleep(200);
  assert(!(await page.evaluate(DIALOG_OPEN)), 'B9 reviewer: ESC closes dialog without errors');
  assert(errors.length === 0, `B10 reviewer: no page errors (${errors.join(' ; ').slice(0, 200)})`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  try {
    await partEditor(browser);
    await partReviewer(browser);
  } finally {
    await browser.close();
  }
})().catch((e) => { results.push(`FAIL - probe crashed: ${String(e).slice(0, 300)}`); process.exitCode = 1; })
  .finally(() => {
    fs.writeFileSync(process.env.OUT ? `${process.env.OUT}/model-list-result.txt` : 'model-list-result.txt', results.join('\n') + '\n', 'utf8');
    results.forEach((line) => console.log(line));
  });
