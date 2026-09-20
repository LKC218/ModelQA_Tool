/* 审核端功能引导：四边挖洞聚光灯 + 步骤门禁。每次打开页面自动完整播放一遍（帮助菜单可手动重播）；
   file:// 本地打开为完整流（含「拖入审核包」），服务器托管（http/https）从「选课程」开始；零外部 npm 依赖，可打进离线 runtime。
   ≤600 视口走 MOBILE_SEQUENCE 移动专属序列（抽屉/更多菜单目标 + 自动开抽屉），PC 端序列与文案不变。
   第 1 步在步进徽标旁挂「加载审核包」问号热点（复用 shared-help-hotspot，仅完整流程存在）。 */
import { mountHelpHotspot, LOAD_PACKAGE_TOPIC } from '../shared/shared-help-hotspot.js';

const STORAGE_KEY = 'an_reviewer_onboarding_v2';
const DONE = 'done';
const SKIPPED = 'skipped';
const PKG_EVENT = 'an-reviewer:package-loaded';

/** 完整 9 步：仅 file:// 本地打开，或预览页显式声明 __AN_ONB_FULL__；服务器托管（http/https）从「选课程」开始 */
const FULL_FLOW = location.protocol === 'file:' || window.__AN_ONB_FULL__ === true;

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
    id: 'viewport',
    title: '看视口',
    body: '拖拽旋转，滚轮缩放',
    tip: '双指缩放',
    target: () => document.querySelector('.stage') || document.getElementById('canvas'),
    primary: '下一步',
  },
  {
    id: 'viewport-toolbar',
    title: '视口工具',
    body: '「还原」回默认视角，线框 / 爆炸 / 标注辅助查看',
    tip: '',
    target: () => document.querySelector('.viewer-toolbar') || document.getElementById('fit'),
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
    primary: '下一步',
  },
  {
    /* 仅在线托管（http/https 且 payload 带 submitToken）替代「导出 ZIP」步骤 */
    id: 'submit',
    title: '回传审核结果',
    body: '点「回传审核结果」，确认后交回开发方',
    tip: '回传中按钮内会显示进度',
    target: () => document.getElementById('submit-review') || document.getElementById('export-zip'),
    primary: '下一步',
  },
  {
    /* 收官工具介绍：设置按钮全场景可见，不受在线/本地分叉影响 */
    id: 'settings',
    title: '界面设置',
    body: '点齿轮可切换明暗主题与字号大小',
    tip: '设置双端同步记忆',
    target: () => document.getElementById('app-settings-toggle'),
    primary: '完成',
  },
];

/* —— 移动端（≤600）专属序列：目标都收进抽屉与「更多」菜单，models/review 步自动开抽屉后再挖洞。
   PC 端沿用 ONBOARDING_STEPS 原序列与文案，零改动。 —— */
const MOBILE_SEQUENCE = ['course', 'peek', 'viewport', 'viewport-toolbar', 'models', 'review', 'more', 'settings'];
const MOBILE_STEPS = {
  peek: {
    id: 'peek',
    title: '底部摘要条',
    body: '这里显示当前模型和结论状态',
    tip: '点一下可打开审核面板',
    target: () => document.getElementById('sheet-peek'),
    primary: '下一步',
  },
  models: {
    id: 'models',
    title: '选模型与层级',
    body: '「层级」抽屉里点模型切换，点零件选中部位',
    tip: '可搜索零件名',
    onEnter: 'left',
    target: () => document.querySelector('.sidebar.left') || treePanel(),
    primary: '下一步',
  },
  review: {
    id: 'review',
    title: '记问题定结论',
    body: '「审核」抽屉里标状态、写问题、定结论',
    tip: '绑定当前零件更好定位',
    onEnter: 'right',
    target: () => document.querySelector('.sidebar.right') || document.getElementById('issues'),
    primary: '下一步',
  },
  more: {
    id: 'more',
    title: '导出与回传',
    body: '点顶栏「更多」，从菜单导出 ZIP 或回传结果',
    tip: '',
    target: () => document.getElementById('mobile-more'),
    primary: '下一步',
  },
};

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
.onb-card-top-left { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.onb-step-badge {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--accent, #2f9b6a); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .04em;
}
.onb-help-slot { display: inline-flex; align-items: center; flex: 0 0 auto; }
.onb-help-slot[hidden] { display: none !important; }
.onb-help-slot .help-hotspot { width: 18px; height: 18px; }
.onb-help-slot .help-hotspot-icon { width: 12px; height: 12px; }
.onb-skip {
  border: 0; background: transparent; color: var(--muted, #5c6b63);
  font-size: var(--fs-base); font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: 6px;
}
.onb-skip:hover { color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); }
.onb-card h3 { margin: 0; font-size: var(--fs-xl); font-weight: 700; line-height: 1.3; }
.onb-card p { margin: 0; color: var(--muted, #5c6b63); font-size: var(--fs-base); line-height: 1.55; }
.onb-card .onb-tip { color: var(--dim, #78817b); font-size: var(--fs-xs); }
.onb-card .onb-tip.is-wait { color: var(--accent, #2f9b6a); font-weight: 600; }
.onb-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.onb-actions-right { display: flex; align-items: center; gap: 8px; }
.onb-btn {
  min-height: 32px; padding: 0 12px;
  border: 1px solid var(--line, #d5e0d9); border-radius: 7px;
  background: var(--card, #eef3f0); color: var(--text);
  font-size: var(--fs-base); font-weight: 700; cursor: pointer;
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
  font-size: var(--fs-base); font-weight: 700; text-align: left; cursor: pointer;
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
  try { const v = localStorage.getItem(STORAGE_KEY); return v === DONE || v === SKIPPED; } catch { return false; }
}

function writeDone(kind = DONE) {
  try { localStorage.setItem(STORAGE_KEY, kind); } catch { /* ignore */ }
}

function clearDone() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * 把目标滚进视口后再量测。只滚动真正可滚的祖先（computed overflowY 为 auto/scroll
 * 且确有溢出），跳过 overflow:hidden 容器——原生 scrollIntoView 会把 overflow:hidden
 * 的 .stage 当作可程序滚动容器上滚内容，使左上角 HUD 越过容器顶边被裁切
 * （引导期间"模型标签贴边"的根因）。量测仍延后双 rAF，避免侧栏裁切导致高亮错位。
 */
function ensureTargetVisible(el) {
  return new Promise((resolve) => {
    if (!el) { resolve(); return; }
    try {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const cs = getComputedStyle(node);
        if (!/(auto|scroll)/.test(cs.overflowY)) continue;
        if (node.scrollHeight <= node.clientHeight) continue;
        const rect = el.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        const delta = (rect.top + rect.height / 2) - (box.top + box.height / 2);
        const max = node.scrollHeight - node.clientHeight;
        node.scrollTop = Math.min(max, Math.max(0, node.scrollTop + delta));
      }
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
  /* 底部仍溢出（洞贴底且上方也放不下）→ 视口内垂直居中兜底，保证「下一步」永远可点 */
  if (top + ch > vh - 12) top = Math.max(12, vh - ch - 12);
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
  /* 最后一步分叉：在线托管（可回传）走「回传审核结果」，本地/不可回传走「导出 ZIP」 */
  const canSubmit = !!(window.__AN_REVIEW_PAYLOAD__?.submitToken) && /^https?:$/.test(location.protocol);
  /* ≤600 走移动专属序列（目标收进抽屉/更多菜单 + 自动开抽屉）；PC 端序列与文案不变 */
  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  const byId = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.id, s]));
  const steps = isMobile
    ? (FULL_FLOW ? ['folder', ...MOBILE_SEQUENCE] : MOBILE_SEQUENCE).map((id) => MOBILE_STEPS[id] || byId[id])
    : (FULL_FLOW ? ONBOARDING_STEPS : ONBOARDING_STEPS.filter((s) => s.id !== 'folder'))
      .filter((s) => (s.id !== 'submit' || canSubmit) && (s.id !== 'export' || !canSubmit));
  let index = 0;
  let open = false;
  let root = null;
  let helpMenu = null;
  let resizeBound = false;
  /** @type {{ close: () => void, reposition: () => void, unmount: () => void } | null} */
  let helpHotspot = null;

  const autoStart = options.autoStart !== false;

  function closeHelpHotspotPop() {
    helpHotspot?.close();
  }

  function syncHelpHotspot() {
    if (!root) return;
    const slot = root.querySelector('[data-onb-help-slot]');
    if (!slot) return;
    const show = open && steps[index]?.id === 'folder';
    if (!show) {
      closeHelpHotspotPop();
      slot.hidden = true;
      return;
    }
    if (!helpHotspot && !slot.querySelector('.help-hotspot')) {
      helpHotspot = mountHelpHotspot({
        mount: slot,
        topic: LOAD_PACKAGE_TOPIC,
        instanceId: 'onb',
        zIndex: 1002,
      });
    }
    slot.hidden = false;
  }

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
          <div class="onb-card-top-left">
            <span class="onb-step-badge" data-onb-badge>01 / 0${steps.length}</span>
            <span class="onb-help-slot" data-onb-help-slot hidden></span>
          </div>
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

    syncHelpHotspot();

    /* 移动端抽屉步骤：先开对应抽屉，等 220ms 过渡结束后再量测挖洞 */
    if (step.onEnter) {
      try { options.mobilePanels?.[step.onEnter]?.(); } catch { /* ignore */ }
      await new Promise((resolve) => setTimeout(resolve, 260));
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
    /* 目标被移出视口（如抽屉关闭时 translateY(100%+12px) 的 sidebar，rect 宽高完好但不可见）
       时严禁挖洞：holeRect 会把屏幕外坐标 clamp 成贴底细洞，卡片被挤到屏幕外导致「下一步」不可点 */
    const vw0 = window.innerWidth;
    const vh0 = window.innerHeight;
    if (rect.bottom < 8 || rect.top > vh0 - 8 || rect.right < 8 || rect.left > vw0 - 8) {
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
      /* 居中用 left/top 计算而非 translate(-50%,-50%)：避免与入场动画的 transform 互相覆盖产生跳动 */
      card.style.transform = '';
      card.style.left = `${Math.round(Math.max(12, (window.innerWidth - card.offsetWidth) / 2))}px`;
      card.style.top = `${Math.round(Math.max(12, (window.innerHeight - card.offsetHeight) / 2))}px`;
    }
    helpHotspot?.reposition();
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
      // 帮助弹层已处理 ESC 时不再关闭引导
      const onbPop = document.getElementById('help-hotspot-pop-onb');
      if (onbPop && !onbPop.classList.contains('hidden')) {
        event.preventDefault();
        event.stopPropagation();
        closeHelpHotspotPop();
        return;
      }
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

  /** remember=false 供 destroy 等非用户行为调用，不写记忆 */
  function close(completed, remember = true) {
    open = false;
    if (completed) writeDone(DONE);
    else if (remember) writeDone(SKIPPED);
    unbindResize();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener(PKG_EVENT, onPackageLoaded);
    closeHelpHotspotPop();
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

  // 每次打开页面都自动完整播放一遍；「帮助 → 重新播放引导」仍可手动重播
  if (autoStart) {
    requestAnimationFrame(() => requestAnimationFrame(() => start()));
  }

  return {
    start,
    startFrom: openAt,
    destroy() {
      close(false, false);
      unbindResize();
      mo.disconnect();
      helpHotspot?.unmount();
      helpHotspot = null;
      root?.remove();
      root = null;
    },
    isOpen: () => open,
    isDone: readDone,
    resetMemory: () => { clearDone(); },
  };
}
