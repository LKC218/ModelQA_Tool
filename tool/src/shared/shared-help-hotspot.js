/* 功能热点弹层：hover/focus 出示 GIF 说明（无框架，可被 esbuild 打进审核 runtime）。
   用法：mountHelpHotspot({ mount, topic, instanceId?, zIndex? });
   返回 { close, reposition, unmount, button, popover }，便于宿主做步骤切换清理。
   GIF/图标优先用 generated/help-focus-frames.js 内嵌 data URL，避免离线丢文件。 */
import { HELP_FRAMES, HELP_ICON_DATA } from '../generated/help-focus-frames.js';

const FOCUS_PART_GIF = '双击聚焦指南.gif';
const LOAD_PACKAGE_GIF = '导入审核包文件指南.gif';

export const FOCUS_PART_TOPIC = {
  id: 'focus-part',
  title: '聚焦零件',
  body: '双击零件，其余半透明，只突出当前零件。',
  tips: ['G 聚焦 / 退出', 'ESC 或「退出聚焦」还原'],
  base: './help/focus-part/',
  media: { file: FOCUS_PART_GIF, alt: '双击零件聚焦演示' },
  embedded: HELP_FRAMES || {},
  icon: HELP_ICON_DATA || './icon/问号.png',
};

export const LOAD_PACKAGE_TOPIC = {
  id: 'load-package',
  title: '加载审核包',
  body: '把解压后的审核包文件夹拖到虚线区，或点「选择审核包文件夹」。',
  tips: ['含 project.json', '不要只拖 models', 'ZIP 需先解压'],
  base: './help/focus-part/',
  media: { file: LOAD_PACKAGE_GIF, alt: '加载审核包文件夹演示' },
  embedded: HELP_FRAMES || {},
  icon: HELP_ICON_DATA || './icon/问号.png',
};

function resolveSrc(topic) {
  const file = topic.media?.file;
  return topic.embedded?.[file] || `${topic.base}${file}`;
}

/**
 * @param {{ mount: Element, topic?: object, instanceId?: string, zIndex?: number }} options
 */
export function mountHelpHotspot(options = {}) {
  const mount = options.mount;
  const topic = options.topic || FOCUS_PART_TOPIC;
  const instanceId = options.instanceId || 'default';
  // default 沿用历史 id，兼容既有冒烟探针与查询
  const btnId = instanceId === 'default' ? 'help-hotspot-btn' : `help-hotspot-btn-${instanceId}`;
  const popId = instanceId === 'default' ? 'help-hotspot-pop' : `help-hotspot-pop-${instanceId}`;
  if (!mount || document.getElementById(btnId)) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = btnId;
  btn.className = 'help-hotspot';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', popId);
  btn.title = `${topic.title} 操作说明`;
  const iconSrc = topic.icon || './icon/问号.png';
  btn.style.setProperty('--help-icon', `url("${iconSrc}")`);
  btn.innerHTML = `<span class="help-hotspot-icon" aria-hidden="true"></span><span class="sr-only">操作说明</span>`;

  const pop = document.createElement('div');
  pop.id = popId;
  pop.className = 'help-hotspot-pop hidden';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', topic.title);
  if (options.zIndex != null) pop.style.zIndex = String(options.zIndex);
  pop.innerHTML = `
    <div class="help-hotspot-media">
      <img class="help-hotspot-img" alt="" draggable="false" />
    </div>
    <div class="help-hotspot-meta">
      <div class="help-hotspot-title-row">
        <strong class="help-hotspot-title"></strong>
        <button type="button" class="help-hotspot-close" aria-label="关闭">×</button>
      </div>
      <p class="help-hotspot-body"></p>
      <p class="help-hotspot-tips"></p>
    </div>
  `;

  mount.append(btn);
  document.body.append(pop);

  let openTimer = 0;
  let closeTimer = 0;
  let disposed = false;

  const img = pop.querySelector('.help-hotspot-img');
  const titleEl = pop.querySelector('.help-hotspot-title');
  const bodyEl = pop.querySelector('.help-hotspot-body');
  const tipsEl = pop.querySelector('.help-hotspot-tips');

  function renderMedia() {
    img.src = resolveSrc(topic);
    img.alt = topic.media?.alt || topic.title;
    titleEl.textContent = topic.title;
    bodyEl.textContent = topic.body;
    tipsEl.textContent = (topic.tips || []).join(' · ');
  }

  function place() {
    if (disposed || pop.classList.contains('hidden')) return;
    const r = btn.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    // 卡片/左栏标题旁：优先向右弹，避免被侧栏裁切
    let left = r.right + 8;
    if (left + w > window.innerWidth - 12) left = r.left + r.width / 2 - w / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    let top = r.bottom + 8;
    if (top + 280 > window.innerHeight) top = Math.max(12, r.top - 8 - 260);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.maxHeight = `${Math.max(200, window.innerHeight - top - 12)}px`;
  }

  function open() {
    if (disposed) return;
    window.clearTimeout(closeTimer);
    renderMedia();
    pop.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    place();
  }

  function close() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    pop.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }

  function scheduleOpen() {
    window.clearTimeout(closeTimer);
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(open, 180);
  }

  function scheduleClose() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (!pop.matches(':hover') && !btn.matches(':hover') && document.activeElement !== btn) close();
    }, 220);
  }

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    if (pop.classList.contains('hidden')) return;
    // 先关本弹层，避免冒泡/捕获到宿主（如功能引导）的 ESC 关闭
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  function onResize() {
    place();
  }

  btn.addEventListener('mouseenter', scheduleOpen);
  btn.addEventListener('mouseleave', scheduleClose);
  btn.addEventListener('focus', () => open());
  btn.addEventListener('blur', scheduleClose);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pop.classList.contains('hidden')) open();
    else close();
  });

  pop.addEventListener('mouseenter', () => window.clearTimeout(closeTimer));
  pop.addEventListener('mouseleave', scheduleClose);
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.help-hotspot-close')) close();
  });

  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', onResize);

  function unmount() {
    disposed = true;
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', onResize);
    btn.remove();
    pop.remove();
  }

  renderMedia();
  close();

  return { close, reposition: place, unmount, button: btn, popover: pop };
}

/** 兼容旧调用：默认实例 id，与历史 DOM 查询一致 */
export function mountDefaultHelpHotspot(options = {}) {
  return mountHelpHotspot({ ...options, instanceId: options.instanceId || 'default' });
}
