/* 契约测试：cloud-sync.js 对生产 API 实测（Node 22+，自带 fetch）。
   用法：node _archive/cloud-sync-contract-test.mjs  */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const token = readFileSync('G:/项目/服务器部署/private/modelqa-token.txt', 'utf8').trim();
globalThis.__CLOUD_TOKEN__ = token;
globalThis.__CLOUD_BASE__ = ''; // 同域相对路径，Node 侧手动拼域名

const { cloud } = await import('file:///G:/项目/模型审核工具/tool/src/editor/cloud-sync.js');
const ORIGIN = 'https://3d.propanda.cn';
const rawFetch = globalThis.fetch;
globalThis.fetch = (input, init) => rawFetch(typeof input === 'string' && input.startsWith('/') ? ORIGIN + input : input, init);

let failed = 0;
function check(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (cond ? '' : ` :: ${detail}`));
  if (!cond) failed += 1;
}

// 1. available
check('available', cloud.available === true);

// 2. health 免鉴权
const health = await rawFetch(ORIGIN + '/api/health').then((r) => r.json());
check('health', health.ok === true);

// 3. listProjects
const list1 = await cloud.listProjects();
check('listProjects', Array.isArray(list1.projects));

// 4. saveProject / loadProject
const pid = `contract-${Date.now()}`;
const saveRes = await cloud.saveProject(pid, { name: '契约测试', slots: [1, 2, 3] });
check('saveProject.ok', saveRes.ok === true && typeof saveRes.updatedAt === 'string', JSON.stringify(saveRes));
const loaded = await cloud.loadProject(pid);
check('loadProject', loaded.name === '契约测试' && Array.isArray(loaded.slots));

// 5. 上传模型 + 去重
const glb = new Uint8Array(0x67 + 0x1000).map((_, i) => (i * 7) & 0xff);
const up1 = await cloud.uploadModel(glb.buffer);
check('uploadModel', /^[0-9a-f]{64}$/.test(up1.hash) && up1.url.startsWith('/data/models/') && up1.dedup === false, JSON.stringify(up1));
const up2 = await cloud.uploadModel(glb.buffer);
check('uploadModel dedup', up2.dedup === true && up2.hash === up1.hash);

// 6. fetchModel 回读
const back = await cloud.fetchModel(up1.url);
check('fetchModel', back.byteLength === glb.byteLength);

// 7. uploadReviewPackage
const up3 = await cloud.uploadReviewPackage('<!doctype html><html><body>contract</body></html>', '契约测试');
check('uploadReviewPackage', /^https:\/\/3d\.propanda\.cn\/reviews\/.+\.html$/.test(up3.url), JSON.stringify(up3));
const htmlResp = await rawFetch(up3.url);
check('review html 200', htmlResp.status === 200);

// 8. deleteProject
const delRes = await cloud.deleteProject(pid);
check('deleteProject', delRes.ok === true);
const after = await cloud.loadProject(pid).catch((e) => e);
check('loadProject 404 after delete', /404/.test(String(after)));

// 清理模型与审核包
const revFile = decodeURIComponent(up3.url.split('/').pop());
const cleanup = await import('node:child_process');
// 用最小 SSH 清理太重，改走服务端无删除模型接口 → 留待服务器侧清理，仅报告
console.log('清理提示: 服务器残留', up1.hash + '.glb', revFile);

process.exit(failed ? 1 : 0);
