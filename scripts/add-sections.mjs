// scripts/add-sections.mjs
// 自动给「顶层定义」（行首无缩进的 export const / function / class）前插入 SECTION 标记。
// 幂等：上一行已有 [SECTION: 就跳过。
// 用法：node scripts/add-sections.mjs

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 目标文件（只挑 >300 行的大文件，小文件没必要）
const TARGETS = [
  'src/groups/whiteboard/WhiteboardTool.vue',
  'src/groups/whiteboard/utils/elementSync.js',
  'src/groups/whiteboard/utils/excalidrawBridge.js',
  'src/groups/whiteboard/ExcalidrawBoard.vue',
  'src/views/GisApp.vue',
  'src/components/tools/geo/BaseMapTool.vue',
];

// 顶层定义匹配：行首无缩进
// 匹配：export const X / export function X / export class X / const X = / function X
const DEF_RE = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;

function processFile(relPath) {
  const full = resolve(ROOT, relPath);
  let st;
  try { st = statSync(full); } catch (e) { return null; }
  if (st.size < 1024) return null;

  const raw = readFileSync(full, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);

  if (lines.length < 300) return { file: relPath, skipped: 'too-small', lines: lines.length };

  let inserted = 0;
  const out = [];
  let inScript = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 只在 <script> 内工作（.vue 文件）
    if (relPath.endsWith('.vue')) {
      if (/^<script\b/.test(line)) inScript = true;
      if (/^<\/script>/.test(line)) inScript = false;
    } else {
      inScript = true;
    }

    // 检测顶层定义
    if (inScript) {
      const m = line.match(DEF_RE);
      // 只在行首（列 0）且上两行不是已有 SECTION 时插
      if (m && line === line.trimStart()) {
        const prev1 = (out[out.length - 1] || '').trim();
        const prev2 = (out[out.length - 2] || '').trim();
        const hasMark = /^\/\/\s*=+\s*\[SECTION:/.test(prev1) || /^\/\/\s*=+\s*\[SECTION:/.test(prev2);
        if (!hasMark) {
          out.push('// ===== [SECTION:' + m[1] + '] =====');
          inserted++;
        }
      }
    }
    out.push(line);
  }

  if (inserted === 0) return { file: relPath, inserted: 0, note: 'no-change' };
  writeFileSync(full, out.join(eol), 'utf8');
  return { file: relPath, inserted, lines: lines.length };
}

console.log('=== 扫描目标 ===');
for (const t of TARGETS) {
  const r = processFile(t);
  if (!r) { console.log('  ✗', t, '(不存在)'); continue; }
  if (r.skipped) { console.log('  - ', t, '(' + r.skipped + ',', r.lines, '行)'); continue; }
  if (r.inserted === 0) { console.log('  =', t, '(已全部有标记)'); continue; }
  console.log('  ✓', r.file, '→ 插入', r.inserted, '个 SECTION（共', r.lines, '行）');
}
console.log('=== 完成 ===');
