// scripts/sync-map.mjs
// 只更新 architecture-map.md 里的 AUTO 块，块外不动。
// 用法：node scripts/sync-map.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP = resolve(ROOT, '.agents/references/architecture-map.md');
const read = (p) => existsSync(p) ? readFileSync(p, 'utf8') : '';
const json = (p) => JSON.parse(read(p));

// ── 生成器 ──

// 1. 工具注册表：从 toolRegistry.js 提取 TOOL_META
function genToolRegistry() {
  const src = read(resolve(ROOT, 'src/groups/geo/utils/toolRegistry.js'));
  const m = src.match(/TOOL_META\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return '(未找到 TOOL_META)';
  const re = /'([^']+)'\s*:\s*\{[^}]*dbName:\s*'([^']+)'[^}]*prefix:\s*'([^']+)'/g;
  const rows = ['| toolId | 库名 | 前缀 |', '|---|---|---|'];
  let x;
  while ((x = re.exec(m[1]))) rows.push('| `' + x[1] + '` | `' + x[2] + '` | ' + x[3] + ' |');
  return rows.join('\n');
}

// 2. 依赖清单：从 package.json 提取
function genDeps() {
  const p = json(resolve(ROOT, 'package.json'));
  const tbl = (obj) => ['| 包 | 版本 |', '|---|---|',
    ...Object.entries(obj).map(([k, v]) => '| `' + k + '` | `' + v + '` |')].join('\n');
  return '**dependencies**\n' + tbl(p.dependencies || {}) +
         '\n\n**devDependencies**\n' + tbl(p.devDependencies || {});
}

// 3. 同步戳
function genStamp() {
  return '> 自动同步于 ' + new Date().toISOString().slice(0, 10) +
         '（由 `npm run sync-map` 生成，勿手改本块）';
}

// ── 替换 AUTO 块 ──
function replaceAuto(content, key, gen) {
  const s = '<!-- AUTO:' + key + ' START -->';
  const e = '<!-- AUTO:' + key + ' END -->';
  const re = new RegExp(s + '[\\s\\S]*?' + e);
  if (!re.test(content)) { console.warn('未找到 AUTO 块:', key); return content; }
  return content.replace(re, s + '\n' + gen() + '\n' + e);
}

// ── 主流程 ──
function main() {
  if (!existsSync(MAP)) { console.error('架构地图不存在:', MAP); process.exit(1); }
  let c = readFileSync(MAP, 'utf8');
  c = replaceAuto(c, 'TOOL-REGISTRY', genToolRegistry);
  c = replaceAuto(c, 'DEPS', genDeps);
  c = replaceAuto(c, 'SYNC-STAMP', genStamp);
  writeFileSync(MAP, c, 'utf8');
  console.log('✅ 架构地图已同步:', MAP);
}

main();
