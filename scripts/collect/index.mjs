// scripts/collect/index.mjs
// 采集流水线：草稿 JSON → 批量地理编码 → ai-import 契约 → 写文件 + 更新 manifest + 校验
//
// 定位：把「确定性体力活」全自动化，AI 只负责「搜索 + 整理草稿」。
// 依赖：Node 原生 fetch（零新依赖）；复用 scripts/data-ops.mjs 做带备份的写入。
//
// 用法：
//   npm run collect -- build <draft.json> [--dry-run]
//   npm run collect -- geocode "<地址>"
//   npm run collect -- check public/ai-import/<name>.json
//
// 草稿格式（AI 产出）：
// {
//   "group": "2026年12月全国马拉松赛事",
//   "batchName": "2026年12月全国马拉松赛事 · 第一批",
//   "markerColor": "#1890ff",
//   "items": [
//     { "name": "2026上海马拉松", "start": "上海市外滩", "address": "上海市黄浦区中山东一路",
//       "time": "2026年12月6日", "intro": "<p>...</p>", "images": [] }
//   ]
// }
// 说明：`start` 仅用于地理编码，编码成功后会转为 lat/lng 并从输出中移除。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AMAP_KEY = process.env.AMAP_KEY || '69d86725ca981d56159af949ce2a68ec';
const CACHE_FILE = resolve(ROOT, '.cache/collect/geocode.json');
const TMP_FILE = '.cache/collect/_tmp.json';
const AI_DIR = resolve(ROOT, 'public/ai-import');
const PENDING_FILE = 'public/pending-unplaced/pending.json';

// ---------- 参数 ----------
const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of rest) {
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else flags[a.slice(2)] = true;
  } else positional.push(a);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => String(s).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const plainText = (s) => String(s || '').replace(/<[^>]+>/g, '').trim();

// ---------- 地理编码缓存 ----------
function readCache() {
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function writeCache(c) {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2), 'utf8');
}

async function geocode(address, cache) {
  const k = String(address).trim();
  if (!k) return null;
  if (k in cache) return cache[k];
  let out = null;
  try {
    const url = 'https://restapi.amap.com/v3/geocode/geo?address=' + encodeURIComponent(k) + '&key=' + AMAP_KEY;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === '1' && data.geocodes && data.geocodes.length) {
      const [lng, lat] = data.geocodes[0].location.split(',').map(Number);
      out = { lng, lat, formatted: data.geocodes[0].formatted_address || '' };
    }
  } catch (e) {
    out = null;
  }
  cache[k] = out;
  writeCache(cache);
  await sleep(200); // 节流，保护高德额度
  return out;
}

// ---------- 带备份的写入（复用 data-ops 白名单） ----------
function writeViaDataOps(relPath, content) {
  mkdirSync(dirname(resolve(ROOT, TMP_FILE)), { recursive: true });
  writeFileSync(resolve(ROOT, TMP_FILE), content, 'utf8');
  const r = spawnSync(process.execPath, ['scripts/data-ops.mjs', 'write', relPath, TMP_FILE], {
    cwd: ROOT, encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error('data-ops 写入失败：' + (r.stderr || r.stdout || 'unknown'));
  return (r.stdout || '').trim();
}

// ---------- 校验 ----------
function validateItems(items) {
  const problems = [];
  items.forEach((it, i) => {
    const tag = '[' + (i + 1) + '] ' + (it.name || '(无名)');
    if (!it.name) problems.push(tag + '：缺少 name');
    if (typeof it.lat !== 'number' || Number.isNaN(it.lat) || it.lat < -90 || it.lat > 90) problems.push(tag + '：lat 非法 (' + it.lat + ')');
    if (typeof it.lng !== 'number' || Number.isNaN(it.lng) || it.lng < -180 || it.lng > 180) problems.push(tag + '：lng 非法 (' + it.lng + ')');
    if (!it.time) problems.push(tag + '：缺少 time（时间敏感数据必填）');
    const len = plainText(it.intro).length;
    if (len < 100) problems.push(tag + '：intro 去标签仅 ' + len + ' 字（需 ≥100）');
  });
  return problems;
}

// ---------- 命令：geocode ----------
async function doGeocode(addr) {
  if (!addr) { console.error('用法: npm run collect -- geocode "<地址>"'); process.exit(1); }
  const cache = readCache();
  const g = await geocode(addr, cache);
  console.log(JSON.stringify(g ? { ok: true, ...g } : { ok: false, reason: '未取到坐标' }, null, 2));
}

// ---------- 命令：check ----------
async function doCheck(file) {
  if (!file) { console.error('用法: npm run collect -- check public/ai-import/<name>.json'); process.exit(1); }
  const full = resolve(ROOT, file);
  if (!existsSync(full)) { console.error('文件不存在:', file); process.exit(1); }
  const d = JSON.parse(readFileSync(full, 'utf8'));
  const items = d.items || [];
  const problems = validateItems(items);
  console.log('条数:', items.length);
  if (problems.length) { console.log('❌ 问题 ' + problems.length + ' 项：'); problems.forEach((p) => console.log('  - ' + p)); process.exit(1); }
  console.log('✅ 校验通过');
}

// ---------- 命令：build ----------
async function doBuild(draftPath) {
  if (!draftPath) { console.error('用法: npm run collect -- build <draft.json> [--dry-run]'); process.exit(1); }
  const draftFull = resolve(ROOT, draftPath);
  if (!existsSync(draftFull)) { console.error('草稿不存在:', draftPath); process.exit(1); }
  const draft = JSON.parse(readFileSync(draftFull, 'utf8'));
  const group = draft.group || flags.group || '未命名分组';
  const batchName = draft.batchName || group;
  const markerColor = draft.markerColor || '#1890ff';
  const outName = flags.out || slug(group) + '.json';

  const cache = readCache();
  const items = [];
  const pending = [];
  const list = draft.items || [];
  process.stdout.write('地理编码 ' + list.length + ' 条');
  for (const it of list) {
    let lat = it.lat, lng = it.lng;
    if (lat == null || lng == null) {
      const addr = it.start || it.address;
      const g = addr ? await geocode(addr, cache) : null;
      if (g) { lat = g.lat; lng = g.lng; }
    }
    if (lat == null || lng == null) {
      pending.push({ name: it.name, region: it.address || it.start || '', group, reason: '地理编码未取到可信坐标：' + (it.start || it.address || '(空)') });
      process.stdout.write('.');
      continue;
    }
    const { start, ...keep } = it;
    items.push({ ...keep, lat: Number(lat), lng: Number(lng) });
    process.stdout.write('.');
  }
  process.stdout.write(' 完成\n');

  const problems = validateItems(items);
  console.log('成功 ' + items.length + ' 条，待处理 ' + pending.length + ' 条');
  if (problems.length) {
    console.log('⚠️ 校验问题 ' + problems.length + ' 项：');
    problems.forEach((p) => console.log('  - ' + p));
  } else {
    console.log('✅ 校验通过');
  }

  if (flags['dry-run']) {
    console.log('\n(--dry-run，未写任何文件)');
    console.log('预览首条:', JSON.stringify(items[0], null, 2));
    return;
  }

  const payload = { batchName, group, markerColor, items };
  const content = JSON.stringify(payload, null, 2) + '\n';
  console.log('\n' + writeViaDataOps('public/ai-import/' + outName, content));

  // 更新 manifest（合并去重）
  const mPath = resolve(AI_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
  if (!manifest.includes(outName)) manifest.push(outName);
  writeViaDataOps('public/ai-import/manifest.json', JSON.stringify(manifest, null, 4) + '\n');
  console.log('manifest 已更新，共 ' + manifest.length + ' 个批次');

  // 未取到坐标的入待处理库
  if (pending.length) {
    const pPath = resolve(ROOT, PENDING_FILE);
    let cur = { items: [] };
    if (existsSync(pPath)) { try { cur = JSON.parse(readFileSync(pPath, 'utf8')); } catch {} }
    let maxId = (cur.items || []).reduce((m, x) => Math.max(m, x.id || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    for (const e of pending) cur.items.push({ id: ++maxId, ...e, createdAt: today });
    writeViaDataOps(PENDING_FILE, JSON.stringify(cur, null, 2) + '\n');
    console.log('待处理库已追加 ' + pending.length + ' 条');
  }

  console.log('\n✅ 产出: public/ai-import/' + outName);
}

// ---------- 入口 ----------
async function main() {
  try {
    if (cmd === 'build') await doBuild(positional[0]);
    else if (cmd === 'geocode') await doGeocode(positional.join(' '));
    else if (cmd === 'check') await doCheck(positional[0]);
    else {
      console.log('\n用法：\n  npm run collect -- build <draft.json> [--dry-run]\n  npm run collect -- geocode "<地址>"\n  npm run collect -- check public/ai-import/<name>.json\n');
    }
  } catch (e) {
    console.error('❌ 执行失败:', e.message);
    process.exit(1);
  }
}
main();
