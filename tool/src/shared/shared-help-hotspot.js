/* 功能热点弹层：hover/focus 出示 GIF 说明（无框架，可被 esbuild 打进审核 runtime）。
   用法：mountHelpHotspot({ mount, topic }); 内置 topic 见 FOCUS_PART_TOPIC。
   GIF/图标优先用 generated/help-focus-frames.js 内嵌 data URL，避免离线丢文件。 */
import { FOCUS_PART_FRAMES, HELP_ICON_DATA } from '../generated/help-focus-frames.js';

const GIF_FILE = '双击聚焦指南.gif';

export const FOCUS_PART_TOPIC = {
  id: 'focus-part',
  title: '聚焦零件',
  body: '双击零件，其余半透明，只突出当前零件。',
  tips: ['G 聚焦 / 退出', 'ESC 或「退出聚焦」还原'],
  base: './help/focus-part/',
  media: { file: GIF_FILE, alt: '双击零件聚焦演示' },
  embedded: FOCUS_PART_FRAMES || {},
  icon: HELP_ICON_DATA || './icon/问号.png',
};

const HOTSPOT_ID = 'help-hotspot-btn';
const POPOVER_ID = 'help-hotspot-pop';

function resolveSrc(topic) {
  const file = topic.media?.file;
  return topic.embedded?.[file] || `${topic.base}${file}`;
}

export function mountHelpHotspot(options = {}) {
  const mount = options.mount;
  const topic = options.topic || FOCUS_PART_TOPIC;
  if (!mount || document.getElementById(HOTSPOT_ID)) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = HOTSPOT_ID;
  btn.className = 'help-hotspot';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', POPOVER_ID);
  btn.title = `${topic.title} 操作说明`;
  const iconSrc = topic.icon || './icon/问号.png';
  btn.style.setProperty('--help-icon', `url("${iconSrc}")`);
  btn.innerHTML = `<span class="help-hotspot-icon" aria-hidden="true"></span><span class="sr-only">操作说明</span>`;

  const pop = document.createElement('div');
  pop.id = POPOVER_ID;
  pop.className = 'help-hotspot-pop hidden';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', topic.title);
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
    const r = btn.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    // 左栏标题旁：优先向右弹，避免被侧栏裁切
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
    window.clearTimeout(closeTimer);
    renderMedia();
    pop.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    place();
  }

  function close() {
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

  btn.addEventListener('mouseenter', scheduleOpen);
  btn.addEventListener('mouseleave', scheduleClose);
  btn.addEventListener('focus', () => open());
  btn.addEventListener('blur', scheduleClose);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (pop.classList.contains('hidden')) open();
    else close();
  });

  pop.addEventListener('mouseenter', () => window.clearTimeout(closeTimer));
  pop.addEventListener('mouseleave', scheduleClose);
  pop.addEventListener('click', (e) => {
    if (e.target.closest('.help-hotspot-close')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.classList.contains('hidden')) close();
  });

  window.addEventListener('resize', () => {
    if (!pop.classList.contains('hidden')) place();
  });

  renderMedia();
  close();
}
