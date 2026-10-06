// src/groups/geo/utils/geocoder.js
/**
 * 多平台地理编码器（带自动降级）
 *
 * 背景：高德 geocode 有每日免费额度，用完后需自动切换到其他平台的免费额度。
 * 定位：本文件是「采集阶段的兜底工具」，仅当百科词条取不到坐标时才调用。
 *      导入器 aiImporter.js 仍不调 geocode，保持「导入零消耗」约定不变。
 *
 * 平台优先级（依次尝试）：
 *   1. amap      高德（项目内置 key，额度有限）
 *   2. baidu     百度（需 localStorage['geo_baidu_ak']）
 *   3. tianditu  天地图（需 localStorage['geo_tianditu_tk']）
 *   4. nominatim OpenStreetMap（免费无 key，国内可能不可达）
 *
 * 额度耗尽判定：命中各平台的额度错误码时，标记该平台「当日耗尽」，
 *             当日不再尝试，自动跳到下一个平台；次日自动重置。
 */

const QUOTA_STATE_KEY = 'geo_geocode_quota_state';
const CACHE_KEY = 'geo_geocode_cache';
const CACHE_MAX = 2000;

// ---------- key 读取（localStorage 可覆盖） ----------
const getAmapKey = () =>
  localStorage.getItem('geo_amap_key') || '69d86725ca981d56159af949ce2a68ec';
const getBaiduAk = () => localStorage.getItem('geo_baidu_ak') || '';
const getTiandituTk = () => localStorage.getItem('geo_tianditu_tk') || '';

// ---------- 额度状态（跨日自动重置） ----------
const today = () => new Date().toISOString().slice(0, 10);

const readQuotaState = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_STATE_KEY) || '{}');
    const d = today();
    for (const k of Object.keys(raw)) {
      if (raw[k] && raw[k].date !== d) delete raw[k];
    }
    return raw;
  } catch {
    return {};
  }
};

const writeQuotaState = (state) => {
  try {
    localStorage.setItem(QUOTA_STATE_KEY, JSON.stringify(state));
  } catch {}
};

const isExhausted = (state, providerId) => !!state[providerId];

const markExhausted = (providerId, reason) => {
  const state = readQuotaState();
  state[providerId] = { date: today(), reason, at: Date.now() };
  writeQuotaState(state);
  console.warn('[geocoder] ' + providerId + ' 额度耗尽，今日降级：' + reason);
};

// ---------- 结果缓存 ----------
const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCache = (cache) => {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      const sorted = keys.sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0));
      sorted.slice(0, keys.length - CACHE_MAX).forEach((k) => delete cache[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
};

const cacheKey = (addr) => 'k:' + String(addr).trim().toLowerCase();

// ---------- 各平台实现 ----------

// 高德
const geocodeAmap = async (address) => {
  const key = getAmapKey();
  if (!key) return { ok: false, reason: 'no-key' };
  const url =
    'https://restapi.amap.com/v3/geocode/geo?address=' +
    encodeURIComponent(address) +
    '&key=' + key;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
    const parts = data.geocodes[0].location.split(',').map(Number);
    return { ok: true, lng: parts[0], lat: parts[1], source: 'amap', formatted: data.geocodes[0].formatted_address || '' };
  }
  const QUOTA = ['10003', '10044', '10004', '10019', '10020', '10021', '10029'];
  if (QUOTA.includes(String(data.infocode))) {
    return { ok: false, quota: true, reason: (data.info || '') + '(' + data.infocode + ')' };
  }
  return { ok: false, reason: data.info || 'no-result' };
};

// 百度
const geocodeBaidu = async (address) => {
  const ak = getBaiduAk();
  if (!ak) return { ok: false, reason: 'no-key' };
  const url =
    'https://api.map.baidu.com/geocoding/v3/?address=' +
    encodeURIComponent(address) +
    '&output=json&ak=' + ak;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 0 && data.result && data.result.location) {
    return { ok: true, lng: data.result.location.lng, lat: data.result.location.lat, source: 'baidu', formatted: data.result.precise ? '' : '' };
  }
  // 百度额度不足常见状态码：302 / 401 / 4 / 5
  if ([302, 401, 4, 5].includes(Number(data.status))) {
    return { ok: false, quota: true, reason: 'baidu status ' + data.status };
  }
  return { ok: false, reason: 'baidu status ' + data.status };
};

// 天地图
const geocodeTianditu = async (address) => {
  const tk = getTiandituTk();
  if (!tk) return { ok: false, reason: 'no-key' };
  const ds = encodeURIComponent(JSON.stringify({ keyWord: address }));
  const url = 'http://api.tianditu.gov.cn/geocoder?ds=' + ds + '&tk=' + tk;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === '0' && data.location) {
    return { ok: true, lng: Number(data.location.lon), lat: Number(data.location.lat), source: 'tianditu', formatted: data.location.keyWord || '' };
  }
  // 天地图额度/权限错误
  const msg = String(data.msg || '');
  if (/quota|limit|权限|额度|超出/i.test(msg)) {
    return { ok: false, quota: true, reason: msg };
  }
  return { ok: false, reason: msg || 'no-result' };
};

// OpenStreetMap Nominatim（免费无 key）
const geocodeNominatim = async (address) => {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(address);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return { ok: false, reason: 'http ' + res.status };
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) {
    return { ok: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), source: 'nominatim', formatted: data[0].display_name || '' };
  }
  return { ok: false, reason: 'no-result' };
};

// ---------- 平台注册表（顺序即优先级） ----------
const PROVIDERS = [
  { id: 'amap', fn: geocodeAmap, enabled: () => !!getAmapKey() },
  { id: 'baidu', fn: geocodeBaidu, enabled: () => !!getBaiduAk() },
  { id: 'tianditu', fn: geocodeTianditu, enabled: () => !!getTiandituTk() },
  { id: 'nominatim', fn: geocodeNominatim, enabled: () => true },
];

/**
 * 单地址地理编码（多平台自动降级）
 * @param {string} address
 * @param {{noCache?:boolean}} opts
 * @returns {Promise<{lat:number,lng:number,source:string,formatted:string}|null>}
 */
export const geocodeAddress = async (address, opts = {}) => {
  if (!address || String(address).trim() === '') return null;

  const ck = cacheKey(address);
  const cache = readCache();
  if (cache[ck] && !opts.noCache) return cache[ck].val;

  const state = readQuotaState();

  for (const p of PROVIDERS) {
    if (!p.enabled()) continue;
    if (isExhausted(state, p.id)) continue;
    try {
      const r = await p.fn(address);
      if (r.ok) {
        const val = { lat: r.lat, lng: r.lng, source: r.source, formatted: r.formatted || '' };
        cache[ck] = { val, at: Date.now() };
        writeCache(cache);
        return val;
      }
      if (r.quota) markExhausted(p.id, r.reason);
      // 非额度错误（如未找到）→ 继续尝试下一个平台
    } catch (e) {
      console.warn('[geocoder] ' + p.id + ' 异常:', e);
    }
  }
  return null;
};

/**
 * 批量地理编码（带节流，默认 300ms/条）
 * @param {string[]} addresses
 * @param {{delay?:number, onProgress?:(i:number,total:number,name:string)=>void}} opts
 */
export const geocodeBatch = async (addresses, opts = {}) => {
  const delay = typeof opts.delay === 'number' ? opts.delay : 300;
  const out = [];
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    const val = await geocodeAddress(addr);
    out.push({ address: addr, ...(val || {}) });
    if (opts.onProgress) opts.onProgress(i + 1, addresses.length, addr);
    if (i < addresses.length - 1) await new Promise((r) => setTimeout(r, delay));
  }
  return out;
};

/** 查询当前各平台额度状态（供调试/展示） */
export const getGeocodeQuotaStatus = () => {
  const state = readQuotaState();
  return PROVIDERS.map((p) => ({
    id: p.id,
    enabled: p.enabled(),
    exhausted: isExhausted(state, p.id),
    reason: state[p.id] ? state[p.id].reason : '',
  }));
};

/** 手动重置额度状态（调试用） */
export const resetGeocodeQuota = () => {
  try {
    localStorage.removeItem(QUOTA_STATE_KEY);
  } catch {}
};
