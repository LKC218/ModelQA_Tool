/* ==========================================================================
   双端共享：界面设置（字体字号档位）
   - 机制与 data-theme 同构：html[data-fontsize] + localStorage，双端共用一个
     key（modelqa-fontsize）保持偏好一致。
   - 三档：小 sm（= 2026-09 前历史字号）/ 中 md（默认）/ 大 lg。
   - Token 定义在 shared-ui.css 的 :root[data-fontsize=...]。
   - 开发端：main-implementation.js `import { bindSettingsToggle } from '../shared/settings.js'`
   - 审核端：reviewer-implementation.js 同样引用，经 build-reviewer.mjs 打包。
   ========================================================================== */

const FONT_KEY = 'modelqa-fontsize';
const TIERS = ['sm', 'md', 'lg'];

export function currentFontsize() {
  try {
    const value = localStorage.getItem(FONT_KEY);
    return TIERS.includes(value) ? value : 'md';
  } catch { return 'md'; }
}

export function applyFontsize(next, persist = true) {
  const tier = TIERS.includes(next) ? next : 'md';
  document.documentElement.dataset.fontsize = tier;
  if (persist) { try { localStorage.setItem(FONT_KEY, tier); } catch { /* ignore */ } }
  return tier;
}

/* 模块加载即应用（早于两端 innerHTML 渲染），避免首帧字号闪烁 */
applyFontsize(currentFontsize(), false);

/* —— 设置抽屉（复用 .drawer 骨架），双端共用 —— */
/* opts.theme = { get: () => 'light'|'dark', set: (t) => void }：传入时抽屉渲染「主题」段；
   不传则与旧行为一致（仅字体字号），双端已有调用无需改动。 */
export function mountSettingsDrawer(opts = {}) {
  if (document.getElementById('app-settings')) return;
  const theme = opts.theme || null;
  document.body.insertAdjacentHTML('beforeend', `
<div class="drawer hidden" id="app-settings" role="dialog" aria-modal="true" aria-label="界面设置">
  <div class="drawer-mask" data-settings-close></div>
  <aside class="drawer-panel settings-panel">
    <div class="settings-head"><h2>设置</h2><button class="button" type="button" data-settings-close title="关闭" aria-label="关闭设置">✕</button></div>
    <section class="settings-section">
      <h3>显示</h3>
      <div class="settings-row">
        <div class="settings-row-label"><b>字体字号</b></div>
        <div class="fontsize-seg" role="radiogroup" aria-label="字体字号">
          <button type="button" data-fs="sm" role="radio" aria-checked="false">小</button>
          <button type="button" data-fs="md" role="radio" aria-checked="false">中</button>
          <button type="button" data-fs="lg" role="radio" aria-checked="false">大</button>
        </div>
      </div>
      ${theme ? `<div class="settings-row">
        <div class="settings-row-label"><b>主题</b></div>
        <div class="fontsize-seg theme-seg" role="radiogroup" aria-label="主题">
          <button type="button" data-theme-opt="light" role="radio" aria-checked="false">亮色</button>
          <button type="button" data-theme-opt="dark" role="radio" aria-checked="false">暗色</button>
        </div>
      </div>` : ''}
    </section>
  </aside>
</div>`);
  const root = document.getElementById('app-settings');
  const seg = root.querySelector('.fontsize-seg');
  const syncSeg = () => seg.querySelectorAll('button[data-fs]').forEach((btn) => {
    const on = btn.dataset.fs === currentFontsize();
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  seg.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-fs]');
    if (!btn) return;
    applyFontsize(btn.dataset.fs);
    syncSeg();
  });
  const themeSeg = root.querySelector('.theme-seg');
  const syncTheme = () => {
    if (!themeSeg || !theme) return;
    const current = theme.get();
    themeSeg.querySelectorAll('button[data-theme-opt]').forEach((btn) => {
      const on = btn.dataset.themeOpt === current;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  };
  if (themeSeg) themeSeg.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-theme-opt]');
    if (!btn) return;
    theme.set(btn.dataset.themeOpt);
    syncTheme();
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-settings-close]')) root.classList.add('hidden');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.classList.contains('hidden')) root.classList.add('hidden');
  });
  syncSeg();
  syncTheme();
}

export function toggleSettingsDrawer(opts = {}) {
  if (!document.getElementById('app-settings')) mountSettingsDrawer(opts);
  const root = document.getElementById('app-settings');
  root.classList.toggle('hidden');
  if (!root.classList.contains('hidden') && opts.theme) {
    const current = opts.theme.get();
    root.querySelectorAll('[data-theme-opt]').forEach((btn) => {
      const on = btn.dataset.themeOpt === current;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
}

export function bindSettingsToggle(button, opts = {}) {
  if (!button) return;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSettingsDrawer(opts);
  });
}
