# 应用代码导航

## 3D模型项目审核网页生成器

- [完整实施计划-V1.0](3D模型项目审核网页生成器/实施方案/完整实施计划-V1.0.md)：产品边界、技术路线、阶段任务与验收条件。
- [多模型审核工具化实施计划-V1.0](3D模型项目审核网页生成器/实施方案/多模型审核工具化实施计划-V1.0.md)：多 GLB 项目包、开发者端、审核端和分阶段交付方案。
- [UIUX重构实施计划-V1.0](3D模型项目审核网页生成器/实施方案/UIUX重构实施计划-V1.0.md)：双端 UIUX 骨架重构——Design Token、shared-ui.css 共享样式层、共享渲染组件、视口常驻骨架与四阶段执行步骤。
- [开发者工具-第一版验证](3D模型项目审核网页生成器/原型/开发者工具-第一版验证.html)：用于确认开发者端工作流、固定模板风格和审核包交付方式的交互原型。
- [审核页面-视觉预览](3D模型项目审核页面-视觉预览.html)：审核端三栏工作台视觉基线。
- [PoC 说明](3D模型项目审核网页生成器/PoC/README.md)：阶段 1 单 GLB 离线闭环边界与运行方式。
- [PoC 生成器](3D模型项目审核网页生成器/PoC/模型审核-PoC-生成器.html)：单 GLB 导入、层级选择、Issue 与结果 HTML 导出。
- [阶段 1 PoC 验收报告](3D模型项目审核网页生成器/PoC/阶段1-PoC验收报告.md)：已验证、待验证和阻断风险记录。
- [Three.js 工具化说明](3D模型项目审核网页生成器/工具化/README.md)：开发者编辑端、离线审核端、审核包格式、运行方式与验收边界。
- [开发者编辑端源码](../tool/src/main.js)：正式入口；委托给 `main-implementation.js`，负责课程选择前置、模型归类/拖放/删除、模型审核要求、问题定位和审核包重新序列化。
- [开发者编辑端实现](../tool/src/main-implementation.js)：课程-模型状态、Three.js 查看、节点引用、跨课程移动、删除清理及单 HTML/ZIP 导出。
- [Brown Photo Studio HDRI](../tool/public/hdri/brown_photostudio_02_2k.hdr)：Poly Haven `brown_photostudio_02` 2K HDR 环境资源，供开发端与离线审核端使用。
- [双端共享样式层](../tool/src/shared-ui.css)：Design Token（亮/暗双主题）、骨架（顶栏/课程条/三栏工作区/底栏/滚动条）与通用组件（按钮/面板/表单/课程卡片/课程导航浮层/层级树/空态/动效）的唯一来源；开发端直接 import，审核端由构建脚本注入。
- [开发者端工作台样式](../tool/src/styles.css)：仅保留开发端独有样式——项目设置与课程编辑器（阶段 2 迁入 Drawer）、3D 视口容器、课程条导入按钮、拖放移动与行内删除等端差异。
- [审核者离线运行时](../tool/src/reviewer-entry.js)：正式运行时入口；委托给 `reviewer-implementation.js`，负责课程树、模型独立审核、模型/零件 Issue、问题定位描边和审核结果导出。
- [审核者离线实现](../tool/src/reviewer-implementation.js)：自包含审核端；DOM 使用与开发端同源的共享类名（course-rail/course-card/tree-node 等），启动时注入 `__AN_SHARED_CSS__` 共享样式与审核端独有样式（Issue 卡片、审核状态色），课程条/树/骨架样式不再本地维护。
- [审核运行时构建脚本](../tool/scripts/build-reviewer.mjs)：把审核端依赖、共享样式层（`shared-ui.css` → `__AN_SHARED_CSS__`）与 Brown Photo Studio HDR 数据打入固定离线运行时模板。
- [开发者编辑端启动脚本](../tool/启动开发者编辑端.cmd)：Windows 双击启动 Vite 本地服务器并自动打开浏览器。
