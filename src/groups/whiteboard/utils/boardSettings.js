// src/groups/whiteboard/utils/boardSettings.js
// 🖊️ 白板地理范围 / 画布基准 的读写（落在工具库 meta 表）
//
// 键名遵循 whiteboard-integration.md 第 28 行约定：
//   meta.whiteboard_bounds  = { minLat, maxLat, minLng, maxLng }
//   meta.whiteboard_canvas  = { canvasWidth, canvasHeight }
//
// 🚨 冻结原则：bounds 与 canvas 一旦写入，不再随窗口尺寸/视图变化而改写。
//    若无脑跟着窗口改 canvas，已登记元素的 lat/lng 会全体漂移、指纹失效。

import { getFromToolDB, putToToolDB } from '../../geo/utils/toolDB.js';
import { ensureToolMigrated } from '../../geo/utils/migrationManager.js';
import { WHITEBOARD_DEFAULTS } from '../../geo/utils/toolDefaults.js';
import { isValidBounds, isValidCanvas } from './coordinate.js';

export const WB_TOOL_ID = 'wb-whiteboard';
const META_STORE = 'meta';

const readMeta = async (key) => {
  await ensureToolMigrated(WB_TOOL_ID);
  try {
    const rec = await getFromToolDB(WB_TOOL_ID, META_STORE, key);
    return rec ? rec.value : null;
  } catch (e) {
    console.warn('[boardSettings] 读取 meta 失败:', key, e);
    return null;
  }
};

const writeMeta = async (key, value) => {
  await ensureToolMigrated(WB_TOOL_ID);
  return putToToolDB(WB_TOOL_ID, META_STORE, { key, value });
};

// ---------- 地理范围 ----------

export const getBounds = async () => {
  const v = await readMeta('whiteboard_bounds');
  if (isValidBounds(v)) return v;
  return null;
};

export const setBounds = async (bounds) => {
  if (!isValidBounds(bounds)) {
    throw new Error('[boardSettings] bounds 非法，拒绝写入');
  }
  // 归一化为数值，避免字符串混入
  const normalized = {
    minLat: Number(bounds.minLat),
    maxLat: Number(bounds.maxLat),
    minLng: Number(bounds.minLng),
    maxLng: Number(bounds.maxLng)
  };
  await writeMeta('whiteboard_bounds', normalized);
  return normalized;
};

// ---------- 画布基准尺寸 ----------

export const getCanvas = async () => {
  const v = await readMeta('whiteboard_canvas');
  if (isValidCanvas(v)) return v;
  return null;
};

export const setCanvas = async (canvas) => {
  if (!isValidCanvas(canvas)) {
    throw new Error('[boardSettings] canvas 非法，拒绝写入');
  }
  const normalized = {
    canvasWidth: Math.round(Number(canvas.canvasWidth)),
    canvasHeight: Math.round(Number(canvas.canvasHeight))
  };
  await writeMeta('whiteboard_canvas', normalized);
  return normalized;
};

// ---------- 组合读取：白板换算三件套 ----------

/**
 * 读取换算三件套；任一缺失则用出厂默认兜底（首启自动写入）
 * @returns {Promise<{bounds, canvas, isDefault:boolean}>}
 */
export const ensureCoordinateBasis = async () => {
  let bounds = await getBounds();
  let canvas = await getCanvas();
  let isDefault = false;

  if (!bounds) {
    bounds = await setBounds(WHITEBOARD_DEFAULTS.bounds);
    isDefault = true;
  }
  if (!canvas) {
    canvas = await setCanvas({
      canvasWidth: WHITEBOARD_DEFAULTS.canvasWidth,
      canvasHeight: WHITEBOARD_DEFAULTS.canvasHeight
    });
    isDefault = true;
  }
  return { bounds, canvas, isDefault };
};

// ---------- 白板名称 ----------

export const getBoardName = async () => {
  const v = await readMeta('whiteboard_name');
  return typeof v === 'string' && v.trim() ? v : WHITEBOARD_DEFAULTS.boardName;
};

export const setBoardName = async (name) => {
  const v = String(name || '').trim() || WHITEBOARD_DEFAULTS.boardName;
  await writeMeta('whiteboard_name', v);
  return v;
};
