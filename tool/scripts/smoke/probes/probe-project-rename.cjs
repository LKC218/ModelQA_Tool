/* Project-rename decoupling (plan A) E2E probe.
   Verifies: rename only changes list label + customName; project payload fields untouched;
   sub-line shows real project title; later autosave keeps custom list label.
   Prereq: npm run dev (5173). Blocks /api/** to stay offline (no cloud pollution). */
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };
const ALPHA = '\u6D4B\u8BD5\u9879\u76EE Alpha'; /* 测试项目 Alpha */
const TAG = '\u91CD\u547D\u540D\u6807\u7B7E';   /* 重命名标签 */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/**', (route) => route.abort());
  for (let i = 0; i < 10; i++) {
    try { await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 }); break; }
    catch (e) { if (i === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  await page.waitForTimeout(1500);

  /* create a project draft: open settings drawer, fill title triggers syncProject + markDraft + autosave */
  await page.click('#open-settings');
  await page.fill('#display-title', ALPHA);
  await page.fill('#project-name', ALPHA);
  await page.waitForTimeout(2500);
  const S1 = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('an-review-drafts') || '[]');
    const id = localStorage.getItem('an-review-active');
    const meta = list.find((m) => m.id === id);
    const payload = JSON.parse(localStorage.getItem('an-review-draft:' + id) || 'null');
    return { metaName: meta?.name, customName: meta?.customName, pName: payload?.project?.name, pTitle: payload?.project?.displayTitle };
  });
  assert(S1.metaName === ALPHA && S1.customName !== true, `S1. initial list label follows project name (metaName=${JSON.stringify(S1.metaName)}, customName=${S1.customName})`);
  assert(S1.pName === ALPHA && S1.pTitle === ALPHA, 'S1. project payload fields filled');

  /* rename via UI (prompt dialog) */
  await page.click('#close-settings');
  await page.on('dialog', (d) => d.accept(TAG));
  await page.click('#draft-toggle');
  const rowCount = await page.locator('.draft-item').count();
  assert(rowCount >= 1, `S2. draft list rendered (${rowCount})`);
  await page.click('.draft-item [data-action="rename"]');
  await page.waitForTimeout(800);
  const S2 = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('an-review-drafts') || '[]');
    const id = localStorage.getItem('an-review-active');
    const meta = list.find((m) => m.id === id);
    const payload = JSON.parse(localStorage.getItem('an-review-draft:' + id) || 'null');
    const sub = document.querySelector('.draft-item.active .draft-item-sub')?.textContent || '';
    const renameTitle = document.querySelector('.draft-item [data-action="rename"]')?.title || '';
    return { metaName: meta?.name, customName: meta?.customName, pName: payload?.project?.name, pTitle: payload?.project?.displayTitle, sub, renameTitle };
  });
  assert(S2.metaName === TAG, `S2. list label renamed (metaName=${JSON.stringify(S2.metaName)})`);
  assert(S2.customName === true, `S2. customName marked (customName=${S2.customName})`);
  assert(S2.pName === ALPHA && S2.pTitle === ALPHA, `S2. project payload untouched (pName=${JSON.stringify(S2.pName)}, pTitle=${JSON.stringify(S2.pTitle)})`);
  assert(S2.sub.includes(ALPHA), `S2. sub-line shows real project title (sub=${JSON.stringify(S2.sub)})`);
  assert(S2.renameTitle.includes('\u4E0D\u6539\u9879\u76EE\u4FE1\u606F'), 'S2. rename button hints label-only rename');
  await page.screenshot({ path: OUT + '/rename-decoupled.png' });

  /* later autosave keeps custom label, project fields still independent */
  await page.click('#open-settings');
  await page.fill('#project-version', 'V9.9');
  await page.click('#close-settings');
  await page.waitForTimeout(2500);
  const S3 = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('an-review-drafts') || '[]');
    const id = localStorage.getItem('an-review-active');
    const meta = list.find((m) => m.id === id);
    const payload = JSON.parse(localStorage.getItem('an-review-draft:' + id) || 'null');
    return { metaName: meta?.name, customName: meta?.customName, version: payload?.project?.version };
  });
  assert(S3.metaName === TAG && S3.customName === true, `S3. autosave keeps custom label (metaName=${JSON.stringify(S3.metaName)})`);
  assert(S3.version === 'V9.9', `S3. project fields still save normally (version=${S3.version})`);

  assert(errors.length === 0, `zero pageerrors (${errors.length})`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
