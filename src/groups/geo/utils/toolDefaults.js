// src/groups/geo/utils/toolDefaults.js
// 🚨 Phase 2a：每个工具的默认配置（底图 + 初始视图）
// 这些配置会写入各工具库的 meta 表，作为"出厂设置"
// 当用户切换底图时，只更新 meta 表，不影响其他工具

export const TOOL_DEFAULTS = {
  'geo-custom-canvas': {
    baseLayerConfig: { type: 'custom-canvas' },
    initialView: { center: [0, 0], zoom: 1 }
  },
  'geo-china-map': {
    baseLayerConfig: {
      type: 'amap-satellite',
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
    },
    initialView: { center: [39.0123, 117.3456], zoom: 15 }
  },
  'geo-world-map': {
    baseLayerConfig: {
      type: 'amap-satellite',
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
    },
    initialView: { center: [30, 0], zoom: 3 }
  },
  'geo-china-standard-map': {
    baseLayerConfig: {
      type: 'amap-standard',
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}',
      annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
    },
    initialView: { center: [39.0123, 117.3456], zoom: 15 }
  },
  'geo-province-map': {
    baseLayerConfig: {
      type: 'local-image',
      url: '/maps/中国地图0003.png',
      bounds: [[3, 73], [55, 135]]
    },
    initialView: { center: [35, 105], zoom: 4 }
  },
  'geo-eagle-eye': {
    baseLayerConfig: {
      type: 'amap-satellite',
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
    },
    initialView: { center: [39.0123, 117.3456], zoom: 15 }
  },
  // 🖊️ 第三产品（Excalidraw 白板，地图的补充视图）
  //    bounds / canvas 是「画布坐标 ↔ 经纬度」换算三件套，一经确定即冻结：
  //    若随窗口尺寸浮动，已登记元素的坐标会漂移、指纹失效。
  //    运行时以 meta 表 whiteboard_bounds / whiteboard_canvas 为准，此处仅作首启兜底。
  'wb-whiteboard': {
    baseLayerConfig: { type: 'none' },
    initialView: { center: [39.0123, 117.3456], zoom: 15 },
    whiteboardBounds: { minLat: 39.0, maxLat: 39.3, minLng: 117.1, maxLng: 117.5 },
    whiteboardCanvas: { canvasWidth: 1600, canvasHeight: 1000 },
    boardName: '白板 1'
  }
};

// 白板出厂默认值（独立导出，供白板模块与 meta 兜底引用）
export const WHITEBOARD_DEFAULTS = {
  bounds: { minLat: 39.0, maxLat: 39.3, minLng: 117.1, maxLng: 117.5 },
  canvasWidth: 1600,
  canvasHeight: 1000,
  boardName: '白板 1'
};
