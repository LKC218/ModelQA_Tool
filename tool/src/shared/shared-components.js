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

/* 长名 marquee：外层 .tree-label 固定裁剪视口，内层 .tree-label-text 平移滚字 */
function markLongTreeLabels(container) {
  container.querySelectorAll('.tree-label').forEach((label) => {
    const text = label.querySelector('.tree-label-text');
    if (!text) return;
    text.classList.remove('is-animated');
    text.style.removeProperty('--tree-shift');
    const overflow = label.scrollWidth - label.clientWidth;
    if (overflow > 2) {
      text.classList.add('is-animated');
      text.style.setProperty('--tree-shift', `${-(overflow + 6)}px`);
    }
  });
}
let treeLabelResizeBound = false;
function bindTreeLabelResize() {
  if (treeLabelResizeBound) return;
  treeLabelResizeBound = true;
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => document.querySelectorAll('.tree').forEach((el) => markLongTreeLabels(el)), 150);
  });
}

/* ---- 模型层级树 ---- */

/* 与父名公共前缀弱化：有前缀拆两段，无前缀整行普通渲染，不硬切。
   支持两种命中：子名以父名开头；或子名首段/最长前缀出现在父名中（如 汽车交流发电机 → 交流发电机_xxx）。 */
function splitNamePrefix(name, parentName) {
  if (!name || !parentName || name === parentName) return { prefix: '', rest: name };
  if (name.startsWith(parentName)) {
    const rest = name.slice(parentName.length);
    if (!rest) return { prefix: '', rest: name };
    return { prefix: parentName, rest: rest.replace(/^[_\-\s./]+/, '') || rest };
  }
  const sepIndex = name.search(/[_\-\s./]/);
  if (sepIndex >= 2) {
    const head = name.slice(0, sepIndex);
    if (parentName.includes(head)) return { prefix: name.slice(0, sepIndex + 1), rest: name.slice(sepIndex + 1) };
  }
  let i = 0;
  const max = Math.min(name.length, parentName.length);
  while (i < max && name[i] === parentName[i]) i++;
  if (i >= 2 && i < name.length) {
    let cut = i;
    if (name[i] === '_' || name[i] === '-' || name[i] === ' ' || name[i] === '/') cut = i + 1;
    if (cut < name.length) return { prefix: name.slice(0, cut), rest: name.slice(cut) };
  }
  for (let len = max; len >= 2; len--) {
    const head = name.slice(0, len);
    if (len < name.length && parentName.includes(head)) return { prefix: head, rest: name.slice(len) };
  }
  return { prefix: '', rest: name };
}

function countLeafNodes(node) {
  let count = 0;
  node.traverse((item) => {
    if (item !== node && (item.isMesh || !item.children || item.children.length === 0)) count++;
  });
  if (!count && node.children) count = node.children.length;
  return count;
}

function isGroupNode(node) {
  return !node.isMesh && !!node.children && node.children.length > 0;
}

/* 展开态按 root 存放，refreshTree 重建 DOM 后仍保留用户折叠习惯。 */
const treeExpandedByRoot = new WeakMap();
function getTreeExpanded(root) {
  let expanded = treeExpandedByRoot.get(root);
  if (!expanded) {
    expanded = new Set();
    /* 默认只展开根下第一层（总成），更深层先收起，降低 80+ 节点噪音 */
    (root.children || []).forEach((child) => {
      if (isGroupNode(child)) expanded.add(child);
    });
    treeExpandedByRoot.set(root, expanded);
  }
  return expanded;
}

function ensureAncestorsExpanded(root, node, expanded) {
  if (!node) return;
  for (let item = node.parent; item && item !== root; item = item.parent) {
    if (isGroupNode(item)) expanded.add(item);
  }
}

function computeFilterKeepSet(root, filterQ) {
  if (!filterQ) return null;
  const keep = new Set();
  function visit(node) {
    if (node === root) {
      (node.children || []).forEach(visit);
      return false;
    }
    const name = nodeDisplayName(node).toLowerCase();
    const raw = (node.name || '').toLowerCase();
    const selfHit = name.includes(filterQ) || raw.includes(filterQ);
    let childHit = false;
    if (node.children) {
      for (const child of node.children) {
        if (visit(child)) childHit = true;
      }
    }
    if (selfHit || childHit) keep.add(node);
    return selfHit || childHit;
  }
  (root.children || []).forEach(visit);
  return keep;
}

function appendTreeLabelText(container, text, filterQ) {
  if (!filterQ) {
    container.textContent = text;
    return;
  }
  const idx = text.toLowerCase().indexOf(filterQ);
  if (idx < 0) {
    container.textContent = text;
    return;
  }
  const mark = document.createElement('mark');
  mark.className = 'tree-hit';
  mark.textContent = text.slice(idx, idx + filterQ.length);
  container.append(text.slice(0, idx), mark, text.slice(idx + filterQ.length));
}

let treeClickStamp = 0;
let treeClickNode = null;

/* 模型层级树：折叠 + 前缀弱化 + 折叠摘要 + 行内过滤 + 选中态。
   单击=onSelect；同一节点 400ms 内再击=onIsolate。
   options: selected / onSelect / onIsolate / filter */
export function renderTree(container, root, { selected = null, onSelect = () => {}, onIsolate = null, filter = '' } = {}) {
  if (!root) return;
  const filterQ = String(filter || '').trim().toLowerCase();
  const expanded = getTreeExpanded(root);
  ensureAncestorsExpanded(root, selected, expanded);
  const keepSet = computeFilterKeepSet(root, filterQ);
  container.innerHTML = '';
  if (keepSet && keepSet.size === 0) {
    container.innerHTML = emptyState('⌗', '无匹配零件', '换个关键词，或清空搜索查看完整层级');
    return;
  }

  function visit(node, depth) {
    if (node === root) {
      [...(node.children || [])].forEach((child) => visit(child, 0));
      return;
    }
    if (keepSet && !keepSet.has(node)) return;
    const kind = node.isMesh ? 'mesh' : (isGroupNode(node) ? 'group' : 'empty');
    const open = filterQ ? true : expanded.has(node);
    const name = nodeDisplayName(node);
    const parentName = node.parent && node.parent !== root ? nodeDisplayName(node.parent) : '';
    const { prefix, rest } = filterQ ? { prefix: '', rest: name } : splitNamePrefix(name, parentName);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tree-node tree-${kind}${selected === node ? ' active' : ''}${kind === 'group' ? (open ? ' is-open' : ' is-collapsed') : ''}`;
    button.title = onIsolate ? `${name}（双击聚焦零件 / G）` : name;

    const guides = document.createElement('span');
    guides.className = 'tree-guides';
    guides.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < depth; i++) guides.appendChild(document.createElement('i'));

    if (kind === 'group') {
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = open ? '▾' : '▸';
      button.appendChild(chevron);
    }

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tree-icon';
    iconSpan.textContent = kind === 'mesh' ? '◆' : kind === 'empty' ? '◇' : '◈';

    const label = document.createElement('span');
    label.className = 'tree-label';
    const labelText = document.createElement('span');
    labelText.className = 'tree-label-text';
    if (prefix && rest) {
      const pre = document.createElement('span');
      pre.className = 'tree-label-prefix';
      pre.textContent = prefix;
      const suf = document.createElement('span');
      suf.className = 'tree-label-suffix';
      appendTreeLabelText(suf, rest, filterQ);
      labelText.append(pre, suf);
    } else {
      appendTreeLabelText(labelText, rest || name, filterQ);
    }
    label.appendChild(labelText);

    button.append(guides, iconSpan, label);

    if (kind === 'group' && !open && !filterQ) {
      const count = countLeafNodes(node);
      if (count) {
        const summary = document.createElement('span');
        summary.className = 'tree-summary';
        summary.textContent = String(count);
        button.appendChild(summary);
      }
    }

    if (kind === 'empty') {
      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = 'Empty';
      button.appendChild(badge);
    }

    button.onclick = (event) => {
      if (event.target.closest('.tree-chevron')) {
        if (expanded.has(node)) expanded.delete(node);
        else expanded.add(node);
        treeClickStamp = 0;
        treeClickNode = null;
        renderTree(container, root, { selected, onSelect, onIsolate, filter });
        return;
      }
      const now = performance.now();
      const double = onIsolate && treeClickNode === node && treeClickStamp > 0 && (now - treeClickStamp) < 400;
      treeClickStamp = double ? 0 : now;
      treeClickNode = node;
      onSelect(node);
      if (double) onIsolate(node);
    };
    container.appendChild(button);

    if (kind === 'group' && open) {
      [...(node.children || [])].forEach((child) => visit(child, depth + 1));
    }
  }

  (root.children || []).forEach((child) => visit(child, 0));
  markLongTreeLabels(container);
  bindTreeLabelResize();
}

/* 顶部课程条：卡片横向滚动带 + 模型快速导航浮层。
   options:
   - cardsEl                   课程卡片容器
   - courses                   [{courseId, code, name}]
   - modelsOf(courseId)        课程内已排序模型数组
   - modelTitle(model)         模型显示名
   - metaHtml(models)          卡片徽章 HTML（开发端=模型数，审核端=已审核/总数）
   - activeCourseId            选中课程（卡片 active 态）
   - currentModelId            当前模型（浮层行 active 态）
   - menuCourseId / query      浮层打开状态与搜索词
   - onSelectCourse(courseId)  点击卡片主体
   - drag?                     开发端拖放钩子 { cardOver, cardLeave, cardDrop } */
export function renderCourseRail(options) {
  const {
    cardsEl, courses, modelsOf, metaHtml,
    activeCourseId = null,
    onSelectCourse,
    drag = null,
  } = options;

  cardsEl.innerHTML = courses.map((course) => {
    const models = modelsOf(course.courseId);
    const active = course.courseId === activeCourseId;
    const empty = models.length === 0;
    return `<article class="course-card${active ? ' active' : ''}${empty ? ' empty' : ''}" data-course-card="${course.courseId}"><button class="course-card-select" type="button" data-course-select="${course.courseId}" aria-pressed="${active}" title="${esc(`选择课程 ${course.code} ${course.name}`)}"><span class="course-card-code">${esc(course.code)}</span><strong>${esc(course.name)}</strong><small class="course-card-meta">${empty ? '暂无模型' : metaHtml(models)}</small></button></article>`;
  }).join('') || emptyState('⌗', '暂无课程', '在项目设置的 Drawer 中添加课程');

  cardsEl.querySelectorAll('[data-course-select]').forEach((button) => button.onclick = () => onSelectCourse(button.dataset.courseSelect));
  if (drag) {
    cardsEl.querySelectorAll('[data-course-card]').forEach((card) => {
      card.ondragover = (event) => drag.cardOver(card, event);
      card.ondragleave = (event) => { if (!card.contains(event.relatedTarget)) drag.cardLeave(card, event); };
      card.ondrop = (event) => { event.preventDefault(); drag.cardLeave(card, event); drag.cardDrop(card.dataset.courseCard, event); };
    });
  }
}

/* ---- 左栏「课程模型」列表（当前课程，固定约 3 行内滚） ----
   options:
   - listEl / metaEl / titleEl?  列表容器、右侧计数、可选标题
   - models                      当前课程模型数组（已排序）
   - currentModelId
   - modelTitle(model)
   - modelSubtitle(model)?       名称下副文案（开发端=文件大小等）
   - statusHtml(model)?          右侧状态点/标签 HTML（审核端）
   - emptyHint?
   - onSelectModel(modelId)
   - onDeleteModel(modelId)?
   - drag?                       { rowStart, rowEnd } 左栏行拖到课程卡 */
export function renderCourseModelList(options) {
  const {
    listEl, metaEl = null, titleEl = null,
    models = [], currentModelId = null,
    modelTitle, modelSubtitle = null, statusHtml = null,
    emptyHint = '选择课程后导入 GLB',
    onSelectModel, onDeleteModel = null, drag = null,
  } = options;

  if (titleEl) titleEl.textContent = '课程模型';
  if (metaEl) metaEl.textContent = models.length ? `${models.length} 个模型` : '—';

  if (!models.length) {
    listEl.innerHTML = emptyState('⌗', '该课程暂无模型', emptyHint);
    return;
  }

  listEl.innerHTML = models.map((model, index) => {
    const active = model.modelId === currentModelId;
    const num = String(index + 1).padStart(2, '0');
    const subtitle = modelSubtitle ? modelSubtitle(model) : '';
    return `<div class="model-item${active ? ' active' : ''}" data-model="${model.modelId}"${drag ? ' draggable="true"' : ''}>
      <button type="button" class="model-item-main" aria-pressed="${active}">
        <span class="model-num" aria-hidden="true">${num}</span>
        <span class="model-item-body">
          <b>${esc(modelTitle(model))}</b>
          ${subtitle ? `<small>${esc(subtitle)}</small>` : ''}
        </span>
      </button>
      <span class="model-item-aside">
        ${statusHtml ? statusHtml(model) : ''}
        ${onDeleteModel ? `<button type="button" class="delete-model" title="删除模型" aria-label="删除 ${esc(modelTitle(model))}">×</button>` : ''}
      </span>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.model-item').forEach((row) => {
    row.querySelector('.model-item-main').onclick = () => onSelectModel(row.dataset.model);
    row.querySelector('.delete-model')?.addEventListener('click', (event) => {
      event.stopPropagation();
      onDeleteModel(row.dataset.model);
    });
    if (drag) {
      row.ondragstart = (event) => drag.rowStart(row.dataset.model, event, row);
      row.ondragend = () => drag.rowEnd(row);
    }
  });
}

/* ---- 视口工具接线：爆炸按钮/滑块 + 部件标注开关（双端共用） ----
   依赖 viewer 的 setExplode / isExplodable / explodeTarget / explodeFactor / setLabelsVisible / labelsVisible / onViewState。
   切模型时 viewer 内部自动复位爆炸，经 onViewState 通知同步按钮态。 */
export function bindViewportTools(viewer, { explodeBtn, explodeSlider = null, explodeRange = null, explodeValue = null, labelsBtn }) {
  if (!explodeBtn || !labelsBtn) return;
  const syncExplode = () => {
    const exploded = viewer.explodeTarget > 0;
    explodeBtn.classList.toggle('active', exploded);
    if (explodeSlider) explodeSlider.classList.toggle('hidden', !exploded);
    /* 滑块与数值反映目标系数（按钮点击后立即到位，动画由 viewer 内部插值） */
    const targetPct = Math.round(viewer.explodeTarget * 100);
    if (explodeRange) explodeRange.value = String(targetPct);
    if (explodeValue) explodeValue.textContent = `${targetPct}%`;
  };
  const syncExplodable = (event) => {
    const explodable = event ? event.explodable !== false : viewer.isExplodable();
    explodeBtn.disabled = !explodable;
    explodeBtn.title = explodable ? '爆炸视图' : '该模型无可拆分的部件，不支持爆炸视图';
  };
  explodeBtn.onclick = () => {
    if (!viewer.isExplodable()) return;
    viewer.setExplode(viewer.explodeTarget > 0 ? 0 : 1);
    syncExplode();
  };
  explodeRange?.addEventListener('input', () => {
    viewer.setExplode(Number(explodeRange.value) / 100);
    if (explodeValue) explodeValue.textContent = `${explodeRange.value}%`;
  });
  labelsBtn.onclick = () => {
    viewer.setLabelsVisible(!viewer.labelsVisible);
    labelsBtn.classList.toggle('active', viewer.labelsVisible);
  };
  viewer.onViewState((event) => {
    syncExplodable(event);
    /* 切模型自动复位：爆炸归零、滑块收起、标注按钮态保留由用户决定 */
    syncExplode();
  });
  syncExplodable();
  syncExplode();
}
