/* mobile v1.2.3 probe: peek handle restyle + sidebar mask + marquee + mobile onboarding.
   Prereq: npm run dev (5173). Run: node probe-mobile-v123.cjs (OUT=outdir). */
const fs = require('fs');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const OUT = process.env.OUT || '.';
const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const assert = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; };

const pageSrc = fs.readFileSync('G:/项目/模型审核工具/tool/public/reviewer-preview.html', 'utf8');

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-proxy-server'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/reviewer-preview.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageSrc }));
    await page.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);

    /* E. mobile onboarding: 8-step sequence, first step = 选课程 */
    const onb = await page.evaluate(() => {
      const root = document.getElementById('onb-root');
      if (!root) return { open: false };
      return {
        open: root.classList.contains('is-open'),
        badge: root.querySelector('[data-onb-badge]')?.textContent || '',
        title: root.querySelector('[data-onb-title]')?.textContent || '',
      };
    });
    assert(onb.open, 'onb: mobile onboarding auto-started');
    assert(onb.badge === '01 / 09', `onb: 9-step full sequence (badge "${onb.badge}")`);
    assert(onb.title === '拖入审核包', `onb: first step is folder (full flow, got "${onb.title}")`);
    /* step to models (index 5 in full flow): click 下一步 x5 → drawer auto-opens, hole on sidebar.left */
    for (let i = 0; i < 5; i++) {
      await page.click('[data-onb-next]');
      await page.waitForTimeout(450);
    }
    const onbModels = await page.evaluate(() => {
      const root = document.getElementById('onb-root');
      const left = document.querySelector('.sidebar.left');
      return {
        title: root.querySelector('[data-onb-title]')?.textContent || '',
        badge: root.querySelector('[data-onb-badge]')?.textContent || '',
        drawerOpen: left?.classList.contains('is-open') || false,
        maskOn: document.getElementById('sidebar-mask')?.classList.contains('is-on') || false,
      };
    });
    assert(onbModels.title === '选模型与层级', `onb: step5 title (got "${onbModels.title}")`);
    assert(onbModels.drawerOpen, 'onb: left drawer auto-opened on models step');
    assert(onbModels.maskOn, 'onb: sidebar mask visible while drawer open');
    /* onb: next button fully inside viewport on drawer step */
    const btnInVp = await page.evaluate(() => {
      const btn = document.querySelector('[data-onb-next]');
      const r = btn.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight, enabled: !btn.disabled };
    });
    assert(btnInVp.enabled && btnInVp.top >= 0 && btnInVp.bottom <= btnInVp.vh - 4, `onb: next button inside viewport (${Math.round(btnInVp.top)}~${Math.round(btnInVp.bottom)}/${btnInVp.vh})`);
    /* robustness: force drawer off-screen (inline transform beats class) → resize re-render → card must stay in viewport */
    await page.evaluate(() => {
      document.querySelector('.sidebar.left').style.transform = 'translateY(130%)';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(500);
    const fallback = await page.evaluate(() => {
      const card = document.querySelector('[data-onb-card]');
      const btn = document.querySelector('[data-onb-next]');
      const r = card.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return { cardTop: r.top, cardBottom: r.bottom, vh: window.innerHeight, btnVisible: b.top >= 0 && b.bottom <= window.innerHeight };
    });
    assert(fallback.cardTop >= 0 && fallback.cardBottom <= fallback.vh - 4, `onb: offscreen target → card stays in viewport (${Math.round(fallback.cardTop)}~${Math.round(fallback.cardBottom)}/${fallback.vh})`);
    assert(fallback.btnVisible, 'onb: next button clickable after offscreen fallback');
    await page.click('[data-onb-next]');
    await page.waitForTimeout(400);
    const badge6 = await page.evaluate(() => document.querySelector('[data-onb-badge]')?.textContent || '');
    assert(badge6 === '07 / 09', `onb: can advance after fallback (badge "${badge6}")`);
    await page.evaluate(() => { document.querySelector('.sidebar.left').style.transform = ''; });
    /* close onboarding via mask? mask click closes drawer not onboarding; use skip */
    await page.click('[data-onb-skip]');
    await page.waitForTimeout(200);

    /* C. mask interaction: ensure drawer closed first (models step auto-opened it), then reopen via tabs */
    await page.evaluate(() => document.getElementById('sidebar-mask')?.click());
    await page.waitForTimeout(320);
    await page.click('.mobile-tabs [data-mobile-panel="left"]');
    await page.waitForTimeout(320);
    const maskOn = await page.evaluate(() => {
      const m = document.getElementById('sidebar-mask');
      return { exists: !!m, on: m?.classList.contains('is-on'), opacity: m ? getComputedStyle(m).opacity : '', leftOpen: document.querySelector('.sidebar.left')?.classList.contains('is-open') };
    });
    assert(maskOn.exists && maskOn.on && parseFloat(maskOn.opacity) > 0.15, `mask: shown with drawer (opacity ${maskOn.opacity})`);
    assert(maskOn.leftOpen, 'mask: left drawer open');
    await page.evaluate(() => document.getElementById('sidebar-mask').click());
    await page.waitForTimeout(320);
    const maskOff = await page.evaluate(() => ({
      on: document.getElementById('sidebar-mask')?.classList.contains('is-on'),
      leftOpen: document.querySelector('.sidebar.left')?.classList.contains('is-open'),
    }));
    assert(!maskOff.leftOpen && !maskOff.on, 'mask: click mask closes drawer + mask');

    /* A. peek handle restyle + toolbar clearance */
    const peek = await page.evaluate(() => {
      const handle = document.querySelector('.sheet-peek .sheet-peek-handle');
      const peekEl = document.querySelector('.sheet-peek');
      const tb = getComputedStyle(document.querySelector('.viewer-toolbar'));
      const h = handle ? getComputedStyle(handle) : null;
      const p = peekEl ? getComputedStyle(peekEl) : null;
      return {
        hw: h?.width, hh: h?.height, hr: h?.borderRadius, ht: h?.top,
        pw: p?.minHeight, pr: p?.borderRadius,
        tb,
      };
    });
    assert(peek.hw === '36px' && peek.hh === '4px', `peek: handle 36x4 (got ${peek.hw}x${peek.hh})`);
    assert(peek.hr === '999px', `peek: handle pill radius (got ${peek.hr})`);
    assert(peek.pw === '52px', `peek: min-height 52 (got ${peek.pw})`);
    assert((peek.pr || '').startsWith('16px'), `peek: top radius 16 (got ${peek.pr})`);
    assert(peek.tb.bottom === '60px', `toolbar: bottom 60px (got ${peek.tb.bottom})`);

    /* D. marquee consistency: any strong with .course-card-scroll has --scroll-x; non-overflow strongs have no span */
    const marquee = await page.evaluate(() => {
      const strongs = [...document.querySelectorAll('.course-card strong')];
      const withSpan = strongs.filter((s) => s.querySelector('.course-card-scroll'));
      const overflowCls = strongs.filter((s) => s.classList.contains('is-overflow'));
      const varsOk = withSpan.every((s) => {
        const span = s.querySelector('.course-card-scroll');
        const cs = getComputedStyle(span);
        return (span.style.getPropertyValue('--scroll-x') || '').endsWith('px') && cs.animationName === 'course-title-scroll';
      });
      return { total: strongs.length, withSpan: withSpan.length, overflowCls: overflowCls.length, varsOk, names: strongs.map((s) => s.textContent.slice(0, 12)) };
    });
    assert(marquee.withSpan === marquee.overflowCls && marquee.varsOk, `marquee: span/overflow consistent (span=${marquee.withSpan}/${marquee.total}) vars=${marquee.varsOk}`);
    console.log(`INFO - marquee triggered on ${marquee.withSpan}/${marquee.total} cards: ${marquee.names.join(' | ')}`);

    await page.screenshot({ path: `${OUT}/mobile-v123-390.png` });
    await ctx.close();

    /* desktop sanity: onboarding stays 10-step online flow, no mask interaction */
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    await page2.route('**/reviewer-preview.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageSrc }));
    await page2.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(1500);
    const donb = await page2.evaluate(() => {
      const root = document.getElementById('onb-root');
      return { badge: root?.querySelector('[data-onb-badge]')?.textContent || '', title: root?.querySelector('[data-onb-title]')?.textContent || '' };
    });
    assert(donb.badge === '01 / 11', `desktop: full 11-step flow unchanged (badge "${donb.badge}")`);
    assert(donb.title === '拖入审核包', `desktop: first step unchanged (got "${donb.title}")`);
    await page2.click('[data-onb-skip]');
    await page2.waitForTimeout(400);
    const dpeek = await page2.evaluate(() => {
      const el = document.getElementById('sheet-peek');
      return { display: el ? getComputedStyle(el).display : 'missing' };
    });
    assert(dpeek.display === 'none', `desktop 1280: sheet-peek hidden (got ${dpeek.display})`);
    await ctx2.close();

    /* tablet 768: peek must stay hidden even without .hidden class (root-cause guard) */
    const ctx3 = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page3 = await ctx3.newPage();
    await page3.route('**/reviewer-preview.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageSrc }));
    await page3.goto('http://localhost:5173/reviewer-preview.html', { waitUntil: 'domcontentloaded' });
    await page3.waitForTimeout(1400);
    const onb3 = await page3.$('#onb-root');
    if (onb3) await page3.evaluate(() => document.getElementById('onb-root')?.remove());
    const tpeek = await page3.evaluate(() => {
      const el = document.getElementById('sheet-peek');
      el?.classList.remove('hidden');
      return el ? getComputedStyle(el).display : 'missing';
    });
    assert(tpeek === 'none', `tablet 768: sheet-peek hidden even without .hidden (got ${tpeek})`);
    await ctx3.close();
  } finally {
    await browser.close();
  }
  console.log('DONE probe-mobile-v123');
})();
