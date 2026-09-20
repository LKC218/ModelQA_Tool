// 后置构建步骤：vite build 会 emptyOutDir 清空 dist，故 ui.css 必须在 vite 之后拷贝。
// 产物 dist/runtime/ui.css 随 upload_dist.py 全量上传，供已分发快照 HTML 的 CSS 热更引导拉取。
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dest = fileURLToPath(new URL('../../dist/runtime/ui.css', import.meta.url));
await mkdir(new URL('../../dist/runtime/', import.meta.url), { recursive: true });
await copyFile(new URL('../../src/shared/shared-ui.css', import.meta.url), dest);
console.log('runtime/ui.css 已输出:', dest);
