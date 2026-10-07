// scripts/collect/extract.mjs
// 列表页 → collect 草稿 JSON
//
// 定位：C3 优化项。把 fetch 到的赛事列表页，自动解析成 collect 草稿，
//       免去 AI 手工整理，实现「fetch 列表 → extract 草稿 → collect build」全自动。
//
// 用法：
//   npm run collect -- extract --url=https://chinamarathon.com --month=2026-12 --out=draft.json
//   npm run collect -- extract --file=page.html --month=2026-12 --out=draft.json
//   npm run collect -- extract --url=... --month=2026-12 --dry-run
//
// 参数：
//   --url=<url>      从网址抓取（带重试）
//   --file=<path>    从本地文件读取（抓取失败时的兜底）
//   --month=YYYY-MM  只保留该月赛事（可选，不填则全部）
//   --group=<name>   分组名（默认从月份推导）
//   --out=<path>     输出草稿文件（默认 .cache/collect/_draft.json）
//   --dry-run        只打印，不写文件
//
// 解析策略（chinamarathon 结构）：
//   文本中每三个连续行构成一条：名称 / 日期 / 地点
//   日期行形如「2026年11月22日」，地点行含「・」分隔

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../crawl/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const flags = {};
for (const a of args) {
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else flags[a.slice(2)] = true;
  }
}

// ---------- 抓取（复用 crawl/lib.mjs：带缓存 + 重试 + 统一 UA）----------
async function fetchHtml(url) {
  const { html, fromCache } = await fetchText(url);
  if (fromCache) console.log('(来自缓存)');
  return html;
}

// ---------- HTML → 纯文本行 ----------
function htmlToLines(html) {
  let s = html.replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?(p|div|br|hr|li|tr|h[1-6]|section|article|td|th)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return s.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// ---------- 解析：名称/日期/地点 三元组 ----------
const DATE_RE = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/;

function parseTriplets(lines) {
  const out = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const m = lines[i].match(DATE_RE);
    if (!m) continue;
    const name = lines[i - 1];
    const dateRaw = lines[i];
    const place = lines[i + 1];
    // 名称应像赛事名（含「马拉松」等关键词，且不是日期/地点）
    if (!/马拉松|越野|跑|赛/.test(name)) continue;
    if (DATE_RE.test(place)) continue;
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, '0');
    const dd = String(m[3]).padStart(2, '0');
    out.push({ name, date: `${yyyy}-${mm}-${dd}`, dateRaw, place });
  }
  return out;
}

// ---------- 日期 → 中文 time ----------
function toChineseTime(dateRaw) {
  return dateRaw; // 已是「2026年11月22日」
}

// ---------- 地点 → 地理编码地址 ----------
// 输入形如「福建・南平市武夷山市・武夷广场」「甘肃・兰州市」
function toGeocodeAddress(place) {
  if (!place) return '';
  const parts = place.split('・').map((s) => s.trim()).filter(Boolean);
  // 去掉首段省份（高德对「省+市+场馆」更稳，但保留亦可）；直接拼接去分隔符
  return parts.join('');
}

// ---------- 骨架简介（基于真实元数据，不编造）----------
// 说明：仅使用名称/时间/地点等已确认事实，不虚构赛事规模、历史等信息。
//       AI 可在 build 前按需充实（补充真实的项目设置、报名信息等）。
function makeIntro(name, time, place) {
  const year = (time.match(/^(\d{4})/) || [])[1] || '';
  return `<p><strong>赛事名称</strong>：${name}</p><p><strong>举办时间</strong>：${time}</p><p><strong>举办地点</strong>：${place}</p><p>本赛事已列入 ${year} 年国内马拉松及路跑赛事日程，比赛时间为 ${time}，举办地点位于${place}。作为一项正式路跑赛事，通常设置全程马拉松、半程马拉松等竞赛项目，具体项目设置以赛事章程为准。赛事的报名时间、参赛规模、赛道线路及认证等级等信息，请以赛事组委会官方发布为准。</p>`;
}

// ---------- 主流程 ----------
async function main() {
  let html;
  if (flags.url) {
    process.stdout.write('抓取 ' + flags.url + ' ... ');
    html = await fetchHtml(String(flags.url));
    console.log('OK (' + html.length + ' 字节)');
  } else if (flags.file) {
    const p = resolve(ROOT, String(flags.file));
    if (!existsSync(p)) { console.error('文件不存在: ' + flags.file); process.exit(1); }
    html = readFileSync(p, 'utf8');
    console.log('读取本地文件: ' + flags.file + ' (' + html.length + ' 字节)');
  } else {
    console.error('缺少 --url 或 --file');
    process.exit(1);
  }

  const lines = htmlToLines(html);
  let trips = parseTriplets(lines);
  console.log('解析到赛事条目: ' + trips.length);

  // 月份过滤
  if (flags.month) {
    const before = trips.length;
    trips = trips.filter((t) => t.date.startsWith(String(flags.month)));
    console.log('按 ' + flags.month + ' 过滤: ' + before + ' → ' + trips.length);
  }

  if (!trips.length) {
    console.log('⚠️ 无匹配条目（可能该月无赛事，或页面结构变化）');
    process.exit(0);
  }

  const items = trips.map((t) => ({
    name: t.name,
    start: toGeocodeAddress(t.place),
    address: t.place,
    time: toChineseTime(t.dateRaw),
    intro: makeIntro(t.name, t.dateRaw, t.place),
    images: [],
  }));

  const monthLabel = flags.month ? String(flags.month).replace('-', '年') + '月' : '';
  const group = flags.group || (monthLabel ? monthLabel + '马拉松赛事' : '赛事清单');
  const draft = {
    group,
    batchName: group + ' · extract 草稿',
    markerColor: '#1890ff',
    items,
  };

  console.log('\n前 3 条预览:');
  items.slice(0, 3).forEach((it, i) => {
    console.log('  [' + (i + 1) + '] ' + it.name + ' | ' + it.time + ' | ' + it.address + ' → geocode: ' + it.start);
  });

  if (flags['dry-run']) {
    console.log('\n(--dry-run，未写文件)');
    return;
  }

  const outPath = String(flags.out || '.cache/collect/_draft.json');
  const full = resolve(ROOT, outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(draft, null, 2) + '\n', 'utf8');
  console.log('\n✅ 草稿已写入: ' + outPath + '（' + items.length + ' 条）');
  console.log('下一步: npm run collect -- build ' + outPath);
}

main().catch((e) => { console.error('❌ 执行失败:', e.message); process.exit(1); });
