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
  }
};