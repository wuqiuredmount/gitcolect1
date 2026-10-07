// scripts/watch-cline.mjs
// Cline 监控：生成磁盘状态快照，或对比两次快照
//
// 用法：
//   npm run watch-cline -- snapshot   # 生成快照
//   npm run watch-cline -- diff       # 对比上次快照，输出变化
//   npm run watch-cline -- status     # 一行状态摘要

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.cache/cline-watch');
const LATEST = resolve(CACHE, 'latest.json');
const PREV = resolve(CACHE, 'prev.json');

const TO_CLINE = '.agents/mailbox/to-cline.md';
const TO_DEEPSEEK = '.agents/mailbox/to-deepseek.md';

function fileInfo(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) return null;
  const st = statSync(p);
  const lines = readFileSync(p, 'utf8').split('\n').length;
  return { mtime: st.mtime.toISOString(), size: st.size, lines };
}

function gitInfo() {
  const out = { dirty: [], lastCommit: '' };
  try {
    out.dirty = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
    out.lastCommit = execSync('git log --oneline -1', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { /* ignore */ }
  return out;
}

function procInfo() {
  try {
    const n = execSync('powershell -NoProfile -Command "(Get-Process Code -ErrorAction SilentlyContinue).Count"', { cwd: ROOT, encoding: 'utf8' });
    return { code: parseInt(n.trim(), 10) || 0 };
  } catch { return { code: -1 }; }
}

function buildSnapshot() {
  const toCline = fileInfo(TO_CLINE);
  const toDeepseek = fileInfo(TO_DEEPSEEK);
  const git = gitInfo();
  const procs = procInfo();
  // 越界检测：to-cline.md 是否被改动（对比 git HEAD）
  let toClineTouched = false;
  try {
    const d = execSync('git diff --name-only HEAD -- ' + TO_CLINE, { cwd: ROOT, encoding: 'utf8' }).trim();
    toClineTouched = d.length > 0;
  } catch { /* ignore */ }
  return {
    at: new Date().toISOString(),
    toCline: toCline ? { ...toCline, touched: toClineTouched } : null,
    toDeepseek,
    git,
    processes: procs
  };
}

function saveSnapshot(snap) {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(LATEST)) {
    writeFileSync(PREV, readFileSync(LATEST));
  }
  writeFileSync(LATEST, JSON.stringify(snap, null, 2), 'utf8');
}

function cmp(prev, cur) {
  const changes = [];
  if (!prev) return ['（无上次快照，无法对比）'];
  if (prev.toDeepseek && cur.toDeepseek && prev.toDeepseek.mtime !== cur.toDeepseek.mtime) {
    changes.push('📬 to-deepseek.md 更新了：' + prev.toDeepseek.size + 'B → ' + cur.toDeepseek.size + 'B');
  }
  if (cur.toCline && cur.toCline.touched) {
    changes.push('🚨 警告：to-cline.md 被改动（违反排他铁律）！');
  }
  if (prev.git && cur.git && prev.git.lastCommit !== cur.git.lastCommit) {
    changes.push('📝 有新提交：' + cur.git.lastCommit);
  }
  if (prev.git && cur.git) {
    const newDirty = cur.git.dirty.filter(x => !prev.git.dirty.includes(x));
    if (newDirty.length) changes.push('🔧 新增改动文件：' + newDirty.join(' | '));
  }
  if (changes.length === 0) changes.push('（无变化）');
  return changes;
}

function status(snap) {
  const t = snap.toDeepseek ? new Date(snap.toDeepseek.mtime).toLocaleString('zh-CN') : '无';
  const lines = [
    'Cline 监控状态 @ ' + new Date(snap.at).toLocaleString('zh-CN'),
    '  to-deepseek.md（Cline产出）: ' + (snap.toDeepseek ? snap.toDeepseek.size + 'B / ' + snap.toDeepseek.lines + '行 / ' + t : '不存在'),
    '  to-cline.md（我的地盘）    : ' + (snap.toCline ? snap.toCline.size + 'B' + (snap.toCline.touched ? ' 🚨被改动！' : ' ✓未动') : '不存在'),
    '  工作区脏文件              : ' + (snap.git.dirty.length ? snap.git.dirty.join(' | ') : '无'),
    '  最新提交                  : ' + snap.git.lastCommit
  ];
  return lines.join('\n');
}

const cmd = process.argv[2] || 'status';
const snap = buildSnapshot();

if (cmd === 'snapshot') {
  saveSnapshot(snap);
  console.log('✅ 快照已保存');
  console.log(status(snap));
} else if (cmd === 'diff') {
  let prev = null;
  if (existsSync(PREV)) { try { prev = JSON.parse(readFileSync(PREV, 'utf8')); } catch {} }
  console.log('=== 与上次快照对比 ===');
  cmp(prev, snap).forEach(l => console.log('  ' + l));
  saveSnapshot(snap);
} else {
  console.log(status(snap));
}
