/* sequential runner for all regression probes (dev-server based) */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const CWD = 'G:/项目/模型审核工具/tool';
process.env.NODE_PATH = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules';
process.env.OUT = path.join(CWD, 'output/playwright');
const probes = ['probe-mobile-v123', 'probe-e2e-dedup', 'probe-model-list', 'probe-mobile-density', 'probe-sheet', 'probe-mobile-scope', 'probe-editor-mobile'];
let report = '';
let fail = 0;
for (const name of probes) {
  const r = spawnSync(NODE, [path.join(CWD, 'scripts/smoke/probes', name + '.cjs')], { cwd: CWD, encoding: 'utf8', env: process.env, timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
  const fails = (out.match(/^FAIL.*$/gm) || []).length;
  fail += fails;
  report += `===== ${name} (exit=${r.status}, FAIL=${fails}) =====\n` + out + '\n';
}
fs.writeFileSync(path.join(CWD, 'output/playwright/regression-v123-all.txt'), report, 'utf8');
console.log('done, total FAIL lines = ' + fail);
