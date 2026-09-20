/* sequential runner for NODE_PATH-dependent probes; writes one combined report */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const CWD = 'G:/项目/模型审核工具/tool';
process.env.NODE_PATH = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules';
const probes = ['probe-mobile-scope', 'probe-sheet', 'probe-editor-mobile'];
let report = '';
for (const name of probes) {
  const r = spawnSync(NODE, [path.join(CWD, 'scripts/smoke/probes', name + '.cjs')], { cwd: CWD, encoding: 'utf8', env: process.env, timeout: 180000 });
  report += `===== ${name} (exit=${r.status}) =====\n` + (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '') + '\n';
}
fs.writeFileSync(path.join(CWD, 'output/playwright/mobile-regression-all.txt'), report, 'utf8');
console.log('report written, total exits: ' + probes.map((n) => n).join(','));
