/* explode-v2 E2E probe: two-level explode + auto camera fit (ASCII-safe).
   Prereq: npm run dev (5173). Run: node probe-e2e-explode2.cjs (OUT=outdir).
   Injects a custom nested-hierarchy GLB model by replacing window.__AN_REVIEW_PAYLOAD__
   via addInitScript (no changes to public files). */
const fs = require('fs');
const path = require('path');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };

/* ---- payload surgery: read public preview page, swap model-1 GLB with nested hierarchy ---- */
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
const payload = JSON.parse(pageSrc.slice(pageSrc.indexOf('{', start), end));

/* decode model-1 glb -> glTF json -> rebuild nested node graph reusing mesh 0 */
const glb = Buffer.concat(payload.project.models[0].base64Chunks.map((c) => Buffer.from(c, 'base64')));
const jsonLen = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.slice(20, 20 + jsonLen).toString('utf8'));
const bin = glb.slice(20 + jsonLen);
gltf.nodes = [
  { name: 'NESTED-ASM-TEST', children: [1, 4, 9] },
  { name: 'ASM-HOUSING', children: [2, 3, 8] },
  { name: 'HOUSING', mesh: 0, translation: [-0.5, 0, 0], scale: [0.5, 1, 0.5] },
  { name: 'BOLT-A', mesh: 0, translation: [0, 0.75, 0], scale: [0.9, 0.18, 0.9] },
  { name: 'ASM-COVER', children: [5, 6, 7] },
  { name: 'COVER', mesh: 0, translation: [0.6, 0, 0], scale: [0.4, 0.8, 0.4] },
  { name: 'BOLT-C', mesh: 0, translation: [0.9, 0.5, 0], scale: [0.08, 0.3, 0.08] },
  { name: 'BOLT-D', mesh: 0, translation: [0.9, -0.5, 0], scale: [0.08, 0.3, 0.08] },
  { name: 'WASHER', mesh: 0, translation: [0, -0.6, 0], scale: [0.9, 0.1, 0.9] },
  { name: 'ROTOR', mesh: 0, translation: [0, 1.4, 0], scale: [0.3, 0.5, 0.3] },
];
const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = Buffer.alloc((4 - (jsonLen % 4)) % 4, 0x20);
const jsonChunkLen = jsonBuf.length + jsonPad.length;
/* GLB 12-byte header: magic + version + TOTAL length */
const totalLen = 12 + 8 + jsonChunkLen + bin.length;
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4); header.writeUInt32LE(totalLen, 8);
const jsonHead = Buffer.alloc(8); jsonHead.writeUInt32LE(jsonChunkLen, 0); jsonHead.writeUInt32LE(0x4E4F534A, 4);
const outGlb = Buffer.concat([header, jsonHead, jsonBuf, jsonPad, bin]);
payload.project.models[0].base64Chunks = [outGlb.toString('base64')];
payload.project.models[0].byteLength = outGlb.length;
payload.project.models[0].displayName = 'NESTED-ASM-TEST';
payload.project.models[0].fileName = 'nested-asm-test.glb';

/* bake modified payload back into the page source (init-script assignment would be overwritten by the inline script) */
const jStart = pageSrc.indexOf('{', start);
const modifiedSrc = pageSrc.slice(0, jStart) + JSON.stringify(payload) + pageSrc.slice(end);

/* ---- world snapshot helpers ---- */
const SNAP = `(() => {
  const v = document.querySelector('canvas').__productViewer;
  let root = null;
  v.scene.traverse((n) => { if (n.name === 'NESTED-ASM-TEST') root = n; });
  const meshes = [];
  root.traverse((n) => { if (n.name && n.name !== 'NESTED-ASM-TEST' && (n.isMesh || (n.children && n.children.length)) && n.visible) {
    n.geometry && n.geometry.computeBoundingBox();
    const e = n.matrixWorld.elements;
    meshes.push({ name: n.name, pos: [e[12], e[13], e[14]], bb: n.geometry && n.geometry.boundingBox });
  }});
  const cam = v.camera.position.distanceTo(v.controls.target);
  return { meshes: meshes.map((m) => ({ name: m.name, pos: m.pos })), camDist: cam, rootFound: !!root };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/reviewer-preview.html', (route) => route.fulfill({ body: modifiedSrc, contentType: 'text/html; charset=utf-8' }));
  for (let k = 0; k < 10; k++) {
    try { await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded', timeout: 20000 }); break; }
    catch (e) { if (k === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#onb-root')?.remove());

  const before = await page.evaluate(SNAP);
  assert(before.rootFound, 'root NESTED-ASM-TEST found');
  assert(before.meshes.length === 9, `9 named units loaded (7 meshes + 2 assembly groups, got ${before.meshes.length})`);

  const btn = await page.evaluate(() => !document.getElementById('explode')?.disabled);
  assert(btn, 'explode button enabled (explodable)');

  await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    v.setExplode(1);
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('canvas').__productViewer;
    return v && v.explodeFactor === 1 && v.explodeTarget === 1;
  }, null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(1800); /* frameGoal lerp settle */

  const after = await page.evaluate(SNAP);
  const posOf = (snap, name) => snap.meshes.find((m) => m.name === name)?.pos;
  const delta = (snap, name) => { const a = posOf(snap, name), b = posOf(snap, 'NESTED-ASM-TEST') && posOf(snap, name); return a ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0; };
  void delta;
  const moved = (snap, name) => {
    const a = posOf(snap, name), b = posOf(before, name);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  const rel = (child, parent) => {
    const pairDist = (snap) => {
      const p = posOf(snap, child), q = posOf(snap, parent);
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    };
    return pairDist(after) - pairDist(before);
  };

  assert(after.meshes.every((m) => moved(after, m.name) > 0.01), `all units moved (L1+L2 exploded, ${after.meshes.length} units)`);
  assert(rel('BOLT-A', 'ASM-HOUSING') > 0.05, `BOLT-A separates from ASM-HOUSING (rel ${rel('BOLT-A', 'ASM-HOUSING').toFixed(3)})`);
  assert(rel('WASHER', 'ASM-HOUSING') > 0.05, `WASHER separates from ASM-HOUSING (rel ${rel('WASHER', 'ASM-HOUSING').toFixed(3)})`);
  assert(rel('BOLT-C', 'ASM-COVER') > 0.05, `BOLT-C separates from ASM-COVER (rel ${rel('BOLT-C', 'ASM-COVER').toFixed(3)})`);
  assert(moved(after, 'ASM-HOUSING') > 0.05, `L1 assembly still explodes (ASM-HOUSING ${moved(after, 'ASM-HOUSING').toFixed(3)})`);

  assert(after.camDist > before.camDist * 1.1, `camera pulled back (before ${before.camDist.toFixed(2)} -> after ${after.camDist.toFixed(2)})`);

  /* frustum containment: all exploded mesh bbox corners inside NDC [-1.1, 1.1] */
  const contain = await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    let root = null;
    v.scene.traverse((n) => { if (n.name === 'NESTED-ASM-TEST') root = n; });
    const corner = new v.scene.position.constructor();
    let worst = -Infinity, bad = [];
    root.traverse((n) => {
      if (!n.isMesh || !n.visible) return;
      n.geometry.computeBoundingBox();
      const bb = n.geometry.boundingBox;
      for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
        corner.set(xi ? bb.max.x : bb.min.x, yi ? bb.max.y : bb.min.y, zi ? bb.max.z : bb.min.z);
        const p = corner.clone().applyMatrix4(n.matrixWorld).project(v.camera);
        const margin = 1.1;
        const out = Math.max(Math.abs(p.x), Math.abs(p.y)) - margin;
        if (out > worst) worst = out;
        if (out > 0 && !bad.includes(n.name)) bad.push(n.name);
      }
    });
    return { worst: +worst.toFixed(3), bad };
  });
  assert(contain.worst <= 0, `all parts inside frustum (worst margin ${contain.worst}, out: ${JSON.stringify(contain.bad)})`);

  /* pairwise separation: units with own meshes must not overlap after explode (margin 0.01).
     Pure group units (no direct mesh) are logical containers — skipped. */
  const sep = await page.evaluate(() => {
    const v = document.querySelector('canvas').__productViewer;
    let root = null;
    v.scene.traverse((n) => { if (n.name === 'NESTED-ASM-TEST') root = n; });
    root.updateMatrixWorld(true);
    const units = [];
    root.traverse((n) => { if (n.name && n.name !== 'NESTED-ASM-TEST') units.push(n); });
    const unitSet = new Set(units);
    const INF = 1e9;
    const boxes = [];
    units.forEach((u) => {
      const direct = u.isMesh ? [u] : (u.children || []).filter((c) => c.isMesh && !unitSet.has(c));
      if (!direct.length) return;
      const bb = { name: u.name, min: [INF, INF, INF], max: [-INF, -INF, -INF] };
      direct.forEach((m) => {
        m.geometry.computeBoundingBox();
        const g = m.geometry.boundingBox;
        const e = m.matrixWorld.elements;
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          const x = xi ? g.max.x : g.min.x, y = yi ? g.max.y : g.min.y, z = zi ? g.max.z : g.min.z;
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
          const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
          const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          for (let k = 0; k < 3; k++) {
            const w = [wx, wy, wz][k];
            bb.min[k] = Math.min(bb.min[k], w);
            bb.max[k] = Math.max(bb.max[k], w);
          }
        }
      });
      boxes.push(bb);
    });
    const pairs = [];
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const ov = [0, 1, 2].map((k) => Math.min(boxes[a].max[k], boxes[b].max[k]) - Math.max(boxes[a].min[k], boxes[b].min[k]));
      if (ov[0] > 0.01 && ov[1] > 0.01 && ov[2] > 0.01) pairs.push(`${boxes[a].name}~${boxes[b].name}(${ov.map((v) => +v.toFixed(2)).join(',')})`);
    }
    return { count: boxes.length, pairs };
  });
  assert(sep.count >= 7 && sep.pairs.length === 0, `units pairwise separated (${sep.count} mesh units, overlaps: ${JSON.stringify(sep.pairs)})`);

  await page.screenshot({ path: path.join(OUT, 'explode2.png') });
  assert(errors.length === 0, `zero pageerrors (${errors.length})`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
