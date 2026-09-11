# ModelQA Tool（3D 模型项目审核工具）

面向 3D 课程模型项目的双端离线审核工具。开发者编辑端管理课程与模型、配置审核要求并导出审核包；审核者离线端无需部署任何环境，直接在浏览器中完成模型审核并导出结果。

## 目录结构

```text
模型审核工具/
├── docs/                          # 文档（入口见 docs/apps-code-map.md）
│   ├── 实施方案/                  # 各阶段实施计划
│   ├── 原型/                      # 交互原型与视觉预览
│   ├── PoC/                       # 阶段 1 单 GLB 闭环验证
│   └── 工具化/                    # 工具化说明
├── tool/                          # 工具源码（Vite + Three.js）
│   ├── src/
│   │   ├── editor/                # 开发者编辑端
│   │   ├── reviewer/              # 审核者离线端
│   │   ├── shared/                # 双端共享层（样式/组件/视口/热点）
│   │   └── generated/             # 构建生成（gitignore）
│   ├── scripts/
│   │   ├── build/                 # 构建与资源处理脚本
│   │   └── smoke/                 # 冒烟验收脚本（含 probes/）
│   ├── public/                    # 静态资源（HDRI/帮助图/预览页）
│   ├── logs/                      # 本地开发日志（gitignore）
│   ├── output/                    # 截图与导出验收产物（gitignore）
│   └── 启动开发者编辑端.cmd
└── Model/                         # 本地 3D 模型资源（.glb，不纳入版本管理）
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

- **开发者编辑端**（`tool/src/editor/main.js`）：课程与模型管理、模型归类/拖放/删除、审核要求配置、问题定位与审核包导出（单 HTML / ZIP）。
- **审核者离线端**（`tool/src/reviewer/reviewer-entry.js`）：自包含离线运行时，支持课程模型切换、模型/零件 Issue 记录、节点定位描边与审核结果导出。

## 文档导航

完整的文档索引见 [docs/apps-code-map.md](docs/apps-code-map.md)。
