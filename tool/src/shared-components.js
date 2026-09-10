/* 双端共享渲染函数（纯 DOM 操作，无副作用，不引入 DOM 之外的依赖）。
   本模块会被 esbuild 打进审核端离线运行时，保持零依赖。
   差异一律通过 options 注入：徽章文案、回调与可选拖放钩子；共享类名见 shared-ui.css。 */

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

/* 统一空态模板：图标 + 标题 + 提示。 */
export function emptyState(icon, title, hint) {
  return `<div class="tree-empty"><div class="tree-empty-icon" aria-hidden="true">${icon}</div><p class="tree-empty-title">${esc(title)}</p>${hint ? `<p class="tree-empty-hint">${esc(hint)}</p>` : ''}</div>`;
}

/* 节点显示名：去掉 GLB 导出工具附加的 _Empty 后缀。 */
export function nodeDisplayName(node) {
  return (node.name || '未命名节点').replace(/_Empty$/i, '') || '未命名节点';
}

/* 模型层级树：缩进连线 + 类型图标 + Empty 徽标 + 选中态。 */
export function renderTree(container, root, { selected = null, onSelect = () => {} } = {}) {
  if (!root) return;
  container.innerHTML = '';
  root.traverse((node) => {
    if (node === root) return;
    let depth = 0;
    for (let item = node.parent; item && item !== root; item = item.parent) depth++;
    const kind = node.isMesh ? 'mesh' : (!node.children || node.children.length === 0 ? 'empty' : 'group');
    const icon = kind === 'mesh' ? '◆' : kind === 'empty' ? '◇' : '◈';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tree-node tree-${kind}${selected === node ? ' active' : ''}`;
    button.title = node.name || '未命名节点';
    const guides = document.createElement('span');
    guides.className = 'tree-guides';
    guides.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < depth; i++) guides.appendChild(document.createElement('i'));
    const iconSpan = document.createElement('span');
    iconSpan.className = 'tree-icon';
    iconSpan.textContent = icon;
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = nodeDisplayName(node);
    button.append(guides, iconSpan, label);
    if (kind === 'empty') {
      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = 'Empty';
      button.appendChild(badge);
    }
    button.onclick = () => onSelect(node);
    container.appendChild(button);
  });
}

/* 顶部课程条：卡片横向滚动带 + 模型快速导航浮层。
   options:
   - cardsEl / menuEl          卡片带与浮层容器
   - courses                   [{courseId, code, name}]
   - modelsOf(courseId)        课程内已排序模型数组
   - modelTitle(model)         模型显示名
   - metaHtml(models)          卡片徽章 HTML（开发端=模型数，审核端=已审核/总数）
   - activeCourseId            选中课程（卡片 active 态）
   - currentModelId            当前模型（浮层行 active 态）
   - menuCourseId / query      浮层打开状态与搜索词
   - onSelectCourse(courseId)  点击卡片主体
   - onMenuToggle(courseId)    点击卡片「模型」按钮（开/关浮层）
   - onMenuClose()             点击浮层 ×
   - onQueryChange(value)      搜索词变化（重渲染后自动回焦输入框）
   - onMenuModelOpen(modelId)  点击浮层内模型行
   - onDeleteModel(modelId)?   提供时浮层行渲染行尾删除按钮
   - drag?                     开发端拖放钩子 { rowStart, rowEnd, cardOver, cardLeave, cardDrop } */
export function renderCourseRail(options) {
  const {
    cardsEl, menuEl, courses, modelsOf, modelTitle, metaHtml,
    activeCourseId = null, currentModelId = null, menuCourseId = null, query = '',
    onSelectCourse, onMenuToggle, onMenuClose, onQueryChange, onMenuModelOpen,
    onDeleteModel = null, drag = null,
  } = options;

  cardsEl.innerHTML = courses.map((course) => {
    const models = modelsOf(course.courseId);
    const active = course.courseId === activeCourseId;
    const open = course.courseId === menuCourseId;
    const empty = models.length === 0;
    return `<article class="course-card${active ? ' active' : ''}${empty ? ' empty' : ''}" data-course-card="${course.courseId}"><button class="course-card-select" type="button" data-course-select="${course.courseId}" aria-pressed="${active}" title="${esc(`选择课程 ${course.code} ${course.name}`)}"><span class="course-card-code">${esc(course.code)}</span><strong>${esc(course.name)}</strong><small class="course-card-meta">${empty ? '暂无模型' : metaHtml(models)}</small></button><button class="course-card-menu" type="button" data-course-menu="${course.courseId}" aria-label="查看 ${esc(course.name)} 的模型列表" aria-expanded="${open}" title="查看模型列表">模型${empty ? '' : ` ${models.length}`}</button></article>`;
  }).join('') || emptyState('⌗', '暂无课程', '在项目设置的 Drawer 中添加课程');

  const menuCourse = courses.find((course) => course.courseId === menuCourseId);
  if (!menuCourse) {
    menuEl.classList.add('hidden');
  } else {
    const q = query.trim().toLowerCase();
    const models = modelsOf(menuCourse.courseId).filter((model) => !q || modelTitle(model).toLowerCase().includes(q) || (model.fileName || '').toLowerCase().includes(q));
    menuEl.innerHTML = `<div class="course-menu-heading"><div><b>${esc(`${menuCourse.code} ${menuCourse.name}`)}</b><span>${models.length} 个模型</span></div><button class="course-menu-close" type="button" aria-label="关闭模型导航">×</button></div><input class="course-model-search" type="search" placeholder="搜索模型" value="${esc(query)}"><div class="course-menu-list">${models.map((model) => `<div class="course-menu-model ${model.modelId === currentModelId ? 'active' : ''}"${drag ? ' draggable="true"' : ''} data-rail-model="${model.modelId}"><button type="button" class="course-menu-model-select">${esc(modelTitle(model))}</button>${onDeleteModel ? `<button type="button" class="delete-model" title="删除模型" aria-label="删除 ${esc(modelTitle(model))}">×</button>` : ''}</div>`).join('') || emptyState('⌗', '该课程暂无匹配模型', '调整搜索关键词后再试')}</div>`;
    menuEl.classList.remove('hidden');
    const card = cardsEl.querySelector(`[data-course-card="${menuCourse.courseId}"]`);
    const railRect = cardsEl.closest('.course-rail')?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    menuEl.style.left = `${Math.max(16, Math.min((cardRect?.left || railRect?.left || 0) - (railRect?.left || 0), (railRect?.width || 0) - 432))}px`;
    menuEl.querySelector('.course-menu-close').onclick = () => onMenuClose();
    menuEl.querySelector('.course-model-search')?.addEventListener('input', (event) => { onQueryChange(event.target.value); menuEl.querySelector('.course-model-search')?.focus(); });
    menuEl.querySelectorAll('[data-rail-model]').forEach((row) => {
      row.querySelector('.course-menu-model-select').onclick = () => onMenuModelOpen(row.dataset.railModel);
      row.querySelector('.delete-model')?.addEventListener('click', () => onDeleteModel(row.dataset.railModel));
      if (drag) {
        row.ondragstart = (event) => drag.rowStart(row.dataset.railModel, event, row);
        row.ondragend = () => drag.rowEnd();
      }
    });
  }

  cardsEl.querySelectorAll('[data-course-select]').forEach((button) => button.onclick = () => onSelectCourse(button.dataset.courseSelect));
  cardsEl.querySelectorAll('[data-course-menu]').forEach((button) => button.onclick = () => onMenuToggle(button.dataset.courseMenu));
  if (drag) {
    cardsEl.querySelectorAll('[data-course-card]').forEach((card) => {
      card.ondragover = (event) => drag.cardOver(card, event);
      card.ondragleave = (event) => { if (!card.contains(event.relatedTarget)) drag.cardLeave(card, event); };
      card.ondrop = (event) => { event.preventDefault(); drag.cardLeave(card, event); drag.cardDrop(card.dataset.courseCard, event); };
    });
  }
}
