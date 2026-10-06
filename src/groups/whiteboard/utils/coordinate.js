// src/groups/whiteboard/utils/coordinate.js
// 🖊️ 白板 ↔ 地理坐标换算（路线 A 核心）
//
// 设计依据（不得更改，见 .agents/references/whiteboard-integration.md 第三节）：
//   1. 白板是地图的补充视图，每个已登记元素必须带地理坐标 lat/lng
//   2. bounds 绑定一块地理范围，画布像素坐标线性映射到经纬度
//   3. 映射基准画布尺寸（canvasWidth / canvasHeight）一经确定即冻结，
//      不能跟随窗口尺寸变化，否则已登记元素的坐标会漂移、指纹失效
//   4. 【R4】画布禁止平移/缩放（由 escrollConstraints 锁死，见 WhiteboardTool.vue），
//      故 element.x/y 即画布本地坐标，不做 scroll/zoom 修正。
//      若日后放开平移，必须在此处补 scrollX/scrollY/zoom 变换，勿用简化近似。
//
// 换算公式：
//   lng = minLng + (x / canvasWidth)  * (maxLng - minLng)
//   lat = maxLat - (y / canvasHeight) * (maxLat - minLat)   ← y 向下、纬度向上，必须反向
//
// 本文件为纯函数模块，不做任何存储读写，便于单测与复用。

// 画布坐标 → 经纬度
export const canvasToLatLng = (point, bounds, canvas) => {
  if (!isValidBounds(bounds) || !isValidCanvas(canvas)) return null;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;

  const { minLat, maxLat, minLng, maxLng } = bounds;
  const { canvasWidth, canvasHeight } = canvas;

  const x = Number(point.x);
  const y = Number(point.y);

  const lng = minLng + (x / canvasWidth) * (maxLng - minLng);
  const lat = maxLat - (y / canvasHeight) * (maxLat - minLat);

  return { lat, lng };
};

// 经纬度 → 画布坐标（【裁决 5】本轮只实现函数本体，不接双向同步 UI）
export const latLngToCanvas = (latlng, bounds, canvas) => {
  if (!isValidBounds(bounds) || !isValidCanvas(canvas)) return null;
  if (!latlng || !Number.isFinite(Number(latlng.lat)) || !Number.isFinite(Number(latlng.lng))) return null;

  const { minLat, maxLat, minLng, maxLng } = bounds;
  const { canvasWidth, canvasHeight } = canvas;

  const lat = Number(latlng.lat);
  const lng = Number(latlng.lng);

  const x = ((lng - minLng) / (maxLng - minLng)) * canvasWidth;
  const y = ((maxLat - lat) / (maxLat - minLat)) * canvasHeight;

  return { x, y };
};

// 取元素的地理锚点 = 元素左上角（Excalidraw 原生 x/y 语义；点元素即其自身位置）
export const getElementAnchor = (element) => {
  if (!element) return null;
  const x = Number(element.x);
  const y = Number(element.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

// 元素几何（画布坐标）完整快照，落库到 wbX/wbY/wbW/wbH，便于日后回写场景
export const getElementGeometry = (element) => {
  if (!element) return { wbX: 0, wbY: 0, wbW: 0, wbH: 0 };
  return {
    wbX: Number(element.x) || 0,
    wbY: Number(element.y) || 0,
    wbW: Number(element.width) || 0,
    wbH: Number(element.height) || 0
  };
};

// 画布边界（用于判断元素是否落在 bounds 覆盖区内）
export const getCanvasBounds = (canvas) => {
  if (!isValidCanvas(canvas)) return null;
  return {
    minX: 0, maxX: canvas.canvasWidth,
    minY: 0, maxY: canvas.canvasHeight
  };
};

// 元素是否落在画布范围内（越界元素的坐标无地理意义，不应登记）
export const isInsideCanvas = (element, canvas) => {
  const anchor = getElementAnchor(element);
  if (!anchor || !isValidCanvas(canvas)) return false;
  return anchor.x >= 0 && anchor.x <= canvas.canvasWidth
    && anchor.y >= 0 && anchor.y <= canvas.canvasHeight;
};

export const isValidBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return false;
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const vals = [minLat, maxLat, minLng, maxLng];
  if (!vals.every(v => Number.isFinite(Number(v)))) return false;
  if (Number(maxLat) <= Number(minLat)) return false;
  if (Number(maxLng) <= Number(minLng)) return false;
  if (Number(minLat) < -90 || Number(maxLat) > 90) return false;
  if (Number(minLng) < -180 || Number(maxLng) > 180) return false;
  return true;
};

export const isValidCanvas = (canvas) => {
  if (!canvas || typeof canvas !== 'object') return false;
  const w = Number(canvas.canvasWidth);
  const h = Number(canvas.canvasHeight);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
};

// bounds 汇总为 Leaflet 可用边界 [[minLat,minLng],[maxLat,maxLng]]（供地图叠加校验）
export const boundsToLeaflet = (bounds) => {
  if (!isValidBounds(bounds)) return null;
  return [[Number(bounds.minLat), Number(bounds.minLng)], [Number(bounds.maxLat), Number(bounds.maxLng)]];
};
