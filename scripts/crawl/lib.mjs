// scripts/crawl/lib.mjs —— 核心库：抓取 / 提取 / 缓存 / 搜索 / 并发
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
export async function fetchText(url, { timeout = 20000, retries = 2, useCache = true } = {}) {
  if (useCache) {
    const c = cacheGet('fetch', url);
    if (c && c.data && typeof c.data.html === 'string') return { html: c.data.html, fromCache: true };
  }
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }, signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      if (useCache) cacheSet('fetch', url, { html });
      return { html, fromCache: false };
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
