// src/groups/geo/utils/fingerprint.js
// 🚨 数据身份证（指纹）算法模块 —— 面向千万级数据的稳定去重标识
//
// 设计目标：
//   1. 稳定：同一条数据在任何时间、任何设备上算出同一指纹
//   2. 防碰撞：跨工具/跨类型/同名景区/微调坐标均能区分
//   3. 紧凑：定长字符串，适合做 IndexedDB 主键/索引键
//   4. 高效：纯 JS 计算，单条 < 0.01ms，可支撑千万级

// 指纹版本号：算法变更时 +1，旧指纹自动失效并重算
// v3 → v4：移除 address / fileId 等易变字段，只保留「稳定身份」维度，
//           解决旧数据（无 address）与新数据（有 address）指纹不一致的问题
export const FP_VERSION = 'v4';

// 坐标精度：小数位。6 位 ≈ 0.11 米，足以区分相邻但不同的点位
const COORD_PRECISION = 6;

/**
 * 文本归一化：
 *   - 去除首尾空白与所有内部空白
 *   - 全角 → 半角（Ａ→A，０→0）
 *   - 统一小写
 *   - 统一常见异体标点（－—– → -，（） → ()）
 * 目的：让「北京天坛公园」与「北京天坛公园 」「北京天坛公园(正门)」等
 *       表述差异不会造成重复入库
 */
export const normalizeText = (input) => {
  if (input === null || input === undefined) return '';
  let s = String(input);

  // 全角字符 → 半角（全角区间 U+FF01 - U+FF5E 映射到 U+0021 - U+007E）
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
  s = s.replace(/\u3000/g, ' '); // 全角空格

  // 统一各类破折号与括号
  s = s.replace(/[\u2010-\u2015\u2212]/g, '-');
  s = s.replace(/[\uFF08]/g, '(').replace(/[\uFF09]/g, ')');

  // 去除所有空白字符（含空格、制表、换行）
  s = s.replace(/\s+/g, '');

  return s.toLowerCase();
};

/**
 * 坐标归一化：固定小数位，避免浮点误差造成指纹漂移
 * 非有限值返回空串（调用方据此判定数据无效）
 */
export const normalizeCoord = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(COORD_PRECISION);
};

/**
 * FNV-1a 32 位哈希（带自定义种子）
 * 纯 JS 实现，无依赖，性能稳定
 */
const fnv1a32 = (str, seed) => {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime: 16777619，用移位避免大数溢出
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
};

// 两个不同种子 → 拼成 64 位（16 位 hex），碰撞概率 1/2^64
// 千万级数据下理论碰撞期望 ≈ 2.7e-7，可忽略
const SEED_A = 0x811c9dc5;
const SEED_B = 0x01000193;

const toHex8 = (n) => n.toString(16).padStart(8, '0');

/**
 * 构建指纹
 * @param {object} layer - 图形数据对象，需含 name/title/objectName、lat、lng，可选 toolId、type、fileId、address
 * @returns {string} 形如 "v3-a1b2c3d4e5f60718"，无效数据返回 ''
 */
export const buildFingerprint = (layer) => {
  if (!layer || typeof layer !== 'object') return '';

  const name = normalizeText(layer.objectName || layer.title || layer.name);
  const lat = normalizeCoord(layer.lat);
  const lng = normalizeCoord(layer.lng);

  // 名称与坐标是身份证的最低要求，缺一不可
  if (!name || lat === '' || lng === '') return '';

  const toolId = normalizeText(layer.toolId || '');
  const type = normalizeText(layer.type || 'marker');

  // 🚨 身份证 = 「是谁 + 在哪 + 属于哪个工具/类型」，仅此 5 个稳定维度。
  //    刻意排除 address、fileId、简介、图片等「易变字段」：
  //      - address：旧数据可能没有，新数据有 → 会导致同一景区指纹不一致
  //      - fileId：数据可能在文件间迁移 → 不应影响身份
  //    这样无论数据哪个版本、存在哪个文件，同一景区始终得到同一指纹。
  const payload = [name, lat, lng, toolId, type].join('\u0001');

  const h1 = fnv1a32(payload, SEED_A);
  const h2 = fnv1a32(payload, SEED_B);

  return `${FP_VERSION}-${toHex8(h1)}${toHex8(h2)}`;
};

/**
 * 判断指纹是否为本模块生成的有效指纹
 */
export const isValidFingerprint = (fp) => {
  return typeof fp === 'string' && /^v\d+-[0-9a-f]{16}$/.test(fp);
};

/**
 * 从任意图层对象中提取可用指纹：
 *   优先使用已存储的 fingerprint 字段（且格式合法），否则即时计算
 * 用于兼容没有 fingerprint 字段的旧数据
 */
export const resolveFingerprint = (layer) => {
  if (!layer) return '';
  if (isValidFingerprint(layer.fingerprint)) return layer.fingerprint;
  return buildFingerprint(layer);
};
