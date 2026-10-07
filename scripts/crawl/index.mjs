// scripts/crawl/index.mjs —— CLI 入口
// 命令：search / fetch / batch / export / cache
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  fetchText, htmlToText, bingSearch, ddgSearch, pMap,
  cacheList, cacheClear, cacheGet, cacheSet, ROOT
} from './lib.mjs';

const [cmd, ...args] = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of args) {
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else flags[a.slice(2)] = true;
  } else positional.push(a);
}

const help = () => {
  console.log(`
用法：
  npm run crawl -- search "<query>" [--limit=10] [--engine=bing|ddg|all] [--text]
  npm run crawl -- fetch <url> [--text] [--maxChars=8000]
  npm run crawl -- batch <keywordFile> [--limit=5] [--engine=bing|ddg|all]
  npm run crawl -- export <name> --from=<jsonFile> --to=<outFile> --group=<group>
  npm run crawl -- cache <list|clear|get <type> <target>>
`);
};

async function doSearch(query) {
  const limit = Number(flags.limit || 10);
  const engine = String(flags.engine || 'all');
  let results = [];
  if (engine === 'bing' || engine === 'all') {
    try { results = await bingSearch(query, limit); } catch (e) { console.error('[bing] 失败:', e.message); }
  }
  if ((engine === 'ddg' || engine === 'all') && results.length < limit) {
    try {
      const more = await ddgSearch(query, limit - results.length);
      results = results.concat(more);
    } catch (e) { console.error('[ddg] 失败:', e.message); }
  }
  console.log(JSON.stringify({ query, count: results.length, results }, null, 2));
}

async function doFetch(url) {
  const maxChars = Number(flags.maxChars || 8000);
  const { html, fromCache } = await fetchText(url);
  const text = htmlToText(html);
  if (flags.text) {
    console.log('(来源: ' + (fromCache ? '缓存' : '网络') + ', 原始 ' + text.length + ' 字)\n');
    console.log(text.slice(0, maxChars));
    if (text.length > maxChars) console.log('\n...[截断，共 ' + text.length + ' 字，用 --maxChars=N 调整]');
  } else {
    console.log(JSON.stringify({ url, fromCache, chars: text.length, text: text.slice(0, maxChars) }, null, 2));
  }
}

async function doBatch(kwFile) {
  const full = resolve(ROOT, kwFile);
  if (!existsSync(full)) { console.error('关键词文件不存在:', kwFile); process.exit(1); }
  const keywords = readFileSync(full, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const limit = Number(flags.limit || 5);
  const engine = String(flags.engine || 'all');
  const results = await pMap(keywords, async (kw) => {
    let hits = [];
    if (engine === 'bing' || engine === 'all') {
      try { hits = await bingSearch(kw, limit); } catch (e) { /* ignore */ }
    }
    if ((engine === 'ddg' || engine === 'all') && hits.length < limit) {
      try { hits = hits.concat(await ddgSearch(kw, limit - hits.length)); } catch (e) { /* ignore */ }
    }
    return { keyword: kw, hits };
  }, 4);
  console.log(JSON.stringify({ total: keywords.length, results }, null, 2));
}

async function doExport(name) {
  if (!flags.from) { console.error('缺少 --from=<jsonFile>'); process.exit(1); }
  const src = resolve(ROOT, flags.from);
  if (!existsSync(src)) { console.error('源文件不存在:', flags.from); process.exit(1); }
  const raw = JSON.parse(readFileSync(src, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  const group = flags.group || name;
  const batchName = flags.batchName || name;
  const markerColor = flags.markerColor || '#1890ff';
  const out = { batchName, group, markerColor, items };
  const to = resolve(ROOT, flags.to || ('public/ai-import/' + name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-') + '.json'));
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, JSON.stringify(out, null, 2), 'utf8');
  console.log('✅ 导出成功');
  console.log('  批次:', batchName);
  console.log('  分组:', group);
  console.log('  条数:', items.length);
  console.log('  输出:', to);
  console.log('  ⚠️ 记得手动登记进 public/ai-import/manifest.json');
}

async function doCache() {
  const action = positional[0];
  if (action === 'list') {
    const list = cacheList();
    console.log(JSON.stringify({ count: list.length, items: list }, null, 2));
  } else if (action === 'clear') {
    const n = cacheClear();
    console.log('✅ 已清空缓存，删除', n, '个文件');
  } else if (action === 'get') {
    const type = positional[1], target = positional[2];
    if (!type || !target) { console.error('用法: cache get <type> <target>'); process.exit(1); }
    const rec = cacheGet(type, target);
    console.log(rec ? JSON.stringify(rec, null, 2) : '(未命中或已过期)');
  } else {
    console.error('用法: cache <list|clear|get <type> <target>>');
    process.exit(1);
  }
}

async function main() {
  if (!cmd) { help(); return; }
  try {
    if (cmd === 'search') await doSearch(positional.join(' '));
    else if (cmd === 'fetch') await doFetch(positional[0]);
    else if (cmd === 'batch') await doBatch(positional[0]);
    else if (cmd === 'export') await doExport(positional[0]);
    else if (cmd === 'cache') await doCache();
    else help();
  } catch (e) {
    console.error('❌ 执行失败:', e.message);
    process.exit(1);
  }
}
main();
