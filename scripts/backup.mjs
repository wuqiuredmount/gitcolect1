// scripts/backup.mjs
// 一键备份：src/ + .agents/ + public/ai-import 的 json 清单 + package.json
// 用法：node scripts/backup.mjs [标签]
// 输出：backups/YYYY-MM-DD_HHMMSS[_标签]/  （含 manifest.json）

import { readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_ROOT = resolve(ROOT, 'backups');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vite', '.cache', 'backups']);
const INCLUDE_DIRS = ['src', '.agents', '.clinerules'];
const INCLUDE_FILES = ['package.json', 'electron-main.cjs', 'index.html', 'vite.config.js', 'tsconfig.json'];
const INCLUDE_JSON_DIRS = ['public/ai-import', 'public/pending-unplaced'];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

const tag = process.argv[2] ? '_' + process.argv[2].replace(/[^\w\u4e00-\u9fa5-]+/g, '-') : '';
const dest = resolve(BACKUP_ROOT, stamp() + tag);
mkdirSync(dest, { recursive: true });

const manifest = { createdAt: new Date().toISOString(), tag: process.argv[2] || '', files: [] };

function copyFile(src, rel) {
  const out = resolve(dest, rel);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
  const st = statSync(src);
  manifest.files.push({ path: rel, bytes: st.size });
}

function walkDir(dir, relPrefix) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    const rel = relPrefix ? relPrefix + '/' + name : name;
    const st = statSync(full);
    if (st.isDirectory()) walkDir(full, rel);
    else copyFile(full, rel);
  }
}

// 1) 包含目录
for (const d of INCLUDE_DIRS) {
  const full = resolve(ROOT, d);
  if (existsSync(full)) walkDir(full, d);
}

// 2) 包含文件
for (const f of INCLUDE_FILES) {
  const full = resolve(ROOT, f);
  if (existsSync(full)) copyFile(full, f);
}

// 3) ai-import 的 json（不备份 woff2 等大文件）
for (const d of INCLUDE_JSON_DIRS) {
  const full = resolve(ROOT, d);
  if (!existsSync(full)) continue;
  for (const name of readdirSync(full)) {
    if (!name.endsWith('.json')) continue;
    copyFile(resolve(full, name), d + '/' + name);
  }
}

writeFileSync(resolve(dest, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const totalBytes = manifest.files.reduce((s, f) => s + f.bytes, 0);
console.log('✅ 备份完成');
console.log('   路径:', dest);
console.log('   文件:', manifest.files.length, '个');
console.log('   体积:', (totalBytes / 1024 / 1024).toFixed(2), 'MB');
