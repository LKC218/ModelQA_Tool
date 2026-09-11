const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: process.env.OUT + '/rev-full.png' });
  await page.screenshot({ path: process.env.OUT + '/rev-top.png', clip: { x: 0, y: 0, width: 1440, height: 120 } });
  await page.screenshot({ path: process.env.OUT + '/rev-bottom-right.png', clip: { x: 900, y: 700, width: 540, height: 200 } });
  const info = await page.evaluate(() => {
    const step = document.querySelector('.course-subtitle-step');
    const cur = document.getElementById('review-rail-current') || document.getElementById('rail-current');
    const toolbar = document.querySelector('.viewer-toolbar');
    const fit = document.getElementById('fit');
    const wire = document.getElementById('wire');
    const isolate = document.getElementById('isolate');
    const overlay = document.getElementById('folder-drop');
    const stage = document.querySelector('.stage');
    const hud = document.querySelector('.viewer-hud');
    const r = (el) => el ? el.getBoundingClientRect() : null;
    const cs = (el, props) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; props.forEach(p => o[p] = s[p]); return o; };
    return {
      title: document.getElementById('title')?.textContent,
      stepText: step?.textContent,
      curText: cur?.textContent,
      subtitle: (() => { const el = document.querySelector('.topbar-course-subtitle'); return el ? { html: el.outerHTML.slice(0,250), rect: r(el), cs: cs(el, ['display','visibility','opacity','color']) } : null; })(),
      toolbar: toolbar ? { html: toolbar.outerHTML.slice(0,300), rect: r(toolbar), cs: cs(toolbar, ['display','visibility','opacity','zIndex','position']) } : null,
      fit: fit ? { rect: r(fit), cs: cs(fit, ['display','visibility','opacity','backgroundColor','color']), text: fit.textContent } : null,
      wire: wire ? { rect: r(wire), cs: cs(wire, ['display','visibility','opacity']), text: wire.textContent } : null,
      isolateHidden: isolate?.classList?.contains('hidden'),
      overlay: overlay ? { className: overlay.className, rect: r(overlay), cs: cs(overlay, ['display','visibility','opacity','zIndex','pointerEvents']) } : null,
      stage: stage ? { rect: r(stage), cs: cs(stage, ['position','overflow','zIndex']) } : null,
      hud: hud ? { rect: r(hud), text: hud.textContent?.slice(0,80), cs: cs(hud, ['display','visibility','opacity']) } : null,
      modelTitle: document.getElementById('model-title')?.textContent,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
