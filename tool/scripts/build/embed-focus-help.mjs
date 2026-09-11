/* 把帮助资源嵌成 data URL 模块，供单 HTML 离线使用。
   源：public/help/focus-part/*.gif、public/icon/问号.png
   用法：node scripts/build/embed-focus-help.mjs */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HELP_DIR = fileURLToPath(new URL('../../public/help/focus-part/', import.meta.url));
const ICON = fileURLToPath(new URL('../../public/icon/问号.png', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../src/generated/', import.meta.url));
const OUT = path.join(OUT_DIR, 'help-focus-frames.js');

const icon = await readFile(ICON);
const frames = {};
const entries = await readdir(HELP_DIR, { withFileTypes: true });
let total = 0;
for (const entry of entries) {
  if (!entry.isFile() || !/\.gif$/i.test(entry.name)) continue;
  const buf = await readFile(path.join(HELP_DIR, entry.name));
  total += buf.length;
  frames[entry.name] = `data:image/gif;base64,${buf.toString('base64')}`;
}
await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  OUT,
  `/* 由 scripts/build/embed-focus-help.mjs 生成，勿手改 */\nexport const HELP_FRAMES = ${JSON.stringify(frames)};\n/** @deprecated 使用 HELP_FRAMES */\nexport const FOCUS_PART_FRAMES = HELP_FRAMES;\nexport const HELP_ICON_DATA = ${JSON.stringify(`data:image/png;base64,${icon.toString('base64')}`)};\n`,
  'utf8',
);
console.log('embedded gifs', Object.keys(frames).join(', '), (total / 1024).toFixed(1), 'KB; icon', (icon.length / 1024).toFixed(1), 'KB ->', OUT);
