// scripts/crawl/lib.mjs —— 核心库：抓取 / 提取 / 缓存 / 搜索 / 并发
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

// ===== 安全边界 =====
// 详细策略见 .agents/references/crawl-security.md
export const MAX_BYTES = 5 * 1024 * 1024;       // 单次响应 5MB 上限
export const MAX_REDIRECTS = 3;                  // 重定向最多 3 跳
export const CT_WHITELIST = [                    // 内容类型白名单
  'text/html', 'text/plain', 'text/xml', 'application/xml',
  'application/json', 'application/xhtml+xml', 'text/markdown'
];

// 内网 / 危险 IP 段（SSRF 防护）
function isBlockedIp(ip) {
  if (!ip) return true;
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;      // link-local
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;  // CGNAT
    if (p[0] >= 224) return true;                       // 组播 / 保留
    return false;
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd')) return true;
    if (low.startsWith('ff')) return true;
    return false;
  }
  return true;
}

// URL 语法 + 主机名校验（未做 DNS，只做静态检查）
export function validateUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (e) { return { ok: false, reason: 'URL 语法非法' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: '仅允许 http(s)，拒绝 ' + u.protocol };
  }
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: '空主机名' };
  if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, reason: '拒绝 localhost' };
  if (host.endsWith('.local') || host.endsWith('.internal')) return { ok: false, reason: '拒绝内网后缀' };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isBlockedIp(host)) {
    return { ok: false, reason: '拒绝内网 IP: ' + host };
  }
  if (host.includes(':') && isBlockedIp(host)) {
    return { ok: false, reason: '拒绝内网 IPv6: ' + host };
  }
  return { ok: true, url: u.toString(), host };
}

// 解析后二次校验（防 DNS rebinding / A 记录指向内网）
export async function validateUrlResolved(rawUrl) {
  const v = validateUrl(rawUrl);
  if (!v.ok) return v;
  const host = v.host;
  if (isIP(host)) return v;  // 字面量 IP 已在上一步校验
  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    for (const a of addrs) {
      if (isBlockedIp(a.address)) {
        return { ok: false, reason: 'DNS 解析到内网地址 ' + a.address + '（' + host + '）' };
      }
    }
    return { ok: true, url: v.url, host, resolvedIps: addrs.map(a => a.address) };
  } catch (e) {
    return { ok: false, reason: 'DNS 解析失败：' + e.message };
  }
}

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_DIR = resolve(ROOT, '.cache/crawl');
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

// ---------- 缓存 ----------
export function cacheKey(type, target) {
  return createHash('sha1').update(type + ':' + target).digest('hex').slice(0, 16);
}
export function cacheGet(type, target, ttlDays = 7) {
  const f = resolve(CACHE_DIR, cacheKey(type, target) + '.json');
  if (!existsSync(f)) return null;
  try {
    const rec = JSON.parse(readFileSync(f, 'utf8'));
    const age = (Date.now() - new Date(rec.createdAt).getTime()) / 86400000;
    if (age > (rec.ttlDays || ttlDays)) return null;
    return rec;
  } catch (e) { return null; }
}
export function cacheSet(type, target, data, ttlDays = 7) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const rec = { type, target, createdAt: new Date().toISOString(), ttlDays, data };
  writeFileSync(resolve(CACHE_DIR, cacheKey(type, target) + '.json'), JSON.stringify(rec, null, 2), 'utf8');
  return rec;
}
export function cacheList() {
  if (!existsSync(CACHE_DIR)) return [];
  return readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).map(f => {
    try { const r = JSON.parse(readFileSync(resolve(CACHE_DIR, f), 'utf8')); return { file: f, type: r.type, target: r.target, createdAt: r.createdAt }; }
    catch (e) { return { file: f, corrupt: true }; }
  });
}
export function cacheClear() {
  if (!existsSync(CACHE_DIR)) return 0;
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  files.forEach(f => unlinkSync(resolve(CACHE_DIR, f)));
  return files.length;
}

// ---------- 抓取 ----------
// 单次 fetch（手动跟随重定向，每跳重校验 URL）
async function fetchOnce(url, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8' },
      signal: ctrl.signal,
      redirect: 'manual'  // 手动处理重定向（每跳都过白名单）
    });
  } finally { clearTimeout(timer); }
  return res;
}

export async function fetchText(rawUrl, { timeout = 20000, retries = 2, useCache = true } = {}) {
  // 0) 静态 URL 校验
  const v0 = validateUrl(rawUrl);
  if (!v0.ok) throw new Error('[安全] ' + v0.reason);

  // 1) 缓存（命中即返回，不触网）
  if (useCache) {
    const c = cacheGet('fetch', v0.url);
    if (c && c.data && typeof c.data.html === 'string') {
      return { html: c.data.html, fromCache: true, finalUrl: c.data.finalUrl || v0.url };
    }
  }

  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      let cur = v0.url;
      let hops = 0;
      let res = await fetchOnce(cur, timeout);

      // 手动处理重定向
      while (res.status >= 300 && res.status < 400 && hops < MAX_REDIRECTS) {
        const loc = res.headers.get('location');
        if (!loc) break;
        const next = new URL(loc, cur).toString();
        const v = validateUrl(next);
        if (!v.ok) throw new Error('[安全] 重定向被拒：' + v.reason);
        cur = v.url;
        hops++;
        res = await fetchOnce(cur, timeout);
      }
      if (hops >= MAX_REDIRECTS && res.status >= 300 && res.status < 400) {
        throw new Error('[安全] 重定向超过 ' + MAX_REDIRECTS + ' 跳');
      }

      if (!res.ok) throw new Error('HTTP ' + res.status);

      // 2) Content-Type 白名单
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const ctOk = CT_WHITELIST.some(t => ct.includes(t));
      if (!ctOk) throw new Error('[安全] Content-Type 不在白名单: ' + (ct || '(空)'));

      // 3) 响应大小上限（先看 content-length，无则流式累计）
      const cl = Number(res.headers.get('content-length') || 0);
      if (cl && cl > MAX_BYTES) throw new Error('[安全] 响应过大 ' + cl + ' 字节（上限 ' + MAX_BYTES + '）');

      const reader = res.body && res.body.getReader ? res.body.getReader() : null;
      let html = '';
      if (reader) {
        const dec = new TextDecoder('utf-8');
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BYTES) { try { reader.cancel(); } catch (e) {} throw new Error('[安全] 响应超过 ' + MAX_BYTES + ' 字节，已中止'); }
          html += dec.decode(value, { stream: true });
        }
        html += dec.decode();
      } else {
        html = await res.text();
        if (Buffer.byteLength(html) > MAX_BYTES) throw new Error('[安全] 响应过大');
      }

      if (useCache) cacheSet('fetch', v0.url, { html, finalUrl: cur });
      return { html, fromCache: false, finalUrl: cur };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ---------- HTML → 文本 ----------
export function htmlToText(html) {
  if (!html) return '';
  let s = html.replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?(p|div|br|hr|li|tr|h[1-6]|section|article|blockquote|pre|ul|ol|table)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return s;
}

// 从 HTML 提取外链（用于搜索结果）
export function extractLinks(html, baseUrl = '') {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let url = m[1];
    if (!url || url.startsWith('#') || url.startsWith('javascript:')) continue;
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/') && baseUrl) { try { url = new URL(url, baseUrl).toString(); } catch (e) { continue; } }
    if (!/^https?:\/\//.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = htmlToText(m[2]).replace(/\s+/g, ' ').trim().slice(0, 160);
    out.push({ url, title });
  }
  return out;
}

// ---------- 并发限流 ----------
export async function pMap(items, fn, concurrency = 5) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: e.message }; }
    }
  }
  await Promise.all(Array(Math.min(concurrency, items.length || 1)).fill(0).map(worker));
  return out;
}

// ---------- 搜索 ----------
export async function bingSearch(query, limit = 10) {
  const url = 'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&count=' + Math.max(10, limit);
  const c = cacheGet('search', 'bing:' + query);
  let html;
  if (c) html = c.data.html;
  else { html = (await fetchText(url, { useCache: false })).html; cacheSet('search', 'bing:' + query, { html }); }
  const links = extractLinks(html, url).filter(l => !/(^|\.)bing\.com\//.test(l.url));
  const out = [];
  const seen = new Set();
  for (const l of links) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

export async function ddgSearch(query, limit = 10) {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const c = cacheGet('search', 'ddg:' + query);
  let html;
  if (c) html = c.data.html;
  else { html = (await fetchText(url, { useCache: false })).html; cacheSet('search', 'ddg:' + query, { html }); }
  const links = extractLinks(html, url).filter(l => !/(^|\.)duckduckgo\.com\//.test(l.url));
  const out = [];
  const seen = new Set();
  for (const l of links) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}
