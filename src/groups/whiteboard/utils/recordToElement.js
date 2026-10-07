// src/groups/whiteboard/utils/recordToElement.js
// 🖊️ 【P1-A】信息记录（annotation）→ Excalidraw 元素 生成器
//
// 用途：AI 批量导入（AiImportPanel）往信息库写入新记录后，白板画布上要**立刻看见**这些点。
//   数据层由 aiImporter 负责（写 annotations），本文件只负责「记录 → 画布元素」这一步。
//
// 【与 elementSync 的 restore 路径区别（勿混用）】
//   elementSync 的降级重建是「先有画布元素、再有记录」的**还原**语义；
//   本文件是「先有记录（AI 导入）、需要凭空造元素」的**新建**语义。
//   两者字段模板同源（都遵守 A 方案的 9 字段），但不可互相替代。
//
// 【硬约束（不得更改）】
//   1. 统一生成 `text` 元素 —— 与 elementSync A 方案同款模板，字段一个不少。
//      历史上「type:'text' 但缺 text/fontFamily」曾毒死整个画布（MEMO 坑#14），
//      text 的必需字段**不允许省略**。
//   2. 生成后立刻过 `validateElement` 自检（C 方案校验器），不通过返回 null。
//      调用方只需过滤 null 即可，无需再校验。
//   3. 坐标必须用 `latLngToCanvas` 换算；bounds/canvas 缺失或非法 → 返回 null（不猜坐标）。
//   4. 打标记 `customData.fromAiImport: true`，与用户手绘元素区分。
//
// 本文件为纯函数模块，不做任何存储读写，便于单测与复用。

import { latLngToCanvas } from './coordinate.js';
import { validateElement } from './elementSync.js';

/**
 * 把一条信息记录（annotation）转成可安全渲染的 Excalidraw 元素。
 *
 * @param {object} record - annotation 记录，至少含 { name?, title?, lat, lng }
 *   · 名称优先级：record.name（AiImportPanel 写入惯例）→ record.objectName → record.title → ''
 *   说明：annotation 的字段命名在不同写入路径下略有差异（objectName / title / name），
 *   这里统一兜底，避免生成无名元素。
 * @param {object} opts
 * @param {object} opts.bounds - 地理范围 { minLat, maxLat, minLng, maxLng }
 * @param {object} opts.canvas - { canvasWidth, canvasHeight }
 * @returns {object|null} 合法 Excalidraw text 元素；任一前置条件不满足则返回 null
 */
export const recordToElement = (record, { bounds, canvas } = {}) => {
  if (!record || typeof record !== 'object') return null;

  const lat = Number(record.lat);
  const lng = Number(record.lng);

  // 坐标换算（内部已含 bounds/canvas 合法性校验；非法会返回 null）
  const pt = latLngToCanvas({ lat, lng }, bounds, canvas);
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;

  const label = String(
    record.name || record.objectName || record.title || ''
  );

  // ── 元素模板 ──────────────────────────────────────────────
  // 与 elementSync.js 的 A 方案 text 模板**同源**，共 28 个共有字段 + 9 个 text 专属字段。
  const element = {
    id: makeElementId(),
    type: 'text',
    x: pt.x,
    y: pt.y,
    width: Math.max(40, label.length * 12),   // 无 DOM 量文本宽度，按字符数粗估
    height: 25,                                // fontSize 20 × lineHeight 1.25 = 25
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    customData: {
      name: label,
      fromAiImport: true
    },
    // ── text 专属 9 字段（缺任一即崩，见 MEMO 坑#14）──
    text: label,
    originalText: label,
    fontSize: 20,
    fontFamily: 1,          // 1 = Excalidraw 默认手绘体（Excalifont）
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    lineHeight: 1.25,
    baseline: 0
  };

  // ── C 方案自检：不通过就拒绝（宁可少画一个，不可毒死画布）──
  const check = validateElement(element);
  if (!check.ok) {
    console.warn(`[recordToElement] 🛡️ 生成元素未通过自检，已拒绝: ${check.missing.join(', ')}`);
    return null;
  }

  return element;
};

/**
 * 生成 Excalidraw 风格的元素 id（nanoid 近似）。
 * 若宿主环境有 crypto.randomUUID 则优先使用（碰撞概率更低）。
 * @returns {string}
 */
const makeElementId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) { /* 忽略，走下面的兜底 */ }
  return 'wbai-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};
