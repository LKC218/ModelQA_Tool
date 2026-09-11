import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'));

export default defineConfig(({ mode }) => {
  // Token/基址读 tool/.env.local（gitignore，模板见 .env.example）。
  // Token 会内置于生产 dist：内部工具可接受，勿用于公网强隔离。
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const cloudBase = env.VITE_CLOUD_BASE || 'https://3d.propanda.cn';
  const cloudToken = env.VITE_CLOUD_TOKEN || '';
  // 审核端回传专用低权 Token（仅 POST /api/reviews/submit），随审核包 payload 注入
  const submitToken = env.VITE_CLOUD_SUBMIT_TOKEN || '';

  const cloudProxy = {
    // 本地 dev / preview 经 proxy 连生产 API，后端不开 CORS
    '/api': { target: cloudBase, changeOrigin: true },
    '/data': { target: cloudBase, changeOrigin: true },
    '/reviews': { target: cloudBase, changeOrigin: true },
  };

  return {
    plugins: [viteSingleFile()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __CLOUD_TOKEN__: JSON.stringify(cloudToken),
      __CLOUD_BASE__: JSON.stringify(''),
      __CLOUD_SUBMIT_TOKEN__: JSON.stringify(submitToken),
    },
    server: {
      proxy: cloudProxy,
    },
    // preview（对 dist 跑 E2E 用）：与 dev 同规则转发，保证冒烟不受并行源码编辑影响
    preview: {
      proxy: cloudProxy,
    },
    build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100000000 },
  };
});
