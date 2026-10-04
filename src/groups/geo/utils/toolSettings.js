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
  // 🚨 新增两个全局通用工具
  { key: 'resetCenter', name: '回到底图中心点', default: true },
  { key: 'zoomPercent', name: '缩放倍数（20%-5000%）', default: true }
];

const STORAGE_KEY = 'liangjian_tool_widget_settings';
const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
export const globalToolSettings = reactive(savedSettings);

watch(globalToolSettings, (newVal) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal));
}, { deep: true });

export const initToolSettings = (toolId, defaultVisibleTools = {}) => {
  if (!globalToolSettings[toolId]) {
    globalToolSettings[toolId] = {};
  }
  ALL_WIDGETS.forEach(widget => {
    if (globalToolSettings[toolId][widget.key] === undefined) {
      globalToolSettings[toolId][widget.key] = 
        defaultVisibleTools[widget.key] !== undefined 
          ? defaultVisibleTools[widget.key] 
          : widget.default;
    }
  });
};

export const getMergedToolConfig = (toolId, defaultVisibleTools = {}) => {
  const toolSetting = globalToolSettings[toolId] || {};
  return { ...defaultVisibleTools, ...toolSetting };
};

// ==================== 6种图形元素的默认样式配置 ====================
export const DEFAULT_STYLES = {
  polygon: { color: '#f03', fillColor: '#f03', fillOpacity: 0.4, weight: 2 },
  rectangle: { color: '#ffcc00', fillColor: '#ffcc00', fillOpacity: 0.4, weight: 2 },
  polyline: { color: '#3388ff', weight: 15 },
  circle: { color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, weight: 2 },
  ellipse: { color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, weight: 2 },
  marker: { color: '#1890ff', iconType: 0, iconSize: 32, fillOpacity: 1 }
};

const STORAGE_KEY_STYLES = 'liangjian_default_styles';
const savedStyles = JSON.parse(localStorage.getItem(STORAGE_KEY_STYLES) || '{}');

export const globalDefaultStyles = reactive({ ...DEFAULT_STYLES, ...savedStyles });

watch(globalDefaultStyles, (newVal) => {
  localStorage.setItem(STORAGE_KEY_STYLES, JSON.stringify(newVal));
}, { deep: true });

export const getDefaultStyle = (type) => {
  return globalDefaultStyles[type] || DEFAULT_STYLES[type] || {};
};