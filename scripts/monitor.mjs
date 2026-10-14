// scripts/monitor.mjs
// 🔍 全流程监控器 —— 一轮扫描 → 分级报告 → 自动修复 → 复验
//
// 设计依据：项目使命「促进人类社会一切信息的开放」（.agents/MISSION.md）
//   翻译成工程判据：
//     ① 信息不能丢   → 数据完整性（B 组）
//     ② 信息不能自相矛盾 → 一致性（C 组：dev / 对外 / 磁盘三方对齐）
//     ③ 信息必须可达 → 可用性（C 组：服务端可达性）
//     ④ 代码不能带病 → 健康度（A / D 组）
//
// 用法：
//   npm run monitor             完整一轮
//   npm run monitor -- --fast   跳过构建类检查（快）
//   npm run monitor -- --json   机器可读输出
//   npm run monitor -- --fix    自动修复可修项
//
// 触发词：用户说「开启一轮监控」

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const FAST = argv.includes('--fast');
const JSON_OUT = argv.includes('--json');
const FIX = argv.includes('--fix');

const AI_DIR = 'public/ai-import';

// ───────────────────────── 工具 ─────────────────────────

function sh(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

function exists(rel) { return existsSync(resolve(ROOT, rel)); }

function readJson(rel) {
  try { return { ok: true, data: JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function listJson(dir) {
  const full = resolve(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter(n => n.endsWith('.json'));
}

async function probe(url, ms = 3000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    const text = r.ok ? await r.text() : '';
    return { ok: r.ok, status: r.status, text };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// ───────────────────────── 检查项 ─────────────────────────
// 每项：{ id, group, name, severity, run(): { status:'pass'|'fail'|'skip', msg, detail?, fix? } }

const checks = [];
const add = (c) => checks.push(c);

// ===== A 构建健康 =====
add({
  id: 'A1', group: 'A 构建健康', name: 'dev 构建通过', severity: 'error',
  run() {
    if (FAST) return { status: 'skip', msg: '--fast 跳过' };
    const t0 = Date.now();
    const r = sh('npm run build');
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.ok) return { status: 'fail', msg: '构建失败', detail: r.out.split('\n').slice(-15) };
    return { status: 'pass', msg: `通过 (${sec}s)` };
  }
});

add({
  id: 'A2', group: 'A 构建健康', name: 'release 构建 + 内部剔除', severity: 'error',
  run() {
    if (FAST) return { status: 'skip', msg: '--fast 跳过' };
    // 🚨 本项故意不真的执行 release 构建。
    //    原因：vite.config.js 的 stripInternalAfterBuild 插件删除的是硬编码路径
    //    `dist/ai-import`（与 --outDir 无关）。真跑一次 release 构建 = 把正在运行的
    //    4173（preview 服务 dist/）的内部数据目录删掉 ⇒ 监控动作自身造成故障。
    //    故改为配置静态校验：确认防泄露的两道闸都在正确位置。
    const problems = [];
    const viteCfg = readFileSync(resolve(ROOT, 'vite.config.js'), 'utf8');
    if (!/dist\/ai-import/.test(viteCfg) || !/dist\/pending-unplaced/.test(viteCfg)) {
      problems.push('vite.config.js 的 STRIP 未同时覆盖 ai-import / pending-unplaced');
    }
    if (!/mode\s*===\s*.release./.test(viteCfg)) {
      problems.push('剔除插件未限定 release 模式（会误伤 dev / build）');
    }
    if (!exists('.env.release')) {
      problems.push('缺少 .env.release（release 模式不会关闭内部工具）');
    } else if (!/VITE_INTERNAL_TOOLS\s*=\s*false/.test(readFileSync(resolve(ROOT, '.env.release'), 'utf8'))) {
      problems.push('.env.release 未设置 VITE_INTERNAL_TOOLS=false');
    }
    if (problems.length) return { status: 'fail', msg: '防泄露配置不完整', detail: problems };
    return { status: 'pass', msg: '两道闸就位（插件剔除 + 内部工具关闭）' };
  }
});

// ===== B 数据完整性 =====
add({
  id: 'B1', group: 'B 数据完整性', name: 'manifest JSON 合法', severity: 'error',
  run() {
    const r = readJson(`${AI_DIR}/manifest.json`);
    if (!r.ok) return { status: 'fail', msg: 'manifest 解析失败', detail: [r.error] };
    if (!Array.isArray(r.data)) return { status: 'fail', msg: 'manifest 不是数组' };
    return { status: 'pass', msg: `${r.data.length} 个文件` };
  }
});

add({
  id: 'B2', group: 'B 数据完整性', name: 'manifest ↔ 磁盘双向一致', severity: 'warn',
  run() {
    const m = readJson(`${AI_DIR}/manifest.json`);
    if (!m.ok) return { status: 'skip', msg: 'manifest 不可读' };
    const listed = new Set(m.data);
    // 🚨 排除校验中间产物：它们按 frontend-release-security.md 属 A 类内部文件，
    //    本就不应登记进 manifest（否则发布时会暴露内部工作流）。
    const INTERNAL = /^(_|5a-verify-|.*-verify-)/;
    const onDisk = new Set(listJson(AI_DIR).filter(n => n !== 'manifest.json' && !INTERNAL.test(n)));
    const missing = [...listed].filter(f => !onDisk.has(f));
    const unlisted = [...onDisk].filter(f => !listed.has(f));
    if (missing.length || unlisted.length) {
      return {
        status: 'fail',
        msg: `缺失 ${missing.length} · 未登记 ${unlisted.length}`,
        detail: [...missing.map(f => `缺失: ${f}`), ...unlisted.map(f => `未登记: ${f}`)],
        fix: unlisted.length ? () => {
          const next = [...new Set([...m.data, ...unlisted])].sort();
          writeFileSync(resolve(ROOT, `${AI_DIR}/manifest.json`), JSON.stringify(next, null, 4) + '\n', 'utf8');
          return `已补登记 ${unlisted.length} 个文件`;
        } : null
      };
    }
    return { status: 'pass', msg: `${listed.size} 个文件全部对齐` };
  }
});

add({
  id: 'B3', group: 'B 数据完整性', name: '批次字段完整（name/lat/lng）', severity: 'error',
  run() {
    const m = readJson(`${AI_DIR}/manifest.json`);
    if (!m.ok) return { status: 'skip', msg: 'manifest 不可读' };
    const bad = [];
    let total = 0;
    for (const f of m.data) {
      const j = readJson(`${AI_DIR}/${f}`);
      if (!j.ok) { bad.push(`${f}: JSON 非法`); continue; }
      const items = j.data.items || [];
      if (!Array.isArray(items)) { bad.push(`${f}: items 不是数组`); continue; }
      total += items.length;
      items.forEach((it, i) => {
        if (!it.name || String(it.name).trim() === '') bad.push(`${f}[${i}]: 缺 name`);
        if (!Number.isFinite(Number(it.lat)) || !Number.isFinite(Number(it.lng))) bad.push(`${f}[${i}]: 坐标非法`);
      });
    }
    if (bad.length) return { status: 'fail', msg: `${bad.length} 条问题`, detail: bad.slice(0, 20) };
    return { status: 'pass', msg: `${total} 条全部合规` };
  }
});

add({
  id: 'B4', group: 'B 数据完整性', name: '坐标范围合法', severity: 'warn',
  run() {
    const m = readJson(`${AI_DIR}/manifest.json`);
    if (!m.ok) return { status: 'skip', msg: 'manifest 不可读' };
    const bad = [];
    for (const f of m.data) {
      const j = readJson(`${AI_DIR}/${f}`);
      if (!j.ok) continue;
      (j.data.items || []).forEach((it, i) => {
        const lat = Number(it.lat), lng = Number(it.lng);
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) bad.push(`${f}[${i}] ${it.name}: ${lat},${lng}`);
      });
    }
    if (bad.length) return { status: 'fail', msg: `${bad.length} 条越界`, detail: bad.slice(0, 20) };
    return { status: 'pass', msg: '全部在合法范围' };
  }
});

// ===== C 服务一致性 =====
add({
  id: 'C1', group: 'C 服务一致性', name: 'dev(5173) 可达', severity: 'info',
  async run() {
    const r = await probe('http://localhost:5173/');
    return r.ok ? { status: 'pass', msg: `HTTP ${r.status}` } : { status: 'skip', msg: '未运行' };
  }
});

add({
  id: 'C2', group: 'C 服务一致性', name: 'preview(4173) 可达', severity: 'info',
  async run() {
    const r = await probe('http://localhost:4173/');
    return r.ok ? { status: 'pass', msg: `HTTP ${r.status}` } : { status: 'skip', msg: '未运行' };
  }
});

add({
  id: 'C3', group: 'C 服务一致性', name: '服务端 manifest 与磁盘一致', severity: 'error',
  async run() {
    const disk = readJson(`${AI_DIR}/manifest.json`);
    if (!disk.ok) return { status: 'skip', msg: '磁盘 manifest 不可读' };
    const df = new Set(disk.data);
    const results = [];
    for (const port of [5173, 4173]) {
      const r = await probe(`http://localhost:${port}/ai-import/manifest.json`);
      if (!r.ok) { results.push({ port, skip: true }); continue; }
      let srv;
      try { srv = JSON.parse(r.text); }
      catch {
        // 🚨 SPA fallback：文件不存在时 preview 返回 index.html（HTTP 200 + HTML），
        //    不能误报成「JSON 非法」—— 那是「该路径下无此文件」的另一种表现。
        const isHtml = /^\s*<!doctype html/i.test(r.text) || /^\s*<html/i.test(r.text);
        results.push({ port, bad: isHtml ? '该端口未提供 ai-import（返回 index.html）' : '服务端 manifest JSON 非法' });
        continue;
      }
      const sf = new Set(srv);
      results.push({
        port,
        miss: [...df].filter(f => !sf.has(f)),
        extra: [...sf].filter(f => !df.has(f))
      });
    }
    const active = results.filter(r => !r.skip);
    if (active.length === 0) return { status: 'skip', msg: '两端均未运行' };
    const probs = active.filter(r => r.bad || (r.miss && r.miss.length) || (r.extra && r.extra.length));
    if (probs.length) {
      const detail = [];
      probs.forEach(p => {
        if (p.bad) detail.push(`${p.port}: ${p.bad}`);
        (p.miss || []).forEach(f => detail.push(`${p.port} 缺: ${f}`));
        (p.extra || []).forEach(f => detail.push(`${p.port} 多: ${f}`));
      });
      return { status: 'fail', msg: `${probs.length} 个端口不一致`, detail };
    }
    return { status: 'pass', msg: active.map(r => r.port).join(' / ') + ' 与磁盘一致' };
  }
});

add({
  id: 'C4', group: 'C 服务一致性', name: '批次文件服务端可达', severity: 'error',
  async run() {
    const disk = readJson(`${AI_DIR}/manifest.json`);
    if (!disk.ok) return { status: 'skip', msg: 'manifest 不可读' };
    const dead = [];
    let probed = 0;
    for (const port of [5173, 4173]) {
      const root = await probe(`http://localhost:${port}/`);
      if (!root.ok) continue;
      probed++;
      for (const f of disk.data) {
        const r = await probe(`http://localhost:${port}/ai-import/${f}`, 4000);
        if (!r.ok) dead.push(`${port}: ${f} → HTTP ${r.status}`);
      }
    }
    if (probed === 0) return { status: 'skip', msg: '两端均未运行' };
    if (dead.length) return { status: 'fail', msg: `${dead.length} 个不可达`, detail: dead.slice(0, 20) };
    return { status: 'pass', msg: `${probed} 个服务全部可达` };
  }
});

// ===== D 代码健康 =====
add({
  id: 'D1', group: 'D 代码健康', name: '临时调试代码残留', severity: 'warn',
  run() {
    const r = sh('git grep -n -E "临时调试|TEMP-DEBUG" -- "src/*"');
    if (!r.ok || !r.out.trim()) return { status: 'pass', msg: '无残留' };
    const lines = r.out.trim().split('\n');
    return { status: 'fail', msg: `${lines.length} 处残留`, detail: lines.slice(0, 15) };
  }
});

add({
  id: 'D2', group: 'D 代码健康', name: '红线文件改动（自上次提交）', severity: 'info',
  run() {
    if (!exists('.cache/integrity-baseline.json')) {
      return { status: 'skip', msg: '未建基线（npm run integrity snapshot）' };
    }
    const r = sh('node scripts/integrity.mjs check');
    if (r.ok) return { status: 'pass', msg: '与基线一致' };
    // 🚨 基线是某一时刻的固定快照，正常开发后必然失配 ⇒ 只作知情提示，不计为问题。
    const lines = r.out.split('\n').filter(l => /^\s+[-+]/.test(l));
    return { status: 'pass', msg: `${lines.length} 个红线文件相对基线有变化（知情项）`, detail: lines.slice(0, 15) };
  }
});

add({
  id: 'D3', group: 'D 代码健康', name: '无合并冲突标记', severity: 'error',
  run() {
    const r = sh('git grep -n -E "^(<<<<<<<|>>>>>>>)" -- "src/*" "scripts/*"');
    if (!r.ok || !r.out.trim()) return { status: 'pass', msg: '无冲突标记' };
    return { status: 'fail', msg: '存在冲突标记', detail: r.out.trim().split('\n').slice(0, 10) };
  }
});

// ===== E 仓库状态 =====
add({
  id: 'E1', group: 'E 仓库状态', name: '工作区状态概览', severity: 'info',
  run() {
    const r = sh('git status --short');
    const lines = r.out.trim() ? r.out.trim().split('\n') : [];
    if (!lines.length) return { status: 'pass', msg: '工作区干净' };
    const mod = lines.filter(l => /^\s?M/.test(l)).length;
    const unt = lines.filter(l => l.startsWith('??')).length;
    return { status: 'pass', msg: `已改 ${mod} · 未跟踪 ${unt}`, detail: lines.slice(0, 20) };
  }
});

add({
  id: 'E2', group: 'E 仓库状态', name: 'webcode 权限开关', severity: 'info',
  run() {
    const r = sh('npm run webcode -- status');
    const line = r.out.split('\n').find(l => l.includes('ON') || l.includes('OFF')) || '';
    return { status: 'pass', msg: line.trim() || '未知' };
  }
});

// ───────────────────────── 主流程 ─────────────────────────

const ICON = { pass: '✅', fail: '❌', skip: '⏭️' };

async function main() {
  const started = Date.now();
  const results = [];

  for (const c of checks) {
    let res;
    try { res = await c.run(); }
    catch (e) { res = { status: 'fail', msg: '检查异常: ' + e.message }; }
    results.push({ ...c, ...res });
  }

  const fixed = [];
  if (FIX) {
    for (const r of results) {
      if (r.status === 'fail' && typeof r.fix === 'function') {
        try { fixed.push({ id: r.id, msg: r.fix() }); r.fixed = true; }
        catch (e) { fixed.push({ id: r.id, msg: '修复失败: ' + e.message }); }
      }
    }
  }

  const pass = results.filter(r => r.status === 'pass').length;
  const fail = results.filter(r => r.status === 'fail');
  const skip = results.filter(r => r.status === 'skip').length;

  if (JSON_OUT) {
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      durationMs: Date.now() - started,
      summary: { pass, fail: fail.length, skip },
      fixed,
      results: results.map(r => ({ id: r.id, group: r.group, name: r.name, status: r.status, msg: r.msg, detail: r.detail || [] }))
    }, null, 2));
    return;
  }

  console.log('');
  console.log('═'.repeat(62));
  console.log(`  🔍 全流程监控 · ${new Date().toLocaleString('zh-CN')}`);
  console.log('═'.repeat(62));

  let curGroup = '';
  for (const r of results) {
    if (r.group !== curGroup) { curGroup = r.group; console.log(`\n【${curGroup}】`); }
    const mark = r.fixed ? '🔧' : ICON[r.status];
    console.log(`  ${mark} ${r.id} ${r.name.padEnd(26)} ${r.msg}`);
    if (r.detail && r.detail.length && r.status === 'fail') {
      r.detail.slice(0, 10).forEach(d => console.log(`       · ${d}`));
      if (r.detail.length > 10) console.log(`       · …还有 ${r.detail.length - 10} 条`);
    }
  }

  console.log('\n' + '─'.repeat(62));
  console.log(`  汇总：${pass} 通过 · ${fail.length} 问题 · ${skip} 跳过 · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (fixed.length) {
    console.log(`  🔧 自动修复 ${fixed.length} 项：`);
    fixed.forEach(f => console.log(`     ${f.id}: ${f.msg}`));
  }
  if (fail.length && !FIX) {
    const fixable = fail.filter(f => typeof f.fix === 'function');
    if (fixable.length) console.log(`  💡 可自动修复 ${fixable.length} 项 → npm run monitor -- --fix`);
  }
  console.log('─'.repeat(62));
  console.log('');

  process.exit(fail.length ? 1 : 0);
}

main();
