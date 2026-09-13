/* locate-explode E2E probe (ASCII-safe: all Chinese literals as \uXXXX escapes).
   Prereq: npm run dev (5173). Run: NODE_PATH=<workspace>/node_modules node probe-locate-explode.cjs (OUT=outdir). */
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };
/* \u9634\u6781\u5F15\u811A = cathode lead (x=+0.5), \u9633\u6781\u5F15\u811A = anode lead (x=-0.5) */
const NEG = '\u9634\u6781\u5F15\u811A';
const POS = '\u9633\u6781\u5F15\u811A';
const AUTO_MSG = '\u5DF2\u81EA\u52A8\u7206\u70B8'; /* "auto-exploded" */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (let i = 0; i < 10; i++) {
    try { await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 20000 }); break; }
    catch (e) { if (i === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  /* diagnostics: rAF loop alive + mesh data sanity */
  const diag = await page.evaluate(async () => {
    const viewer = document.querySelector('canvas').__productViewer;
    const f1 = viewer.renderer.info.render.frame;
    await new Promise((r) => setTimeout(r, 400));
    const f2 = viewer.renderer.info.render.frame;
    const meshes = [];
    viewer.scene.traverse((n) => {
      if (!n.isMesh) return;
      let box = null;
      try { n.geometry.computeBoundingBox(); box = n.geometry.boundingBox; } catch (e) { /* noop */ }
      const e = n.matrixWorld.elements;
      meshes.push({
        name: n.name, visible: n.visible,
        posCount: n.geometry.attributes?.position?.count,
        bbMin: box ? [box.min.x, box.min.y, box.min.z] : null,
        bbMax: box ? [box.max.x, box.max.y, box.max.z] : null,
        world: [e[12], e[13], e[14]],
      });
    });
    return { framesDelta: f2 - f1, meshes };
  });
  console.log('diag:', JSON.stringify(diag));
  assert(diag.framesDelta > 0, `render loop alive (frames +${diag.framesDelta})`);
  assert(diag.meshes.some((m) => m.name === NEG), 'negative-lead mesh found by exact name');

  /* —— B: visible part -> no explode, camera frames it —— */
  const B = await page.evaluate((NEG) => {
    const viewer = document.querySelector('canvas').__productViewer;
    let target = null;
    viewer.scene.traverse((n) => { if (n.name === NEG) target = n; });
    viewer.camera.position.set(2.8, 2.2, 4.2);
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
    const occluded = viewer.isNodeOccluded(target);
    const res = viewer.locateNode(target);
    return { occluded, exploded: res.exploded, explodeTarget: viewer.explodeTarget, found: !!target };
  }, NEG);
  await page.waitForTimeout(2000);
  const B2 = await page.evaluate((NEG) => {
    const viewer = document.querySelector('canvas').__productViewer;
    let target = null;
    viewer.scene.traverse((n) => { if (n.name === NEG) target = n; });
    const e = target.matrixWorld.elements;
    return { factor: viewer.explodeFactor, cam: viewer.camera.position.toArray().map((v) => +v.toFixed(3)), tgt: viewer.controls.target.toArray().map((v) => +v.toFixed(3)), nodePos: [e[12], e[13], e[14]].map((v) => +v.toFixed(3)) };
  }, NEG);
  assert(B.found, 'B. target node found');
  assert(B.exploded === false && B.explodeTarget === 0, `B. visible part does not explode (occluded=${B.occluded}, exploded=${B.exploded})`);
  assert(B2.factor === 0, `B. explode factor stays 0 (factor=${B2.factor})`);
  const bTgtDist = Math.hypot(B2.tgt[0] - B2.nodePos[0], B2.tgt[1] - B2.nodePos[1], B2.tgt[2] - B2.nodePos[2]);
  assert(bTgtDist < 0.35, `B. camera frames cathode lead (deviation ${bTgtDist.toFixed(3)}, tgt=${JSON.stringify(B2.tgt)}, node=${JSON.stringify(B2.nodePos)})`);

  /* —— A: occluded part -> auto explode + delayed framing —— */
  await page.evaluate(() => {
    const viewer = document.querySelector('canvas').__productViewer;
    viewer.setExplode(0, { instant: true });
    viewer.camera.position.set(-10, 0, 0);
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
  });
  await page.waitForTimeout(300);
  const A = await page.evaluate((NEG) => {
    const viewer = document.querySelector('canvas').__productViewer;
    let target = null;
    viewer.scene.traverse((n) => { if (n.name === NEG) target = n; });
    const occluded = viewer.isNodeOccluded(target);
    const res = viewer.locateNode(target);
    return { occluded, exploded: res.exploded, explodeTarget: viewer.explodeTarget };
  }, NEG);
  assert(A.occluded === true, `A. negative lead occluded from -X camera (occluded=${A.occluded})`);
  assert(A.exploded === true && A.explodeTarget === 1, `A. occlusion triggers auto explode (exploded=${A.exploded}, target=${A.explodeTarget})`);
  await page.waitForTimeout(3000);
  const A2 = await page.evaluate((NEG) => {
    const viewer = document.querySelector('canvas').__productViewer;
    const btn = document.getElementById('explode');
    const slider = document.querySelector('.viewer-explode');
    let target = null;
    viewer.scene.traverse((n) => { if (n.name === NEG) target = n; });
    const e = target.matrixWorld.elements;
    return {
      factor: viewer.explodeFactor,
      cam: viewer.camera.position.toArray().map((v) => +v.toFixed(3)),
      tgt: viewer.controls.target.toArray().map((v) => +v.toFixed(3)),
      nodePos: [e[12], e[13], e[14]].map((v) => +v.toFixed(3)),
      btnActive: !!btn?.classList.contains('active'),
      sliderShown: !!slider && !slider.classList.contains('hidden'),
    };
  }, NEG);
  await page.screenshot({ path: OUT + '/locate-explode.png' });
  assert(A2.factor === 1, `A. explode animation settled (factor=${A2.factor})`);
  const aTgtDist = Math.hypot(A2.tgt[0] - A2.nodePos[0], A2.tgt[1] - A2.nodePos[1], A2.tgt[2] - A2.nodePos[2]);
  assert(aTgtDist < 0.4, `A. camera frames lead at exploded position (deviation ${aTgtDist.toFixed(3)}, tgt=${JSON.stringify(A2.tgt)}, node=${JSON.stringify(A2.nodePos)})`);
  assert(A2.btnActive && A2.sliderShown, `A. toolbar syncs (active=${A2.btnActive}, slider=${A2.sliderShown})`);

  /* —— C: locateIssue UI chain (tree select -> add issue -> click locate) —— */
  await page.evaluate(() => {
    const viewer = document.querySelector('canvas').__productViewer;
    viewer.setExplode(0, { instant: true });
    viewer.camera.position.set(-10, 0, 0);
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
  });
  await page.click(`.tree-node:has-text("${NEG}")`);
  await page.waitForTimeout(300);
  const C0 = await page.evaluate(() => ({
    current: document.getElementById('current-part')?.textContent || '',
    addDisabled: document.getElementById('add-node')?.disabled,
  }));
  console.log('C0 after tree click:', JSON.stringify(C0));
  await page.fill('#issue-text', 'lead oxidation test issue');
  await page.click('#add-node');
  await page.waitForTimeout(500);
  const C1 = await page.evaluate(() => ({
    issueRows: [...document.querySelectorAll('[data-issue-index]')].map((r) => r.textContent.slice(0, 60)),
    status: document.getElementById('status')?.textContent || '',
  }));
  console.log('C1 after add:', JSON.stringify(C1));
  await page.click('[data-issue-index]:has-text("lead oxidation")');
  await page.waitForFunction(() => {
    const viewer = document.querySelector('canvas').__productViewer;
    return viewer && viewer.explodeFactor === 1;
  }, null, { timeout: 15000, polling: 120 });
  await page.waitForTimeout(2500);
  const C = await page.evaluate(({ NEG, AUTO_MSG }) => {
    const viewer = document.querySelector('canvas').__productViewer;
    return {
      status: document.getElementById('status')?.textContent || '',
      factor: viewer.explodeFactor,
      current: document.getElementById('current-part')?.textContent || '',
    };
  }, { NEG, AUTO_MSG });
  await page.screenshot({ path: OUT + '/locate-issue-ui.png' });
  assert(C.status.includes(AUTO_MSG), `C. status hint shown (status="${JSON.stringify(C.status)}")`);
  assert(C.factor === 1, `C. UI chain explodes (factor=${C.factor})`);
  assert(C.current.includes(NEG), `C. target part selected (current="${JSON.stringify(C.current)}")`);

  assert(errors.length === 0, `zero pageerrors (${errors.length})`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
