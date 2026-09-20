// 从用户 Chrome profile 副本中提取编辑端 localStorage 草稿
// 用法: node probe-recover-drafts.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('G:/项目/模型审核工具/node_modules/@playwright/cli/node_modules/playwright-core');

const EXEC = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const SRC_DIRS = {
  chrome: 'C:/Users/Administrator/AppData/Local/Google/Chrome/User Data/Default/Local Storage',
  edge: 'C:/Users/Administrator/AppData/Local/Microsoft/Edge/User Data/Default/Local Storage',
};
const OUTDIR = 'G:/项目/模型审核工具/tool/output/recovered-drafts';
const ORIGINS = ['https://3d.propanda.cn/', 'http://127.0.0.1:5173/'];

function copyDir(src, dst, log) {
  fs.mkdirSync(dst, { recursive: true });
  let ok = 0, skip = 0;
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n), d = path.join(dst, n);
    try {
      const st = fs.statSync(s);
      if (st.isDirectory()) copyDir(s, d, log);
      else { fs.copyFileSync(s, d); ok++; }
    } catch (e) { skip++; log.push(`  skip ${n} (${e.code})`); }
  }
  return { ok, skip };
}

(async () => {
  const result = {};

  for (const [bname, srcdir] of Object.entries(SRC_DIRS)) {
    const log = [];
    const tmp = path.join(OUTDIR, `_profile_${bname}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (!fs.existsSync(srcdir)) { result[bname] = { error: 'not found' }; continue; }

    const stats = copyDir(srcdir, path.join(tmp, 'Default', 'Local Storage'), log);
    console.log(`\n=== ${bname} ===`);
    console.log(`复制 leveldb: ok=${stats.ok} skip=${stats.skip}`);
    log.slice(0, 6).forEach(l => console.log(l));

    let ctx;
    try {
      ctx = await chromium.launchPersistentContext(tmp, {
        executablePath: EXEC,
        headless: true,
        ignoreHTTPSErrors: true,
        args: ['--no-proxy-server', '--disable-dev-shm-usage'],
      });
      const page = ctx.pages()[0] || await ctx.newPage();

      // 同源但返回空白页，避免站点 JS 改动 localStorage
      await page.route('**/*', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><head><meta charset="utf-8"></head><body>blank</body></html>',
      }));

      const perOrigin = {};
      for (const origin of ORIGINS) {
        try {
          await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20000 });
          const dump = await page.evaluate(() => {
            const o = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              o[k] = localStorage.getItem(k);
            }
            return o;
          });
          perOrigin[origin] = dump;
          const keys = Object.keys(dump);
          console.log(`  [${origin}] ${keys.length} 个键`);
          keys.forEach(k => console.log(`     ${k}  len=${(dump[k] || '').length}`));
        } catch (e) {
          perOrigin[origin] = { __error: String(e).slice(0, 200) };
          console.log(`  [${origin}] 失败: ${String(e).slice(0, 120)}`);
        }
      }
      result[bname] = perOrigin;
      await ctx.close();
    } catch (e) {
      result[bname] = { error: String(e).slice(0, 400) };
      console.log('  启动失败: ' + String(e).slice(0, 200));
      if (ctx) try { await ctx.close(); } catch (_) {}
    }
  }

  fs.mkdirSync(OUTDIR, { recursive: true });
  const out = path.join(OUTDIR, 'localstorage-dump.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
  console.log('\n写入: ' + out);
})();
