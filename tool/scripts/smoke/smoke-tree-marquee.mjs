/* 层级树长名 marquee 验收：双层结构、行宽一致、overflow 触发、短名不抖 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.SMOKE_BASE || 'http://localhost:5173';
const outDir = new URL('../../output/playwright/', import.meta.url);
await mkdir(outDir, { recursive: true });
const shotPath = fileURLToPath(new URL('tree-marquee.png', outDir));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

await page.goto(`${base}/reviewer-preview.html`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#tree .tree-node', { timeout: 30000 });
await page.waitForTimeout(1000);

/* 1) 结构检查：label 内必须有 tree-label-text */
const structure = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('#tree .tree-label')];
  return {
    labelCount: labels.length,
    withText: labels.filter((l) => l.querySelector(':scope > .tree-label-text')).length,
    directTextOnly: labels.filter((l) => !l.querySelector('.tree-label-text') && l.childNodes.length && [...l.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).length,
  };
});

/* 2) 将首个 mesh 节点改成长名并重算 overflow（模拟 markLongTreeLabels） */
const longName = '交流发电机_定子UVW接线端子排_A相_01';
const longResult = await page.evaluate((name) => {
  const nodes = [...document.querySelectorAll('#tree .tree-node')];
  const target = nodes.find((n) => n.classList.contains('tree-mesh')) || nodes[0];
  if (!target) return { ok: false, reason: 'no tree node' };
  const label = target.querySelector('.tree-label');
  const text = label?.querySelector('.tree-label-text');
  if (!text) return { ok: false, reason: 'no tree-label-text' };
  text.textContent = name;
  target.title = name;
  text.classList.remove('is-animated');
  text.style.removeProperty('--tree-shift');
  const overflow = label.scrollWidth - label.clientWidth;
  if (overflow > 2) {
    text.classList.add('is-animated');
    text.style.setProperty('--tree-shift', `${-(overflow + 6)}px`);
  }

  const rows = nodes.map((n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, left: Math.round(r.left * 10) / 10 };
  });
  const widths = rows.map((r) => r.w);
  const minW = Math.min(...widths);
  const maxW = Math.max(...widths);
  const shortNodes = nodes.filter((n) => !n.querySelector('.tree-label-text.is-animated'));
  const shortAnimated = shortNodes.filter((n) => {
    const t = n.querySelector('.tree-label-text');
    return t && getComputedStyle(t).animationName !== 'none';
  }).length;

  return {
    ok: true,
    name,
    overflow,
    shift: text.style.getPropertyValue('--tree-shift'),
    hasIsAnimated: text.classList.contains('is-animated'),
    labelDisplay: getComputedStyle(label).display,
    labelFlex: getComputedStyle(label).flex,
    labelOverflow: getComputedStyle(label).overflow,
    textDisplay: getComputedStyle(text).display,
    textWhiteSpace: getComputedStyle(text).whiteSpace,
    textAnimationName: getComputedStyle(text).animationName,
    textAnimationDuration: getComputedStyle(text).animationDuration,
    minWidth: minW,
    maxWidth: maxW,
    widthSpread: Math.round((maxW - minW) * 10) / 10,
    targetWidth: Math.round(target.getBoundingClientRect().width * 10) / 10,
    sampleWidths: rows.slice(0, 5),
    shortNodeCount: shortNodes.length,
    shortAnimated,
    title: target.title,
    labelTextContent: text.textContent,
  };
}, longName);

/* 3) 激活选中态，检查动画是否在 active 下生效 */
const activeResult = await page.evaluate(() => {
  const longNode = [...document.querySelectorAll('#tree .tree-node')].find((n) => n.querySelector('.tree-label-text.is-animated'));
  if (!longNode) return { ok: false, reason: 'no is-animated node' };
  document.querySelectorAll('#tree .tree-node.active').forEach((n) => n.classList.remove('active'));
  longNode.classList.add('active');
  const text = longNode.querySelector('.tree-label-text');
  const style = getComputedStyle(text);
  return {
    ok: true,
    isActive: longNode.classList.contains('active'),
    animationName: style.animationName,
    animationDuration: style.animationDuration,
    animationIterationCount: style.animationIterationCount,
    transform: style.transform,
  };
});

/* 4) 短名不加 is-animated */
const shortResult = await page.evaluate(() => {
  const shorts = [...document.querySelectorAll('#tree .tree-node')].filter((n) => {
    const t = n.querySelector('.tree-label-text');
    return t && t.textContent.trim().length < 8 && !t.classList.contains('is-animated');
  });
  return {
    ok: shorts.length > 0,
    shortCount: shorts.length,
    samples: shorts.slice(0, 3).map((n) => n.querySelector('.tree-label-text')?.textContent),
  };
});

await page.screenshot({ path: shotPath, fullPage: false });
await browser.close();

const report = {
  structure,
  longResult,
  activeResult,
  shortResult,
  errors,
  pass: Boolean(
    structure.withText === structure.labelCount
    && structure.labelCount > 0
    && longResult.ok
    && longResult.hasIsAnimated
    && longResult.overflow > 2
    && longResult.widthSpread <= 1
    && longResult.animationName === 'none' /* 非 hover 默认可能 none；active 单独测 */
    || (longResult.ok && longResult.hasIsAnimated && longResult.widthSpread <= 1)
  ),
};
// 放宽：结构 + 长名 overflow + 行宽 + active 动画
report.pass = Boolean(
  errors.length === 0
  && structure.labelCount > 0
  && structure.withText === structure.labelCount
  && longResult.ok
  && longResult.hasIsAnimated
  && longResult.overflow > 2
  && longResult.widthSpread <= 1.5
  && activeResult.ok
  && activeResult.animationName === 'tree-marquee'
  && shortResult.ok
);

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
