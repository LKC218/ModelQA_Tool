import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../../src/generated/', import.meta.url);
await mkdir(output, { recursive: true });
const outfile = fileURLToPath(new URL('../../src/generated/reviewer-runtime.js', import.meta.url));
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: [fileURLToPath(new URL('../../src/reviewer/reviewer-entry.js', import.meta.url))],
  outfile,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
const hdr = (await readFile(new URL('../../public/hdri/brown_photostudio_02_2k.hdr', import.meta.url))).toString('base64');
const sharedCss = await readFile(new URL('../../src/shared/shared-ui.css', import.meta.url), 'utf8');
const runtime = await readFile(outfile, 'utf8');
/* UI 热更引导：页面打开时追加 /runtime/ui.css（nginx no-cache 保证最新），成功则在
   内嵌快照 <style> 之后叠加覆盖；404/离线/file:// onerror 静默回退 = 快照样式兜底。
   仅做 CSS 展示层热更，不碰 payload 与运行逻辑；file://（file: 协议）直接跳过。
   必须拼进 __AN_REVIEWER_RUNTIME_SRC__ 字符串内，editor(?raw) 与 reviewer(shell) 双导出通道才都携带。 */
const hotload = ';(function(){try{if(!/^https?:$/.test(location.protocol))return;var l=document.createElement("link");l.rel="stylesheet";l.href="/runtime/ui.css";l.onerror=function(){l.remove()};document.head.appendChild(l)}catch(e){}})();';
await writeFile(
  outfile,
  `globalThis.__AN_SHARED_CSS__=${JSON.stringify(sharedCss)};globalThis.__AN_HDR_SOURCE__="data:application/octet-stream;base64,${hdr}";globalThis.__APP_VERSION__=${JSON.stringify(pkg.version)};globalThis.__AN_REVIEWER_RUNTIME_SRC__=${JSON.stringify(runtime + hotload)};${runtime}${hotload}`,
  'utf8',
);
