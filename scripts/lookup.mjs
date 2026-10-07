// scripts/lookup.mjs
// 用途：一条命令定位代码，替代「read_file 读全文」。
// 用法：
//   npm run lookup -- symbol <name>     找函数/常量/类定义
//   npm run lookup -- section <name>    找 SECTION 标记
//   npm run lookup -- text <keyword>    找任意文本
// 输出：文件:行号 + 上下文 ±3 行（最多 30 处）

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'dist', '.vite', '.codex', '.webcode', 'public']);
const EXTS = new Set(['.js', '.mjs', '.cjs', '.vue', '.ts', '.md']);
const MAX_MATCHES = 30;
const CTX = 3;

function* walk(dir) {
  let names;
  try { names = readdirSync(dir); } catch (e) { return; }
  for (const name of names) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const full = resolve(dir, name);
    let st;
    try { st = statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.has(name.slice(name.lastIndexOf('.')))) yield full;
  }
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mode = process.argv[2];
const keyword = process.argv[3];
if (!mode || !keyword) {
  console.error('用法: node scripts/lookup.mjs <symbol|section|text> <keyword>');
  process.exit(1);
}

const kw = esc(keyword);
let re;
if (mode === 'symbol') {
  re = new RegExp('\\b(export\\s+)?(const|let|var|function|class)\\s+' + kw + '\\b');
} else if (mode === 'section') {
  re = new RegExp('SECTION:\\s*' + kw, 'i');
} else if (mode === 'text') {
  re = new RegExp(kw);
} else {
  console.error('未知模式:', mode, '（可选 symbol/section/text）');
  process.exit(1);
}

const srcDir = resolve(ROOT, 'src');
const hits = [];
for (const file of walk(srcDir)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      hits.push({ file: relative(ROOT, file), line: i + 1, all: lines });
      if (hits.length >= MAX_MATCHES) break;
    }
  }
  if (hits.length >= MAX_MATCHES) break;
}

if (hits.length === 0) { console.log('无命中'); process.exit(0); }

for (const h of hits) {
  console.log('\n' + h.file + ':' + h.line);
  const s = Math.max(0, h.line - 1 - CTX);
  const e = Math.min(h.all.length, h.line + CTX);
  for (let i = s; i < e; i++) {
    const mark = (i === h.line - 1) ? '>' : ' ';
    console.log('  ' + mark + ' ' + (i + 1) + ': ' + h.all[i]);
  }
}
console.log('\n共 ' + hits.length + ' 处命中');
