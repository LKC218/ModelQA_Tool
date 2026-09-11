/* 审核端功能引导：四边挖洞聚光灯 + 步骤门禁。每次启动均自动弹出；零依赖，可打进离线 runtime。 */

const STORAGE_KEY = 'an_reviewer_onboarding_v2';
const DONE = 'done';
const PKG_EVENT = 'an-reviewer:package-loaded';

function folderDropHidden() {
  const overlay = document.getElementById('folder-drop');
  return !!overlay && overlay.classList.contains('hidden');
}

function treePanel() {
  return document.getElementById('tree')?.closest('.panel') || document.getElementById('tree');
}

/** 9 步：一句动作 + 可选一句 tip */
export const ONBOARDING_STEPS = [
  {
    id: 'folder',
    title: '拖入审核包',
    body: '把审核包文件夹拖到这里',
    tip: '含 project.json，不要只拖 models',
    waiting: '先拖入审核包',
    target: () => {
      const overlay = document.getElementById('folder-drop');
      const card = document.querySelector('.folder-drop-card');
      if (card && overlay && !overlay.classList.contains('hidden')) return card;
      return document.getElementById('folder');
    },
    isReady: folderDropHidden,
    autoAdvance: true,
    primary: '下一步',
  },
  {
    id: 'course',
    title: '选课程',
    body: '点顶部卡片，选要审的课程',
    tip: '卡片上的 0/4 是进度',
    target: () => document.getElementById('review-course-cards') || document.querySelector('.course-rail'),
    primary: '下一步',
  },
  {
    id: 'course-models',
    title: '选模型',
    body: '在左栏点模型，切换审核对象',
    tip: '黄点 = 未结论',
    target: () => document.getElementById('review-models')?.closest('.course-model-panel')
      || document.getElementById('review-models')
      || document.querySelector('.course-model-panel'),
    primary: '下一步',
  },
  {
    id: 'outline',
    title: '模型层级',
    body: '单击零件，选中要看的部位',
    tip: '可搜索零件名',
    target: treePanel,
    primary: '下一步',
  },
  {
    id: 'outline-isolate',
    title: '只看这个零件',
    body: '双击零件，聚焦当前',
    tip: '再双击、G 或 ESC 退出',
    target: treePanel,
    primary: '下一步',
  },
  {
    id: 'viewport-tools',
    title: '看视口',
    body: '拖拽旋转，滚轮缩放',
    tip: '「还原」回默认视角',
    target: () => document.querySelector('.viewer-toolbar') || document.getElementById('fit'),
    primary: '下一步',
  },
  {
    id: 'issue',
    title: '记问题',
    body: '标状态，写一句问题',
    tip: '绑定当前零件更好定位',
    target: () => document.getElementById('issue-text')?.closest('.panel') || document.getElementById('issues'),
    primary: '下一步',
  },
  {
    id: 'conclude',
    title: '定结论',
    body: '选通过 / 待改 / 阻断',
    tip: '可补一句说明',
    target: () => document.getElementById('model-status')?.closest('.panel') || document.getElementById('model-status'),
    primary: '下一步',
  },
  {
    id: 'export',
    title: '导出 ZIP',
    body: '点「导出已审 ZIP」交回开发方',
    tip: '',
    target: () => document.getElementById('export-zip'),
    primary: '完成',
  },
];

const STYLE = `
/* 根层不拦截；四边遮罩单独吃点击，高亮洞内可直接操作页面 */
.onb-root { position: fixed; inset: 0; z-index: 1000; pointer-events: none; display: none; }
.onb-root.is-open { display: block; }
.onb-panel {
  position: absolute;
  background: color-mix(in srgb, var(--bg, #f4f7f5) 38%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: auto;
  transition: top 240ms var(--ease-out, ease), left 240ms var(--ease-out, ease), width 240ms var(--ease-out, ease), height 240ms var(--ease-out, ease);
}
@supports not (backdrop-filter: blur(6px)) {
  .onb-panel { background: color-mix(in srgb, var(--bg, #f4f7f5) 62%, transparent); backdrop-filter: none; }
}
.onb-ring {
  position: absolute;
  border-radius: var(--radius, 10px);
  box-shadow: inset 0 0 0 2px var(--accent, #2f9b6a);
  pointer-events: none;
  transition: top 240ms var(--ease-out, ease), left 240ms var(--ease-out, ease), width 240ms var(--ease-out, ease), height 240ms var(--ease-out, ease);
}
.onb-ring.is-pulse { animation: onb-pulse 600ms var(--ease-out, ease) 1; }
@keyframes onb-pulse {
  0% { box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 0 var(--accent-soft, rgba(47,155,106,.4)); }
  60% { box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 10px transparent; }
  100% { box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 0 transparent; }
}
.onb-progress {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: color-mix(in srgb, var(--line, #d5e0d9) 70%, transparent);
  overflow: hidden;
  z-index: 2;
  pointer-events: none;
}
.onb-progress > i {
  display: block; height: 100%; width: 0%;
  background: var(--accent, #2f9b6a);
  transition: width 240ms var(--ease-out, ease);
}
.onb-card {
  position: absolute;
  z-index: 3;
  width: min(340px, calc(100vw - 24px));
  display: grid;
  gap: 10px;
  padding: 16px 16px 14px;
  border: 1px solid var(--line, #d5e0d9);
  border-radius: var(--radius, 10px);
  background: var(--panel, #fff);
  color: var(--text, #1a2420);
  box-shadow: 0 12px 32px var(--shadow-color, rgba(0,0,0,.16));
  animation: onb-card-in 240ms var(--ease-out, ease);
  pointer-events: auto;
}
@keyframes onb-card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.onb-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.onb-step-badge {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--accent, #2f9b6a); font-size: 11px; font-weight: 700; letter-spacing: .04em;
}
.onb-skip {
  border: 0; background: transparent; color: var(--muted, #5c6b63);
  font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: 6px;
}
.onb-skip:hover { color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); }
.onb-card h3 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
.onb-card p { margin: 0; color: var(--muted, #5c6b63); font-size: 12px; line-height: 1.55; }
.onb-card .onb-tip { color: var(--dim, #78817b); font-size: 11px; }
.onb-card .onb-tip.is-wait { color: var(--accent, #2f9b6a); font-weight: 600; }
.onb-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.onb-actions-right { display: flex; align-items: center; gap: 8px; }
.onb-btn {
  min-height: 32px; padding: 0 12px;
  border: 1px solid var(--line, #d5e0d9); border-radius: 7px;
  background: var(--card, #eef3f0); color: var(--text);
  font-size: 12px; font-weight: 700; cursor: pointer;
}
.onb-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.onb-btn.primary {
  border-color: var(--accent, #2f9b6a);
  background: var(--accent, #2f9b6a);
  color: #fff;
}
[data-theme="dark"] .onb-btn.primary { color: #211807; }
.onb-btn.primary:hover:not(:disabled) { filter: brightness(1.05); color: #fff; }
[data-theme="dark"] .onb-btn.primary:hover:not(:disabled) { color: #211807; }
.onb-btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.onb-btn.ghost:hover:not(:disabled) { color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); border-color: transparent; }
.onb-btn:disabled { opacity: .45; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .onb-panel, .onb-ring, .onb-progress > i { transition: none; }
  .onb-ring.is-pulse { animation: none; }
  .onb-card { animation: none; }
}
.onb-help-menu {
  position: fixed;
  z-index: 1001;
  min-width: 160px;
  padding: 6px;
  border: 1px solid var(--line, #d5e0d9);
  border-radius: var(--radius-sm, 6px);
  background: var(--panel, #fff);
  box-shadow: 0 10px 28px var(--shadow-color, rgba(0,0,0,.16));
  display: grid;
  gap: 2px;
  pointer-events: auto;
}
.onb-help-menu button {
  display: flex; align-items: center; min-height: 32px; padding: 0 10px;
  border: 0; border-radius: 4px; background: transparent; color: var(--text);
  font-size: 12px; font-weight: 700; text-align: left; cursor: pointer;
}
.onb-help-menu button:hover { background: var(--card, #eef3f0); }
`;

function ensureStyle() {
  let el = document.getElementById('onb-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'onb-style';
    document.head.append(el);
  }
  el.textContent = STYLE;
}

function readDone() {
  try { return localStorage.getItem(STORAGE_KEY) === DONE; } catch { return false; }
}

function writeDone() {
  try { localStorage.setItem(STORAGE_KEY, DONE); } catch { /* ignore */ }
}

function clearDone() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** 先把目标滚进视口（含可滚祖先），再双 rAF 后量测，避免侧栏裁切导致高亮错位 */
function ensureTargetVisible(el) {
  return new Promise((resolve) => {
    if (!el) { resolve(); return; }
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    } catch { /* ignore */ }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function holeRect(rect, pad = 10) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = Math.min(vw, rect.right + pad);
  const bottom = Math.min(vh, rect.bottom + pad);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function layoutPanels(panels, hole) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const [t, b, l, r] = panels;
  // 上
  t.style.left = '0px'; t.style.top = '0px';
  t.style.width = `${vw}px`; t.style.height = `${hole.top}px`;
  // 下
  b.style.left = '0px'; b.style.top = `${hole.bottom}px`;
  b.style.width = `${vw}px`; b.style.height = `${Math.max(0, vh - hole.bottom)}px`;
  // 左
  l.style.left = '0px'; l.style.top = `${hole.top}px`;
  l.style.width = `${hole.left}px`; l.style.height = `${hole.height}px`;
  // 右
  r.style.left = `${hole.right}px`; r.style.top = `${hole.top}px`;
  r.style.width = `${Math.max(0, vw - hole.right)}px`; r.style.height = `${hole.height}px`;
}

function placeCard(card, hole) {
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cw = card.offsetWidth || 340;
  const ch = card.offsetHeight || 180;
  let left = hole.left + hole.width / 2 - cw / 2;
  let top = hole.bottom + gap;
  if (top + ch > vh - 12) top = hole.top - ch - gap;
  if (top < 12) top = Math.min(Math.max(12, (vh - ch) / 2), vh - ch - 12);
  left = Math.min(Math.max(12, left), vw - cw - 12);
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
  card.style.transform = '';
}

function applyRing(ring, hole, pulse) {
  ring.hidden = false;
  ring.style.top = `${Math.round(hole.top)}px`;
  ring.style.left = `${Math.round(hole.left)}px`;
  ring.style.width = `${Math.round(hole.width)}px`;
  ring.style.height = `${Math.round(hole.height)}px`;
  if (pulse) {
    ring.classList.remove('is-pulse');
    void ring.offsetWidth;
    ring.classList.add('is-pulse');
  }
}

function fullBleedPanels(panels) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const [t, b, l, r] = panels;
  t.style.cssText = `left:0;top:0;width:${vw}px;height:${vh}px`;
  b.style.cssText = 'left:0;top:0;width:0;height:0';
  l.style.cssText = 'left:0;top:0;width:0;height:0';
  r.style.cssText = 'left:0;top:0;width:0;height:0';
}

/**
 * @param {{ autoStart?: boolean }} [options]
 */
export function initReviewerOnboarding(options = {}) {
  ensureStyle();
  const steps = ONBOARDING_STEPS;
  let index = 0;
  let open = false;
  let root = null;
  let helpMenu = null;
  let resizeBound = false;

  const autoStart = options.autoStart !== false;

  function ensureDom() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'onb-root';
    root.id = 'onb-root';
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '功能引导');
    root.innerHTML = `
      <div class="onb-panel" data-onb-t></div>
      <div class="onb-panel" data-onb-b></div>
      <div class="onb-panel" data-onb-l></div>
      <div class="onb-panel" data-onb-r></div>
      <div class="onb-ring" data-onb-ring hidden></div>
      <div class="onb-progress" data-onb-progress><i></i></div>
      <div class="onb-card" data-onb-card>
        <div class="onb-card-top">
          <span class="onb-step-badge" data-onb-badge>01 / 0${steps.length}</span>
          <button type="button" class="onb-skip" data-onb-skip>跳过引导</button>
        </div>
        <h3 data-onb-title></h3>
        <p data-onb-body></p>
        <p class="onb-tip" data-onb-tip></p>
        <div class="onb-actions">
          <button type="button" class="onb-btn ghost" data-onb-prev>上一步</button>
          <div class="onb-actions-right">
            <button type="button" class="onb-btn primary" data-onb-next>下一步</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    root.querySelector('[data-onb-skip]').onclick = () => close(false);
    root.querySelector('[data-onb-prev]').onclick = () => go(index - 1);
    root.querySelector('[data-onb-next]').onclick = () => tryNext();
    return root;
  }

  function panels() {
    return [
      root.querySelector('[data-onb-t]'),
      root.querySelector('[data-onb-b]'),
      root.querySelector('[data-onb-l]'),
      root.querySelector('[data-onb-r]'),
    ];
  }

  function stepReady(step) {
    if (!step?.isReady) return true;
    try { return !!step.isReady(); } catch { return false; }
  }

  function tryNext() {
    const step = steps[index];
    if (index >= steps.length - 1) {
      if (!stepReady(step)) {
        render(true);
        return;
      }
      close(true);
      return;
    }
    if (!stepReady(step)) {
      render(true);
      return;
    }
    go(index + 1);
  }

  async function render(pulse = true) {
    ensureDom();
    const step = steps[index];
    const total = steps.length;
    const badge = root.querySelector('[data-onb-badge]');
    const title = root.querySelector('[data-onb-title]');
    const body = root.querySelector('[data-onb-body]');
    const tip = root.querySelector('[data-onb-tip]');
    const prev = root.querySelector('[data-onb-prev]');
    const next = root.querySelector('[data-onb-next]');
    const bar = root.querySelector('[data-onb-progress] > i');
    const ready = stepReady(step);

    badge.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    title.textContent = step.title;
    body.textContent = step.body;
    prev.disabled = index === 0;
    prev.hidden = index === 0;
    next.textContent = step.primary || (index === total - 1 ? '完成' : '下一步');
    // 门禁步骤未完成时禁用主按钮；完成后由包加载事件自动进入下一步
    next.disabled = !ready;
    bar.style.width = `${Math.round(((index + 1) / total) * 100)}%`;

    if (!ready && step.waiting) {
      tip.textContent = step.waiting;
      tip.hidden = false;
      tip.classList.add('is-wait');
    } else {
      tip.textContent = step.tip || '';
      tip.hidden = !step.tip;
      tip.classList.remove('is-wait');
    }

    const foundEl = (() => {
      try {
        return typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
      } catch { return null; }
    })();
    if (foundEl && foundEl.classList?.contains('hidden')) {
      renderSpot(null, pulse);
      return;
    }
    if (!foundEl) {
      renderSpot(null, pulse);
      return;
    }
    await ensureTargetVisible(foundEl);
    if (!open) return;
    const rect = foundEl.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      renderSpot(null, pulse);
      return;
    }
    renderSpot({ el: foundEl, rect }, pulse);
  }

  function renderSpot(found, pulse) {
    const ring = root.querySelector('[data-onb-ring]');
    const card = root.querySelector('[data-onb-card]');
    if (found) {
      const hole = holeRect(found.rect);
      layoutPanels(panels(), hole);
      applyRing(ring, hole, pulse);
      placeCard(card, hole);
    } else {
      ring.hidden = true;
      fullBleedPanels(panels());
      card.style.left = '50%';
      card.style.top = '50%';
      card.style.transform = 'translate(-50%, -50%)';
    }
  }

  function onResize() {
    if (!open) return;
    render(false);
  }

  function bindResize() {
    if (resizeBound) return;
    window.addEventListener('resize', onResize);
    resizeBound = true;
  }

  function unbindResize() {
    if (!resizeBound) return;
    window.removeEventListener('resize', onResize);
    resizeBound = false;
  }

  function onKey(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
    }
  }

  function onPackageLoaded() {
    if (!open) return;
    const step = steps[index];
    if (step?.autoAdvance && stepReady(step)) {
      if (index >= steps.length - 1) close(true);
      else go(index + 1);
    } else {
      render(false);
    }
  }

  function go(nextIndex) {
    index = Math.max(0, Math.min(steps.length - 1, nextIndex));
    render(true);
  }

  function openAt(startIndex = 0) {
    ensureDom();
    index = Math.max(0, Math.min(steps.length - 1, startIndex));
    open = true;
    root.classList.add('is-open');
    root.hidden = false;
    bindResize();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener(PKG_EVENT, onPackageLoaded);
    requestAnimationFrame(() => {
      render(true);
      const next = root.querySelector('[data-onb-next]');
      const skip = root.querySelector('[data-onb-skip]');
      (next && !next.disabled ? next : skip)?.focus({ preventScroll: true });
    });
  }

  function close(completed) {
    open = false;
    if (completed) writeDone();
    unbindResize();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener(PKG_EVENT, onPackageLoaded);
    if (root) {
      root.classList.remove('is-open');
      root.hidden = true;
    }
    closeHelpMenu();
  }

  function start() {
    openAt(0);
  }

  function closeHelpMenu() {
    helpMenu?.remove();
    helpMenu = null;
  }

  function toggleHelpMenu(anchor) {
    if (helpMenu) {
      closeHelpMenu();
      return;
    }
    helpMenu = document.createElement('div');
    helpMenu.className = 'onb-help-menu';
    helpMenu.id = 'onb-help-menu';
    helpMenu.innerHTML = `<button type="button" data-onb-replay>重新播放引导</button>`;
    document.body.appendChild(helpMenu);
    const rect = anchor.getBoundingClientRect();
    const mw = helpMenu.offsetWidth;
    helpMenu.style.top = `${Math.round(rect.bottom + 6)}px`;
    helpMenu.style.left = `${Math.round(Math.min(window.innerWidth - mw - 8, Math.max(8, rect.right - mw)))}px`;
    helpMenu.querySelector('[data-onb-replay]').onclick = () => {
      closeHelpMenu();
      start();
    };
    setTimeout(() => {
      const onDoc = (event) => {
        if (!helpMenu) return;
        if (helpMenu.contains(event.target) || anchor.contains(event.target)) return;
        closeHelpMenu();
        document.removeEventListener('pointerdown', onDoc, true);
      };
      document.addEventListener('pointerdown', onDoc, true);
    }, 0);
  }

  function bindHelpButton() {
    const btn = document.getElementById('onboarding-help');
    if (!btn) return;
    btn.onclick = () => toggleHelpMenu(btn);
  }

  bindHelpButton();
  const mo = new MutationObserver(() => {
    if (document.getElementById('onboarding-help')) bindHelpButton();
  });
  mo.observe(document.body, { childList: true, subtree: false });

  // 每次启动均自动弹出，不读 localStorage 完成态
  if (autoStart) {
    requestAnimationFrame(() => requestAnimationFrame(() => start()));
  }

  return {
    start,
    startFrom: openAt,
    destroy() {
      close(false);
      unbindResize();
      mo.disconnect();
      root?.remove();
      root = null;
    },
    isOpen: () => open,
    isDone: readDone,
    resetMemory: () => { clearDone(); },
  };
}
