// scripts/integrity.mjs
// 关键文件哈希基线：snapshot / check / diff
// 用法：
//   node scripts/integrity.mjs snapshot   # 生成基线
//   node scripts/integrity.mjs check      # 对比基线，列出被改的文件
//   node scripts/integrity.mjs diff       # 显示具体 diff（需 git）

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = resolve(ROOT, '.cache/integrity-baseline.json');

// 关键文件（红线清单里的，加 data 层）
const KEY_FILES = [
  'src/groups/geo/utils/fingerprint.js',
  'src/groups/geo/utils/fingerprintStore.js',
  'src/groups/geo/utils/toolDB.js',
  'src/groups/geo/utils/migrationManager.js',
  'src/groups/geo/utils/annotationStore.js',
  'src/groups/geo/utils/toolRegistry.js',
  'src/groups/whiteboard/utils/elementSync.js',
  'src/groups/whiteboard/utils/boardStore.js',
  'src/router/index.js',
  'src/views/GisApp.vue',
  'package.json',
  'electron-main.cjs',
  'public/ai-import/manifest.json'
];

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function scan() {
  const out = {};
  for (const rel of KEY_FILES) {
    const full = resolve(ROOT, rel);
    if (!existsSync(full)) { out[rel] = null; continue; }
    try { out[rel] = sha256(full); } catch (e) { out[rel] = 'ERR:' + e.message; }
  }
  return out;
}

const cmd = process.argv[2];
if (cmd === 'snapshot') {
  mkdirSync(dirname(BASELINE), { recursive: true });
  const data = { createdAt: new Date().toISOString(), hashes: scan() };
  writeFileSync(BASELINE, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ 基线已生成:', BASELINE);
  console.log('   共', Object.keys(data.hashes).length, '个文件');
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('❌ 未找到基线，先跑：node scripts/integrity.mjs snapshot');
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const cur = scan();

const changed = [], added = [], removed = [];
for (const [k, v] of Object.entries(base.hashes)) {
  if (v === null && cur[k] !== null) added.push(k);
  else if (v !== null && cur[k] === null) removed.push(k);
  else if (v !== cur[k]) changed.push(k);
}

console.log('基线时间:', base.createdAt);
console.log('---');
if (changed.length === 0 && added.length === 0 && removed.length === 0) {
  console.log('✅ 无变化（所有关键文件与基线一致）');
  process.exit(0);
}
if (changed.length) { console.log('🔴 被修改 (' + changed.length + '):'); changed.forEach(f => console.log('  -', f)); }
if (added.length) { console.log('🟢 新增 (' + added.length + '):'); added.forEach(f => console.log('  +', f)); }
if (removed.length) { console.log('⚫ 被删除 (' + removed.length + '):'); removed.forEach(f => console.log('  -', f)); }

if (cmd === 'diff') {
  console.log('---');
  console.log('提示：具体 diff 用 git diff -- <file>');
  console.log('  git diff -- ' + changed.join(' '));
}
process.exit(2);
