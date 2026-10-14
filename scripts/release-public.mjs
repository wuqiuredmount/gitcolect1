#!/usr/bin/env node
// scripts/release-public.mjs
// 用途：对 vite build 产出的 dist/ 做「对外发布前」的敏感文件剔除。
// 背景：public/ 下所有内容会被 Vite 原样拷进 dist/ 并可被任何人按 URL 访问，
//       其中部分是内部工作产物（清单 / 校验 / README / 一次性指令），不应对外暴露。
//
// 用法：
//   node scripts/release-public.mjs            默认 safe：仅剔 A 类内部草稿，应用功能不受影响
//   node scripts/release-public.mjs --strict   连 B 类整目录剔除（需先关闭内部面板，否则报错）
//
// 约束：只操作 dist/（构建产物），绝不触碰 public/ 源文件。

import { rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const strict = process.argv.includes('--strict');

if (!existsSync(DIST)) {
  console.error('未找到 dist/，请先执行 npm run build');
  process.exit(1);
}

// A 类：内部工作文件（无运行时依赖，任何对外发布都应剔除）
const SAFE_STRIP = [
  'ai-import/_all_names.txt',
  'ai-import/_existing_305.txt',
  'ai-import/_existing_names.txt',
  'ai-import/_new.txt',
  'ai-import/5a-verify-3.json',
  'ai-import/README.md',
  'ai-import/shards',
  'ai-import/commands/README.md',
  'ai-import/commands/delete-sports-nov.json',
];

// B 类：内部功能数据整目录（需先关闭对应面板，否则运行时报错）
const STRICT_STRIP = [
  'ai-import',
  'pending-unplaced',
];

const list = strict ? [...SAFE_STRIP, ...STRICT_STRIP] : SAFE_STRIP;

let removed = 0;
for (const rel of list) {
  const p = resolve(DIST, rel);
  if (!existsSync(p)) continue;
  rmSync(p, { recursive: true, force: true });
  console.log('removed: ' + rel);
  removed++;
}

console.log('完成（' + (strict ? 'strict' : 'safe') + ' 模式），共剔除 ' + removed + ' 项。');

if (strict) {
  console.log('strict 模式移除了 ai-import / pending-unplaced。');
  console.log('若代码仍启用 AI导入 / 回收站 / 待放置 面板，它们将报错。');
  console.log('请确认已按指引第四节关闭内部面板。');
} else {
  console.log('safe 模式保留了运行时依赖（manifest / 数据 / commands / pending）。');
  console.log('如需彻底隐藏内部功能数据，请先用 --strict 并先关闭内部面板。');
}
