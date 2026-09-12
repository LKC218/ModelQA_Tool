// 扫描 GLB 节点层级：验证爆炸/标注可行性
const fs = require('fs');
const path = require('path');

function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546C67) return null; // 'glTF'
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
}

function walk(node, nodes, depth, out) {
  const meshes = (node.mesh ?? -1) >= 0 ? 1 : 0;
  out.push(`${'  '.repeat(depth)}${node.name || '(未命名)'}${meshes ? ' [mesh]' : ''}`);
  (node.children || []).forEach((c) => walk(nodes[c], nodes, depth + 1, out));
}

const files = process.argv.slice(2);
for (const f of files) {
  const gltf = readGlbJson(f);
  if (!gltf) { console.log(`${f}: 非法GLB`); continue; }
  const sceneNodes = gltf.scenes[gltf.scene || 0].nodes || [];
  const out = [];
  sceneNodes.forEach((n) => walk(gltf.nodes[n], gltf.nodes, 0, out));
  const meshCount = gltf.meshes ? gltf.meshes.length : 0;
  const namedNodes = gltf.nodes.filter((n) => n.name).length;
  console.log(`\n=== ${path.basename(f)} ===`);
  console.log(`节点:${gltf.nodes.length} 命名节点:${namedNodes} mesh:${meshCount} 材质:${(gltf.materials || []).length}`);
  console.log(out.slice(0, 30).join('\n'));
  if (out.length > 30) console.log(`...共 ${out.length} 行`);
}
