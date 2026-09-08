# ModelQA Tool（3D 模型项目审核工具）

面向 3D 课程模型项目的双端离线审核工具。开发者编辑端管理课程与模型、配置审核要求并导出审核包；审核者离线端无需部署任何环境，直接在浏览器中完成模型审核并导出结果。

## 目录结构

```text
ModelQA_Tool/
├── docs/                # 实施计划、PoC、原型与验收报告（入口见 docs/apps-code-map.md）
├── tool/                # 工具源码（Vite + Three.js）
│   ├── src/             # 开发者编辑端与审核者离线端源码
│   ├── scripts/         # 审核运行时构建脚本
│   └── 启动开发者编辑端.cmd  # Windows 双击启动本地开发服务器
└── Model/               # 本地 3D 模型资源（.glb，不纳入版本管理）
```

## 快速开始

```bash
cd tool
npm install
npm run dev    # 启动开发者编辑端（自动执行审核运行时预构建）
npm run build  # 构建产物输出至 tool/dist/
```

Windows 下可直接双击 `tool/启动开发者编辑端.cmd` 启动。

## 双端说明

- **开发者编辑端**（`tool/src/main.js`）：课程与模型管理、模型归类/拖放/删除、审核要求配置、问题定位与审核包导出（单 HTML / ZIP）。
- **审核者离线端**（`tool/src/reviewer-entry.js`）：自包含离线运行时，支持课程模型切换、模型/零件 Issue 记录、节点定位描边与审核结果导出。

## 文档导航

完整的文档索引见 [docs/apps-code-map.md](docs/apps-code-map.md)。
