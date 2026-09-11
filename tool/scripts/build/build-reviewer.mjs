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
/* 仅注入 IIFE 源码字符串，不二次内嵌 HDR。
   HDR 源为 384×192 降采样（约 288 KB），Base64 后 runtime 总大小约 1.8 MB，
   保证无模型单 HTML < 2 MB。导出时用当前 __AN_SHARED_CSS__ / __AN_HDR_SOURCE__ + 该源串拼回可嵌入脚本。 */
await writeFile(
  outfile,
  `globalThis.__AN_SHARED_CSS__=${JSON.stringify(sharedCss)};globalThis.__AN_HDR_SOURCE__="data:application/octet-stream;base64,${hdr}";globalThis.__APP_VERSION__=${JSON.stringify(pkg.version)};globalThis.__AN_REVIEWER_RUNTIME_SRC__=${JSON.stringify(runtime)};${runtime}`,
  'utf8',
);
