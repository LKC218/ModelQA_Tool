/* 把帮助资源嵌成 data URL 模块，供单 HTML 离线使用。
   源：public/help/focus-part/双击聚焦指南.gif、public/icon/问号.png
   用法：node scripts/build/embed-focus-help.mjs */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GIF = fileURLToPath(new URL('../../public/help/focus-part/双击聚焦指南.gif', import.meta.url));
const ICON = fileURLToPath(new URL('../../public/icon/问号.png', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../src/generated/', import.meta.url));
const OUT = path.join(OUT_DIR, 'help-focus-frames.js');

const gif = await readFile(GIF);
const icon = await readFile(ICON);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  OUT,
  `/* 由 scripts/build/embed-focus-help.mjs 生成，勿手改 */\nexport const FOCUS_PART_FRAMES = ${JSON.stringify({ '双击聚焦指南.gif': `data:image/gif;base64,${gif.toString('base64')}` })};\nexport const HELP_ICON_DATA = ${JSON.stringify(`data:image/png;base64,${icon.toString('base64')}`)};\n`,
  'utf8',
);
console.log('embedded gif', (gif.length / 1024).toFixed(1), 'KB; icon', (icon.length / 1024).toFixed(1), 'KB ->', OUT);
