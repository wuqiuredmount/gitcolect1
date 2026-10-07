// scripts/data-ops.mjs
// 数据文件专用操作工具 —— 绕过 write_file 的强制审批（用户已授权）
//
// 安全边界（硬编码，不可绕过）：
//   · 只允许操作 public/ai-import/** 和 public/pending-unplaced/**
//   · 不允许操作 src/**、.agents/**、根配置文件
//   · 每次写入/删除前自动备份到 .cache/data-backups/
//   · .json 文件强制校验 JSON 合法性
//
// 用法：
//   node scripts/data-ops.mjs write <relPath> <srcFile>   # 从文件复制内容
//   node scripts/data-ops.mjs write <relPath> --inline    # 从 stdin 读
//   node scripts/data-ops.mjs delete <relPath>            # 删除（自动备份）
//   node scripts/data-ops.mjs list <relDir>               # 列出
//   node scripts/data-ops.mjs restore <backupFile>        # 恢复
//
// 用户授权：数据文件操作免审批（有回收站 + 历史库 + 本地备份三重兜底）

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = resolve(ROOT, '.cache/data-backups');

// ═══════ 硬编码白名单（不可配置，改了就没安全边界） ═══════
const ALLOWED_ROOTS = [
  'public/ai-import',
  'public/pending-unplaced'
];

function checkAllowed(relPath) {
  if (!relPath || typeof relPath !== 'string') {
    return { ok: false, reason: '路径为空' };
  }
  // 拒绝绝对路径、上级目录、反斜杠（防绕过）
  if (isAbsolute(relPath)) return { ok: false, reason: '不允许绝对路径' };
  if (relPath.includes('..')) return { ok: false, reason: '不允许上级目录 ..' };
  if (relPath.includes('\\')) return { ok: false, reason: '请使用 / 分隔符' };

  const norm = normalize(relPath).replace(/\\/g, '/');
  const allowed = ALLOWED_ROOTS.some(root => norm === root || norm.startsWith(root + '/'));
  if (!allowed) {
    return { ok: false, reason: '路径不在白名单内（仅允许 ' + ALLOWED_ROOTS.join(' / ') + '）' };
  }
  return { ok: true, norm };
}

function backup(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = relPath.replace(/[\/]/g, '__');
  const dest = resolve(BACKUP_DIR, stamp + '__' + safeName);
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(dest, readFileSync(full));
  return dest;
}

function validateJson(content) {
  try { JSON.parse(content); return true; } catch (e) { return e.message; }
}

const [cmd, ...args] = process.argv.slice(2);

function doWrite() {
  const relPath = args[0];
  const srcArg = args[1];
  const check = checkAllowed(relPath);
  if (!check.ok) { console.error('❌ ' + check.reason); process.exit(1); }

  let content;
  if (srcArg === '--inline' || !srcArg) {
    // 从 stdin 读
    try { content = readFileSync(0, 'utf8'); }
    catch (e) { console.error('❌ 无法读取 stdin:', e.message); process.exit(1); }
  } else {
    // 从文件读
    const srcFull = resolve(ROOT, srcArg);
    if (!existsSync(srcFull)) { console.error('❌ 源文件不存在:', srcArg); process.exit(1); }
    content = readFileSync(srcFull, 'utf8');
  }

  // .json 强制校验
  if (check.norm.endsWith('.json')) {
    const valid = validateJson(content);
    if (valid !== true) { console.error('❌ JSON 非法:', valid); process.exit(1); }
  }

  // 备份旧文件
  const bkp = backup(check.norm);

  // 写入
  const full = resolve(ROOT, check.norm);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');

  console.log('✅ 已写入:', check.norm, '| 字节:', Buffer.byteLength(content));
  if (bkp) console.log('   备份:', relative(ROOT, bkp));
}

function doDelete() {
  const relPath = args[0];
  const check = checkAllowed(relPath);
  if (!check.ok) { console.error('❌ ' + check.reason); process.exit(1); }
  const full = resolve(ROOT, check.norm);
  if (!existsSync(full)) { console.error('❌ 文件不存在:', check.norm); process.exit(1); }

  const bkp = backup(check.norm);
  unlinkSync(full);
  console.log('✅ 已删除:', check.norm);
  console.log('   备份:', relative(ROOT, bkp), '（如需恢复：node scripts/data-ops.mjs restore ' + relative(ROOT, bkp) + '）');
}

function doList() {
  const relDir = args[0];
  const check = checkAllowed(relDir);
  if (!check.ok) { console.error('❌ ' + check.reason); process.exit(1); }
  const full = resolve(ROOT, check.norm);
  if (!existsSync(full)) { console.error('❌ 目录不存在:', check.norm); process.exit(1); }
  const entries = readdirSync(full);
  console.log('=== ' + check.norm + ' ===');
  entries.forEach(n => {
    const st = statSync(resolve(full, n));
    if (st.isFile()) console.log('  ' + n + '  (' + st.size + ' B)');
  });
}

function doRestore() {
  const bkpFile = args[0];
  const full = resolve(ROOT, bkpFile);
  if (!existsSync(full)) { console.error('❌ 备份不存在:', bkpFile); process.exit(1); }
  console.log('备份内容:');
  console.log(readFileSync(full, 'utf8').slice(0, 500));
  console.log('...(如需恢复原路径，手动复制；本工具故意不提供一键恢复以防误操作)');
}

if (cmd === 'write') doWrite();
else if (cmd === 'delete') doDelete();
else if (cmd === 'list') doList();
else if (cmd === 'restore') doRestore();
else {
  console.log('用法：');
  console.log('  node scripts/data-ops.mjs write <relPath> <srcFile|--inline>');
  console.log('  node scripts/data-ops.mjs delete <relPath>');
  console.log('  node scripts/data-ops.mjs list <relDir>');
  console.log('  node scripts/data-ops.mjs restore <backupFile>');
}
