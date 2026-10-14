// src/groups/geo/utils/toolSettings.js

import { reactive, watch } from 'vue';

// 核心：所有小工具的注册表。新增工具会自动渲染在设置弹窗中
export const ALL_WIDGETS = [
  { key: 'zoomControl', name: '放大缩小栏', default: true },
  { key: 'drawToolbar', name: '标注编辑区', default: true },
  { key: 'markerDocPanel', name: '右侧富文本编辑器', default: true },
  { key: 'locatingPanel', name: '定位查找面板', default: true },
  { key: 'infoPanel', name: '信息栏面板', default: true },
  { key: 'layerListPanel', name: '图形列表面板', default: true },
  { key: 'opacityPanel', name: '图层透明度面板', default: true },
  // 新增两个全局通用工具
  { key: 'resetCenter', name: '回到底图中心点', default: true },
  { key: 'zoomPercent', name: '缩放倍数 (20%-5000%)', default: true },
  // 🚨 AI 批量导入面板（默认关闭，需在设置里按工具开启）
  { key: 'aiImportPanel', name: 'AI批量导入', default: false },
  // 💾 保存当前工程按钮（2026-10-08 新增）：纳入小工具开关控制
  //   默认 true（桌面各工具显示）；鹰眼/白板由 TOOL_WIDGET_DEFAULTS 置为 false
  { key: 'saveProject', name: '保存当前工程', default: true }
];

// 🚨 工具级小工具默认值（2026-10-08 新增）：
//   优先级高于「窄屏默认」与「widget.default」，用于按工具定制初始状态。
//   仅影响「首次初始化」（localStorage 无记录时）。
const TOOL_WIDGET_DEFAULTS = {
  // 鹰眼数据实时自动保存，无「工程文件」概念 → 默认不显示保存按钮
  'geo-eagle-eye': { saveProject: false },
  // 白板内容自动本地保存，无存档概念 → 默认不显示
  'wb-whiteboard': { saveProject: false }
};

const STORAGE_KEY = 'liangjian_tool_widget_settings';
const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

export const globalToolSettings = reactive(savedSettings);

watch(globalToolSettings, (newVal) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal));
}, { deep: true });

// 🚨 窄屏（手机）精简默认值（2026-10-08）：
//   桌面默认全开没问题，但手机上全开会把顶栏挤满、控件重叠。
//   故窄屏首次访问时，默认只开这几项；用户之后可自行在设置里改（改动立即生效并持久化）。
//   注意：仅影响「首次初始化」（localStorage 无记录时），已有记录不会被覆盖。
const NARROW_DEFAULTS = {
  zoomControl: false,
  drawToolbar: true,
  markerDocPanel: true,
  locatingPanel: true,
  infoPanel: false,
  layerListPanel: true,
  opacityPanel: false,
  resetCenter: false,
  zoomPercent: false,
  aiImportPanel: false
};

const isNarrowScreen = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 768px)').matches;

export const initToolSettings = (toolId, defaultVisibleTools = {}) => {
  if (!globalToolSettings[toolId]) {
    globalToolSettings[toolId] = {};
  }
  const narrow = isNarrowScreen();
  const toolDefaults = TOOL_WIDGET_DEFAULTS[toolId] || {};
  ALL_WIDGETS.forEach(widget => {
    if (globalToolSettings[toolId][widget.key] === undefined) {
      let fallback = widget.default;
      // 优先级：工具级默认 > 传入的 defaultVisibleTools > 窄屏默认 > widget 默认
      if (narrow && NARROW_DEFAULTS[widget.key] !== undefined) {
        fallback = NARROW_DEFAULTS[widget.key];
      }
      if (defaultVisibleTools[widget.key] !== undefined) {
        fallback = defaultVisibleTools[widget.key];
      }
      if (toolDefaults[widget.key] !== undefined) {
        fallback = toolDefaults[widget.key];
      }
      globalToolSettings[toolId][widget.key] = fallback;
    }
  });
};

// 🚨 核心修复：找回丢失的合并配置函数，供 BaseMapTool.vue 使用
export const getMergedToolConfig = (toolId, toolDefaultConfig = {}) => {
  const mergedConfig = {};
  
  // 1. 先用默认值兜底
  ALL_WIDGETS.forEach(widget => {
    mergedConfig[widget.key] = widget.default;
  });

  // 2. 用工具本身的默认配置覆盖
  Object.keys(toolDefaultConfig).forEach(key => {
    mergedConfig[key] = toolDefaultConfig[key];
  });

  // 3. 用用户保存的全局配置覆盖
  if (globalToolSettings[toolId]) {
    Object.keys(globalToolSettings[toolId]).forEach(key => {
      mergedConfig[key] = globalToolSettings[toolId][key];
    });
  }

  return mergedConfig;
};

// 6种图形元素的默认样式配置
export const DEFAULT_STYLES = {
  polygon: { color: '#ff0033', fillColor: '#ff0033', fillOpacity: 0.4, weight: 2 },
  rectangle: { color: '#ffcc00', fillColor: '#ffcc00', fillOpacity: 0.4, weight: 2 },
  polyline: { color: '#3388ff', weight: 15 },
  circle: { color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, weight: 2 },
  ellipse: { color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, weight: 2 },
  marker: { color: '#1890ff', iconType: 0, iconSize: 32, fillOpacity: 1 }
};

const STORAGE_KEY_STYLES = 'liangjian_default_styles';
const savedStyles = JSON.parse(localStorage.getItem(STORAGE_KEY_STYLES) || '{}');

// 🚨 第 1 项修复：把所有 3 位简写 CSS 颜色升级为 6 位（#f03 → #ff0033）
const normalizeColor = (c) => {
  if (typeof c !== 'string') return c;
  const m = c.match(/^#([0-9a-fA-F]{3})$/);
  if (m) {
    const [r, g, b] = m[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return c;
};

const cleanupSavedStyles = (raw) => {
  const clean = {};
  Object.keys(raw).forEach(type => {
    clean[type] = { ...raw[type] };
    if (clean[type].color)     clean[type].color     = normalizeColor(clean[type].color);
    if (clean[type].fillColor) clean[type].fillColor = normalizeColor(clean[type].fillColor);
  });
  return clean;
};

const cleanedSavedStyles = cleanupSavedStyles(savedStyles);

// 如果清理后和原始不同，写回 localStorage，永久消除脏数据
if (JSON.stringify(cleanedSavedStyles) !== JSON.stringify(savedStyles)) {
  localStorage.setItem(STORAGE_KEY_STYLES, JSON.stringify(cleanedSavedStyles));
  console.log('[toolSettings] 已自动升级 localStorage 中的简写颜色值');
}

// 深度合并（用清理后的数据）
const mergedStyles = {};
Object.keys(DEFAULT_STYLES).forEach(type => {
  mergedStyles[type] = {
    ...DEFAULT_STYLES[type],
    ...(cleanedSavedStyles[type] || {})
  };
});

export const globalDefaultStyles = reactive(mergedStyles);

watch(globalDefaultStyles, (newVal) => {
  localStorage.setItem(STORAGE_KEY_STYLES, JSON.stringify(newVal));
}, { deep: true });

export const getDefaultStyle = (type) => {
  return globalDefaultStyles[type] || DEFAULT_STYLES[type] || {};
};