<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container-div"></div>

    <!-- 右键菜单 -->
    <div 
      v-if="contextMenuVisible" 
      class="custom-context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      @click.stop
    >
      <button class="context-menu-item delete-item" @click="handleDeleteLayer">删除</button>
    </div>

    <!-- 放大缩小栏 -->
    <div v-if="finalVisibleTools.zoomControl" class="custom-zoom-control">
      <button @click="map?.zoomIn()" title="放大">+</button>
      <button @click="map?.zoomOut()" title="缩小">-</button>
    </div>

    <!-- 回中心点与缩放倍数控制区 -->
    <div v-if="finalVisibleTools.resetCenter || finalVisibleTools.zoomPercent" class="custom-bottom-toolbar">
      <button v-if="finalVisibleTools.resetCenter" @click="resetToCenter" title="回到底图中心点" class="reset-center-btn">🎯</button>
      <div v-if="finalVisibleTools.zoomPercent" class="zoom-percent-control">
        <span class="zoom-percent-label">{{ zoomLevelPercent }}%</span>
        <input type="range" min="20" max="5000" v-model.number="zoomLevelPercent" @input="handleZoomPercentChange" class="zoom-percent-slider" />
      </div>
    </div>

    <!-- 加载已有工程时，不显示上传界面 -->
    <div v-if="config.baseLayer.type === 'custom-canvas' && !isCustomImageLoaded && !isLoadingProject" class="upload-container">
      <div class="upload-box">
        <h2>自定义底图 + 自由标记</h2>
        <p>请选择底图，或加载之前的标注</p>
        <div class="upload-actions">
          <button class="action-btn primary" @click="triggerUpload('base')">打开底图</button>
          <!-- 🚨 已经删除了“打开底图+标注层”按钮，只保留纯净的底图选择 -->
        </div>
        <p class="upload-hint">支持任意图片格式，大文件也无需担心</p>
        <input type="file" accept="image/*" @change="handleBaseUpload" ref="baseInputRef" style="display: none;" />
        <input type="file" accept=".json,.freemap" @change="handleBothUpload" ref="bothInputRef" style="display: none;" />
      </div>
    </div>

    <template v-if="config.baseLayer.type !== 'custom-canvas' || isCustomImageLoaded">
      <!-- 绘图工具栏 -->
      <div v-if="finalVisibleTools.drawToolbar" class="custom-toolbar" :data-tool-id="'draw-' + config.toolId">
        <button :class="{ active: activeTool === 'polygon' }" @click="startDrawing('polygon')" title="绘制多边形"> ⬠ </button>
        <button :class="{ active: activeTool === 'polyline' }" @click="startDrawing('polyline')" title="绘制折线"> 📈 </button>
        <button :class="{ active: activeTool === 'rectangle' }" @click="startDrawing('rectangle')" title="绘制标准图形"> ▭ </button>
        <button :class="{ active: activeTool === 'circle' }" @click="startDrawing('circle')" title="绘制圆形"> ◯ </button>
        <button :class="{ active: activeTool === 'ellipse' }" @click="startDrawing('ellipse')" title="绘制椭圆"> ⬭ </button>
        <button :class="{ active: activeTool === 'marker' }" @click="startDrawing('marker')" title="绘制标记点"> 📍 </button>
        <hr class="toolbar-divider">
        <button :class="{ active: activeTool === 'edit' }" @click="toggleEditMode" title="编辑图形形状"> ✏️ </button>
        <button @click="clearAllLayers()" title="清除所有" style="color: #e74c3c;"> 🗑️ </button>
        <hr class="toolbar-divider">
        <button @click="toggleFullscreen" title="全屏切换"> ⛶ </button>
        <hr v-if="config.baseLayer.type === 'custom-canvas'" class="toolbar-divider">
        <button v-if="config.baseLayer.type === 'custom-canvas'" @click="resetImage" title="重新选择图片"> 🔄 </button>
      </div>

      <!-- 图形列表 Teleport -->
      <Teleport to="#tool-header-slot">
        <LayerListPanel 
          v-if="isActive && finalVisibleTools.layerListPanel" 
          :panel-id="'layerList-' + config.toolId" 
          :layers="drawnLayers" 
          :groups="groups.map(g => g.name)" 
          @locate="flyToLayer"
          @add-group="handleAddGroup"
          @remove-group="handleRemoveGroup"
          @update-layer-group="handleUpdateLayerGroup"
        />
      </Teleport>

      <!-- 其他面板 -->
      <LocatingPanel v-if="finalVisibleTools.locatingPanel" :panel-id="'locating-' + config.toolId" @search="handleSearch" />
      <OpacityPanel v-if="finalVisibleTools.opacityPanel" :panel-id="'opacity-' + config.toolId" :baseOpacity="baseOpacity" :annoOpacity="annoOpacity" :showAnno="config.baseLayer.annoUrl ? true : false" @update:base="updateBaseOpacity" @update:anno="updateAnnoOpacity" />
      <InfoPanel v-if="finalVisibleTools.infoPanel" ref="infoPanelRef" :tool-id="config.toolId" :layers="drawnLayers" @locate="flyToLayer" @update-layer="handleLayerUpdate" />
      
            <MarkerDocPanel 
        v-if="finalVisibleTools.markerDocPanel && selectedNode" 
        :node="selectedNode" 
        :tool-id="config.toolId" 
        :file-id="fileId" 
        @close="selectedNode = null" 
        @update:title="handleTitleUpdate" 
        @update:content="handleDocContentUpdate" 
        @update:style="val => updateNodeStyle(val)" 
      />
    </template>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, onActivated, onDeactivated, ref, computed } from 'vue';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

import { zhCN_DrawLocal } from '../../../groups/geo/utils/drawConfig.js';
import { saveAllLayers, getAllLayers } from '../../../groups/geo/utils/annotationStore.js';
import { fileToBase64, parseProject } from '../../../groups/geo/utils/fileManager.js';

import { getMergedToolConfig, getDefaultStyle } from '../../../groups/geo/utils/toolSettings.js';
import { MARKER_ICONS } from '../../../groups/geo/utils/markerIcons.js';
import { buildProjectFile } from '../../../groups/geo/utils/projectManager.js';
import { saveProjectToInventory } from '../../../groups/geo/utils/projectStore.js';

import { getNextSequence } from '../../../groups/geo/utils/systemStore.js';// 🚨 Phase 2b：新增编号工具
import { formatGraphicId, formatGroupId } from '../../../groups/geo/utils/toolRegistry.js';

import LocatingPanel from './panels/LocatingPanel.vue';
import LayerListPanel from './panels/LayerListPanel.vue';
import OpacityPanel from './panels/OpacityPanel.vue';
import InfoPanel from './panels/InfoPanel.vue';
import MarkerDocPanel from './panels/MarkerDocPanel.vue';

L.drawLocal = zhCN_DrawLocal;

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({
      toolId: 'geo-default',
      baseLayer: { type: 'amap-satellite', url: '', annoUrl: '' },
      initialView: { center: [39.0123, 117.3456], zoom: 15 },
      visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true, resetCenter: true, zoomPercent: true }
    })
  },
  isLoadingProject: { type: Boolean, default: false },
  fileId: { type: String, default: 'legacy-file' } // 🚨 新增：接收当前文件编号
});

const finalVisibleTools = computed(() => {
  return getMergedToolConfig(props.config.toolId, props.config.visibleTools);
});

const mapContainer = ref(null);
const baseInputRef = ref(null);
const bothInputRef = ref(null);
const infoPanelRef = ref(null);

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuLayerData = ref(null);

let map = null;
let editableLayers = null;
let baseLayer = null;
let annoLayer = null;
let currentDrawHandler = null;
let tempRectangle = null;
let tempCircle = null;
let tempEllipse = null;
let rectStartLatLng = null;
let circleStartLatLng = null;
let ellipseStartLatLng = null;
let resizeObserver = null;

let currentBaseImageData = null;
let currentBaseImageWidth = 0;
let currentBaseImageHeight = 0;

let defaultCenter = [39.0123, 117.3456];
let defaultZoom = 15;
const zoomLevelPercent = ref(100);

const selectedNode = ref(null);
const baseOpacity = ref(1);
const annoOpacity = ref(1);
const activeTool = ref(null);
const drawnLayers = ref([]);
const groups = ref([{ id: 1, name: '默认' }]);
const isCustomImageLoaded = ref(false);
// 🚨 跟踪 KeepAlive 激活状态，控制 Teleport 内容是否挂载
const isActive = ref(true);
const AMAP_KEY = '69d86725ca981d56159af949ce2a68ec';

// 🚨 坐标提取工具函数（供多处复用）
const extractCoordsFromLayer = (item) => {
  let coords = [];
  const layer = item.layerRef;
  if (!layer) return coords;
  try {
    if (item.type === 'marker') {
      const latlng = layer.getLatLng();
      if (Number.isFinite(latlng.lat) && Number.isFinite(latlng.lng)) {
        coords = [[latlng.lat, latlng.lng]];
      }
    } else if (item.type === 'rectangle') {
      const bounds = layer.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      if ([sw.lat, sw.lng, ne.lat, ne.lng].every(Number.isFinite)) {
        coords = [[sw.lat, sw.lng], [ne.lat, ne.lng]];
      }
    } else {
      const latlngs = layer.getLatLngs();
      const flatten = (arr) => Array.isArray(arr[0]) ? arr.map(flatten).flat(1) : arr.map(pt => [pt.lat, pt.lng]);
      const flat = flatten(latlngs);
      if (flat.length > 0 && flat.every(pt => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))) {
        coords = flat;
      }
    }
  } catch (e) {
    console.warn('[extractCoordsFromLayer] 提取坐标失败', e);
  }
  return coords;
};

// 🚨 保存前提取坐标 + NaN 校验 + coords 回退
const forceAutoSave = async () => {
  if (!props.config.toolId) return;
  try {
    const layersToSave = drawnLayers.value.map(item => {
      let coords = extractCoordsFromLayer(item);

      // 提取失败时回退到已存的 coords，避免覆盖有效数据
      if (coords.length === 0) {
        if (item.coords && Array.isArray(item.coords) && item.coords.length > 0) {
          coords = item.coords;
        } else {
          console.warn('[forceAutoSave] 跳过完全无坐标的图层：', item.id, item.type);
          return null;
        }
      }

      // 同步刷新 lat/lng 字段
      let safeLat = item.lat, safeLng = item.lng;
      if (item.type === 'marker' && coords[0]) {
        safeLat = coords[0][0];
        safeLng = coords[0][1];
      }

      const { layerRef, ...rest } = item;
      return { ...rest, lat: safeLat, lng: safeLng, coords };
    }).filter(Boolean);

      // 🚨 核心修复：如果 props.fileId 为空，使用安全值兜底
      // 🚨 核心修复：如果 props.fileId 为空，使用安全值兜底；鹰眼平台强制统一存放
      const safeFileId = props.config.toolId === 'geo-eagle-eye' ? 'legacy-file' : (props.fileId || 'legacy-file');
      await saveAllLayers(props.config.toolId, safeFileId, layersToSave);       
      console.log(`[自动保存] 工具 ${props.config.toolId} 文件 ${safeFileId} 的数据已静默持久化。`);  } catch (error) {
    console.error('自动保存失败:', error);
  }
};

const getMarkerIcon = (style) => {
  const color = style.color || '#1890ff';
  const size = style.iconSize || 32;
  const opacity = style.fillOpacity !== undefined ? style.fillOpacity : 1;
  const iconType = style.iconType !== undefined ? style.iconType : 0;
  
  const iconDef = MARKER_ICONS.find(i => i.id === iconType) || MARKER_ICONS[0];
  const svgHtml = iconDef.svg.replace(/#COLOR#/g, color);

  return L.divIcon({
    className: 'custom-marker-icon',
    html: `<div style="width: ${size}px; height: ${size}px; opacity: ${opacity}; display: flex; align-items: center; justify-content: center;">${svgHtml}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size], 
    popupAnchor: [0, -size]
  });
};

const generateCirclePoints = (center, radiusInMeters, numPoints = 64) => {
  const points = [];
  const latRadius = radiusInMeters / 111320;
  const lngRadius = radiusInMeters / (111320 * Math.cos(center.lat * Math.PI / 180));
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    points.push([
      center.lat + latRadius * Math.sin(angle),
      center.lng + lngRadius * Math.cos(angle)
    ]);
  }
  return points;
};

const generateEllipsePoints = (center, latRadius, lngRadius, numPoints = 64) => {
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    points.push([
      center.lat + latRadius * Math.sin(angle),
      center.lng + lngRadius * Math.cos(angle)
    ]);
  }
  return points;
};

const handleZoomPercentChange = () => {
  if (!map) return;
  const zoom = Math.log2(zoomLevelPercent.value / 100);
  map.setZoom(zoom);
};

const resetToCenter = () => {
  if (!map) return;
  map.flyTo(defaultCenter, defaultZoom, { duration: 1.5 });
};

const handleMoveEnd = () => {
  if (map) {
    const state = {
      center: [map.getCenter().lat, map.getCenter().lng],
      zoom: map.getZoom()
    };
    localStorage.setItem(`geo_last_state_${props.config.toolId}`, JSON.stringify(state));
  }
};

const handleZoomEnd = () => {
  if (!map) return;
  const zoom = map.getZoom();
  zoomLevelPercent.value = Math.round(100 * Math.pow(2, zoom));
};

const initMap = () => {
  if (!mapContainer.value) return;
  if (map) { map.remove(); }

  const view = props.config.initialView || { center: [39.0123, 117.3456], zoom: 15 };
  const baseCfg = props.config.baseLayer;

  const mapOptions = (baseCfg.type === 'custom-canvas')
    ? { crs: L.CRS.Simple, minZoom: -5, maxZoom: 10, zoomControl: false, attributionControl: false }
    : { center: view.center, zoom: view.zoom, zoomControl: false, attributionControl: false };

  map = L.map(mapContainer.value, mapOptions);
  L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);

  defaultCenter = [map.getCenter().lat, map.getCenter().lng];
  defaultZoom = map.getZoom();

  const savedState = localStorage.getItem(`geo_last_state_${props.config.toolId}`);
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      map.setView(parsed.center, parsed.zoom);
      defaultCenter = [map.getCenter().lat, map.getCenter().lng];
      defaultZoom = map.getZoom();
    } catch (e) {}
  }

  if (baseCfg.type === 'amap-satellite' || baseCfg.type === 'amap-standard') {
    baseLayer = L.tileLayer(baseCfg.url, { subdomains: ['1', '2', '3', '4'], maxZoom: 18, maxNativeZoom: 18 }).addTo(map);
    if (baseCfg.annoUrl) annoLayer = L.tileLayer(baseCfg.annoUrl, { subdomains: ['1', '2', '3', '4'], maxZoom: 18, maxNativeZoom: 18 }).addTo(map);
  } else if (baseCfg.type === 'esri-world') {
    baseLayer = L.tileLayer(baseCfg.url, { maxZoom: 19 }).addTo(map);
    if (baseCfg.annoUrl) annoLayer = L.tileLayer(baseCfg.annoUrl, { maxZoom: 19 }).addTo(map);
  } else if (baseCfg.type === 'local-image') {
    baseLayer = L.imageOverlay(baseCfg.url, baseCfg.bounds, { opacity: 1, interactive: false }).addTo(map);
    map.fitBounds(baseCfg.bounds);
  }

  editableLayers = new L.FeatureGroup();
  map.addLayer(editableLayers);
  bindMapEvents();
  loadHistoricalLayers();

  map.on('zoomend', handleZoomEnd);
  handleZoomEnd();

  resizeObserver = new ResizeObserver(() => { if (map) map.invalidateSize(); });
  resizeObserver.observe(mapContainer.value);
  document.addEventListener('fullscreenchange', handleResize);
};

onMounted(async () => {
  if (!groups.value.find(g => g.name === '默认')) {
    groups.value.push({ id: 1, name: '默认' });
  }

  if (props.config.baseLayer.type === 'custom-canvas') return;
  initMap();

  L.Marker.prototype.options.icon = getMarkerIcon(getDefaultStyle('marker'));
});

// KeepAlive 被停用时：标记非活跃 + 强制保存
onDeactivated(() => {
  isActive.value = false;
  console.log(`[停用] 工具 ${props.config.toolId}，强制保存...`);
  forceAutoSave();
});

// KeepAlive 被重新激活时：标记活跃 + 刷新数据
let mountCount = 0;
onActivated(async () => {
  isActive.value = true;
  mountCount++;
  if (mountCount <= 1) return;

  console.log(`[激活] 工具 ${props.config.toolId}`);
  if (map) {
    setTimeout(() => map.invalidateSize(), 50);
    await refreshDataFromDB();
  }
});

onUnmounted(() => {
  forceAutoSave();
  if (map) map.remove();
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  document.removeEventListener('fullscreenchange', handleResize);
});

const handleResize = () => { setTimeout(() => { if (map) map.invalidateSize(); }, 100); };
const toggleFullscreen = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.warn(err));
  else document.exitFullscreen();
};

const hideContextMenu = () => {
  contextMenuVisible.value = false;
  contextMenuLayerData.value = null;
};

const handleDeleteLayer = () => {
  if (!contextMenuLayerData.value || !editableLayers) return;
  
  const targetId = contextMenuLayerData.value.id;
  const layerRef = contextMenuLayerData.value.layerRef;
  
  if (layerRef) {
    editableLayers.removeLayer(layerRef);
  }
  
  drawnLayers.value = drawnLayers.value.filter(item => item.id !== targetId);
  
  if (selectedNode.value && selectedNode.value.id === targetId) {
    selectedNode.value = null;
  }
  
  forceAutoSave(); 
  hideContextMenu();
};

// 加载时过滤无效坐标
const loadHistoricalLayers = async () => {
  if (!map || !editableLayers) return;
  // 🚨 只读取当前文件的图形
  // 🚨 核心修复：鹰眼平台作为公共平台，不进行文件隔离，加载所有历史数据
  const queryFileId = props.config.toolId === 'geo-eagle-eye' ? null : props.fileId;
  const records = await getAllLayers(props.config.toolId, queryFileId); 
  if (!records || records.length === 0) return;
  
  const isValidPoint = (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]);

  records.forEach(item => {
    if (!item.coords || !Array.isArray(item.coords) || item.coords.length === 0) {
      console.warn('跳过无效图层(缺少坐标):', item.id);
      return;
    }
    if (!item.coords.every(isValidPoint)) {
      console.warn('跳过无效图层(坐标含NaN):', item.id, JSON.stringify(item.coords).slice(0, 200));
      return;
    }

    let layer = null;
    try {
      if (item.type === 'polygon' || item.type === 'circle' || item.type === 'ellipse') layer = L.polygon(item.coords, item.style).addTo(map);
      else if (item.type === 'polyline') layer = L.polyline(item.coords, item.style).addTo(map);
      else if (item.type === 'rectangle') layer = L.rectangle(item.coords, item.style).addTo(map);
      else if (item.type === 'marker') {
        const markerStyle = { ...getDefaultStyle('marker'), ...(item.style || {}) };
        layer = L.marker(item.coords[0], { icon: getMarkerIcon(markerStyle) }).addTo(map);
      }
    } catch (e) { console.warn('加载历史图层失败', e); }

    if (layer) {
      editableLayers.addLayer(layer);
      layer.uniqueId = item.id;

      let safeLat = item.lat, safeLng = item.lng;
      if (item.coords[0]) {
        safeLat = item.coords[0][0];
        safeLng = item.coords[0][1];
      }

      const layerData = { ...item, lat: safeLat, lng: safeLng, layerRef: layer };
      drawnLayers.value.push(layerData);

      if (item.group && !groups.value.find(g => g.name === item.group)) {
        groups.value.push({ id: 0, name: item.group });
      }

      layer.on('click', () => {
        const currentData = drawnLayers.value.find(d => d.id === layer.uniqueId);
        if (currentData) {
          selectedNode.value = { ...currentData };
          if (infoPanelRef.value) infoPanelRef.value.selectLayer(currentData);
        }
      });

      layer.on('contextmenu', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        contextMenuX.value = e.originalEvent.clientX;
        contextMenuY.value = e.originalEvent.clientY;
        contextMenuLayerData.value = layerData;
        contextMenuVisible.value = true;
      });
    }
  });
};

const bindMapEvents = () => {
  map.on('click', hideContextMenu);

  map.on(L.Draw.Event.DRAWSTART, () => { map.on('contextmenu', finishDrawing); });
  map.on(L.Draw.Event.DRAWSTOP, () => {
    map.off('contextmenu', finishDrawing);
    if (!currentDrawHandler || !currentDrawHandler._enabled) activeTool.value = null;
  });
  
  map.on(L.Draw.Event.CREATED, (e) => {
    let layer = e.layer;
    let type = e.layerType;
    let latlng = null;

    if (type === 'marker') {
      latlng = layer.getLatLng();
      layer.setIcon(getMarkerIcon(getDefaultStyle('marker')));
    } else {
      latlng = layer.getLatLng ? layer.getLatLng() : (layer.getBounds ? layer.getBounds().getCenter() : null);
    }

    addLayerToMap(layer, type, latlng);
    activeTool.value = null; 
    currentDrawHandler = null;
  });

  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer((layer) => {
      const item = drawnLayers.value.find(d => d.id === layer.uniqueId);
      if (item) {
        try {
          const ll = layer.getLatLng ? layer.getLatLng() : (layer.getBounds ? layer.getBounds().getCenter() : null);
          if (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) {
            item.lat = ll.lat;
            item.lng = ll.lng;
          }
        } catch (err) { /* ignore */ }
      }
    });
    forceAutoSave();
  });

  map.on('moveend', handleMoveEnd);
};

// 🚨 Phase 2b：创建时使用带前缀的新编号 CM.00001
const addLayerToMap = async (layer, type, latlng) => {
  // 从当前工具库获取下一个序号
  const seq = await getNextSequence(props.config.toolId, 'graphic');
  const graphicId = formatGraphicId(props.config.toolId, seq);
  layer.uniqueId = graphicId;

  const initialTitle = ''; 
  const defaultStyle = { ...getDefaultStyle(type) };

  let safeLat = 0, safeLng = 0;
  try {
    if (type === 'marker') {
      const ll = layer.getLatLng();
      if (Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) {
        safeLat = ll.lat; safeLng = ll.lng;
      }
    } else if (latlng) {
      const a = Number(latlng.lat), b = Number(latlng.lng);
      if (Number.isFinite(a) && Number.isFinite(b)) { safeLat = a; safeLng = b; }
    }
  } catch (e) { console.warn('[addLayerToMap] 提取坐标失败', e); }

  const layerData = {
    id: graphicId,
    toolId: props.config.toolId, 
    title: initialTitle, 
    type,
    lat: safeLat, 
    lng: safeLng,
    layerRef: layer, 
    docHtml: '', 
    objectName: '', 
    group: '默认',
    fields: Array.from({ length: 500 }).map(() => ({ label: '', value: '' })),
    style: defaultStyle
  };

  if (type === 'marker') {
    layer.setIcon(getMarkerIcon(defaultStyle));
  }

  editableLayers.addLayer(layer);
  drawnLayers.value.push(layerData);

  layer.on('click', () => {
    const currentData = drawnLayers.value.find(d => d.id === layer.uniqueId);
    if (currentData) {
      selectedNode.value = { ...currentData };
      if (infoPanelRef.value) infoPanelRef.value.selectLayer(currentData);
    }
  });

  layer.on('contextmenu', (e) => {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    contextMenuX.value = e.originalEvent.clientX;
    contextMenuY.value = e.originalEvent.clientY;
    contextMenuLayerData.value = layerData;
    contextMenuVisible.value = true;
  });

  forceAutoSave();
};

const handleLayerUpdate = (updatedLayer) => {
  const index = drawnLayers.value.findIndex(l => l.id === updatedLayer.id);
  if (index !== -1) {
    if (updatedLayer.objectName !== undefined) {
      drawnLayers.value[index].title = updatedLayer.objectName;
    }
    drawnLayers.value[index] = { ...drawnLayers.value[index], ...updatedLayer, toolId: props.config.toolId };
    
    if (selectedNode.value && selectedNode.value.id === updatedLayer.id) {
      selectedNode.value = { ...selectedNode.value, ...updatedLayer };
      if (updatedLayer.objectName !== undefined) {
        selectedNode.value.title = updatedLayer.objectName;
      }
    }
    forceAutoSave();
  }
};

const handleUpdateLayerGroup = ({ id, group }) => {
  const index = drawnLayers.value.findIndex(l => l.id === id);
  if (index !== -1) {
    drawnLayers.value[index].group = group;
    forceAutoSave();
  }
};

// 🚨 Phase 2b：新分组编号格式 CM-G.00001
const handleAddGroup = async (groupName) => {
  if (groupName && !groups.value.find(g => g.name === groupName)) {
    const seq = await getNextSequence(props.config.toolId, 'group');
    const groupId = formatGroupId(props.config.toolId, seq);
    groups.value.push({ id: groupId, name: groupName });
  }
};

const handleRemoveGroup = (groupName) => {
  groups.value = groups.value.filter(g => g.name !== groupName);
  let hasChange = false;
  drawnLayers.value.forEach(layer => {
    if (layer.group === groupName) {
      layer.group = '默认';
      hasChange = true;
    }
  });
  if (hasChange) {
    forceAutoSave();
  }
};

const handleTitleUpdate = (payload) => {
  const id = typeof payload === 'object' ? payload.id : (selectedNode.value ? selectedNode.value.id : null);
  const title = typeof payload === 'object' ? payload.title : payload;

  if (!id) return;
  
  const index = drawnLayers.value.findIndex(l => l.id === id);
  if (index !== -1) {
    drawnLayers.value[index].title = title;
    drawnLayers.value[index].objectName = title;
  }
  if (selectedNode.value && selectedNode.value.id === id) {
    selectedNode.value.title = title;
    selectedNode.value.objectName = title;
  }
  handleLayerUpdate({ id: id, title: title, objectName: title });
};

const handleDocContentUpdate = (payload) => {
  const id = typeof payload === 'object' ? payload.id : (selectedNode.value ? selectedNode.value.id : null);
  const docHtml = typeof payload === 'object' ? payload.docHtml : payload;

  if (!id) return;

  const index = drawnLayers.value.findIndex(l => l.id === id);
  if (index !== -1) {
    drawnLayers.value[index].docHtml = docHtml;
  }
  if (selectedNode.value && selectedNode.value.id === id) {
    selectedNode.value.docHtml = docHtml;
  }
  handleLayerUpdate({ id: id, docHtml: docHtml });
};

// 点击列表时校验坐标
const flyToLayer = (item) => {
  if (!item || !map) return;
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn('[flyToLayer] 无效坐标，跳过：', item.id, lat, lng);
    return;
  }
  const zoom = props.config.baseLayer.type === 'custom-canvas' ? 2 : 16;
  try {
    map.flyTo([lat, lng], zoom, { duration: 1.5 });
  } catch (e) {
    console.warn('[flyToLayer] flyTo 失败：', e);
    return;
  }
  if (item.layerRef && typeof item.layerRef.fire === 'function') {
    try { item.layerRef.fire('click'); } catch (e) { /* ignore */ }
  }
};

const clearAllLayers = (silent = false) => {
  if (props.config.toolId === 'geo-eagle-eye' && silent) {
    console.warn('已阻止对鹰眼公共平台数据的静默覆盖/清理！');
    return;
  }

  if (!silent && !window.confirm('确认清除所有图形元素并删除相应信息吗？此操作不可逆！\n(鹰眼平台的数据一旦删除，所有用户将无法看到)')) return;

  if (editableLayers) {
    editableLayers.clearLayers();
  }
  if (tempRectangle) { map.removeLayer(tempRectangle); tempRectangle = null; }
  if (tempCircle) { map.removeLayer(tempCircle); tempCircle = null; }
  if (tempEllipse) { map.removeLayer(tempEllipse); tempEllipse = null; }
  selectedNode.value = null;
  activeTool.value = null;
  rectStartLatLng = null; circleStartLatLng = null; ellipseStartLatLng = null;
  drawnLayers.value = [];
  groups.value = [{ id: 1, name: '默认' }];
  
  if (!silent) {
    forceAutoSave();
  }
};

const startDrawing = (type) => {
  if (currentDrawHandler && currentDrawHandler._enabled) currentDrawHandler.disable();
  if (tempRectangle) { map.removeLayer(tempRectangle); tempRectangle = null; }
  if (tempCircle) { map.removeLayer(tempCircle); tempCircle = null; }
  if (tempEllipse) { map.removeLayer(tempEllipse); tempEllipse = null; }
  rectStartLatLng = null; circleStartLatLng = null; ellipseStartLatLng = null;
  activeTool.value = type;

  if (type === 'rectangle') {
    map.on('click', handleRectangleClick);
    map.on('mousemove', handleRectangleMouseMove);
    return;
  }

  if (type === 'circle') {
    map.on('click', handleCircleClick);
    map.on('mousemove', handleCircleMouseMove);
    return;
  }

  if (type === 'ellipse') {
    map.on('click', handleEllipseClick);
    map.on('mousemove', handleEllipseMouseMove);
    return;
  }

  let options = { shapeOptions: getDefaultStyle(type) };
  if (type === 'polygon') currentDrawHandler = new L.Draw.Polygon(map, options);
  else if (type === 'polyline') currentDrawHandler = new L.Draw.Polyline(map, options);
  else if (type === 'marker') {
    options.icon = getMarkerIcon(getDefaultStyle('marker'));
    currentDrawHandler = new L.Draw.Marker(map, options);
  }
  
  if (currentDrawHandler) currentDrawHandler.enable();
};

const handleRectangleClick = (e) => {
  if (!rectStartLatLng) {
    rectStartLatLng = e.latlng;
    const style = getDefaultStyle('rectangle');
    tempRectangle = L.rectangle([rectStartLatLng, rectStartLatLng], { color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }).addTo(map);
  } else {
    if (tempRectangle) { addLayerToMap(tempRectangle, 'rectangle', tempRectangle.getBounds().getCenter()); tempRectangle = null; }
    finishCustomRectangle();
  }
};

const handleRectangleMouseMove = (e) => {
  if (rectStartLatLng && tempRectangle) tempRectangle.setBounds(new L.LatLngBounds(rectStartLatLng, e.latlng));
};

const finishCustomRectangle = () => {
  map.off('click', handleRectangleClick);
  map.off('mousemove', handleRectangleMouseMove);
  rectStartLatLng = null; tempRectangle = null; activeTool.value = null;
  map.off('contextmenu', finishDrawing);
};

const handleCircleClick = (e) => {
  if (!circleStartLatLng) {
    circleStartLatLng = e.latlng;
    const style = getDefaultStyle('circle');
    tempCircle = L.polygon([], { color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }).addTo(map);
  } else {
    if (tempCircle) { addLayerToMap(tempCircle, 'circle', tempCircle.getBounds().getCenter()); tempCircle = null; }
    finishCustomCircle();
  }
};

const handleCircleMouseMove = (e) => {
  if (circleStartLatLng && tempCircle) {
    const radius = circleStartLatLng.distanceTo(e.latlng);
    const points = generateCirclePoints(circleStartLatLng, radius);
    tempCircle.setLatLngs(points);
  }
};

const finishCustomCircle = () => {
  map.off('click', handleCircleClick);
  map.off('mousemove', handleCircleMouseMove);
  circleStartLatLng = null; tempCircle = null; activeTool.value = null;
  map.off('contextmenu', finishDrawing);
};

const handleEllipseClick = (e) => {
  if (!ellipseStartLatLng) {
    ellipseStartLatLng = e.latlng;
    const style = getDefaultStyle('ellipse');
    tempEllipse = L.polygon([], { color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }).addTo(map);
  } else {
    if (tempEllipse) { addLayerToMap(tempEllipse, 'ellipse', tempEllipse.getBounds().getCenter()); tempEllipse = null; }
    finishCustomEllipse();
  }
};

const handleEllipseMouseMove = (e) => {
  if (ellipseStartLatLng && tempEllipse) {
    const latRadius = Math.abs(e.latlng.lat - ellipseStartLatLng.lat);
    const lngRadius = Math.abs(e.latlng.lng - ellipseStartLatLng.lng);
    const points = generateEllipsePoints(ellipseStartLatLng, latRadius, lngRadius);
    tempEllipse.setLatLngs(points);
  }
};

const finishCustomEllipse = () => {
  map.off('click', handleEllipseClick);
  map.off('mousemove', handleEllipseMouseMove);
  ellipseStartLatLng = null; tempEllipse = null; activeTool.value = null;
  map.off('contextmenu', finishDrawing);
};

const finishDrawing = () => {
  if (activeTool.value === 'rectangle') {
    if (tempRectangle) addLayerToMap(tempRectangle, 'rectangle', tempRectangle.getBounds().getCenter());
    finishCustomRectangle(); return;
  }
  if (activeTool.value === 'circle') {
    if (tempCircle) addLayerToMap(tempCircle, 'circle', tempCircle.getBounds().getCenter());
    finishCustomCircle(); return;
  }
  if (activeTool.value === 'ellipse') {
    if (tempEllipse) addLayerToMap(tempEllipse, 'ellipse', tempEllipse.getBounds().getCenter());
    finishCustomEllipse(); return;
  }
  if (currentDrawHandler && currentDrawHandler._enabled) {
    if (activeTool.value === 'marker') currentDrawHandler.disable();
    else currentDrawHandler._finishShape();
  }
  map.off('contextmenu', finishDrawing);
  activeTool.value = null;
};

const toggleEditMode = () => {
  if (activeTool.value === 'edit') {
    activeTool.value = null;
    editableLayers.eachLayer((l) => l.editing && l.editing.disable());
  } else {
    if (currentDrawHandler && currentDrawHandler._enabled) currentDrawHandler.disable();
    if (tempRectangle) finishCustomRectangle();
    if (tempCircle) finishCustomCircle();
    if (tempEllipse) finishCustomEllipse();
    activeTool.value = 'edit';
    editableLayers.eachLayer((l) => { if (l.editing) l.editing.enable(); });
  }
};

const updateNodeStyle = (newStyle) => {
  if (selectedNode.value && selectedNode.value.layerRef) {
    if (selectedNode.value.type === 'marker') {
      selectedNode.value.layerRef.setIcon(getMarkerIcon(newStyle));
    } else {
      selectedNode.value.layerRef.setStyle({ 
        color: newStyle.color, 
        fillColor: newStyle.fillColor, 
        fillOpacity: newStyle.fillOpacity, 
        weight: newStyle.weight 
      });
    }
    selectedNode.value.style = { ...newStyle };
    handleLayerUpdate({ id: selectedNode.value.id, style: { ...newStyle } });
  }
};

const updateBaseOpacity = (val) => { baseOpacity.value = val; if (baseLayer) baseLayer.setOpacity(val); };
const updateAnnoOpacity = (val) => { annoOpacity.value = val; if (annoLayer) annoLayer.setOpacity(val); };

const handleSearch = async (query, callback) => {
  if (!map) return;
  callback('正在搜索...');
  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(query)}&key=${AMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const location = data.geocodes[0].location.split(',');
      const zoom = props.config.baseLayer.type === 'custom-canvas' ? 2 : 16;
      map.flyTo([parseFloat(location[1]), parseFloat(location[0])], zoom, { duration: 2 });
      callback(`已定位: ${data.geocodes[0].formatted_address}`);
    } else {
      callback('未找到相关地点。');
    }
  } catch (error) {
    callback('搜索失败，请检查网络。');
  }
};

const triggerUpload = (type) => {
  if (type === 'base') baseInputRef.value.click();
  else if (type === 'both') bothInputRef.value.click();
};

const handleBaseUpload = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  loadBaseImage(url, file);
  event.target.value = '';
};

const handleBothUpload = (event) => {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = parseProject(e.target.result);
      if (!data.baseImage) { alert("文件格式错误，未找到底图数据！"); return; }
      loadBaseImage(data.baseImage, null, data.width, data.height);
      setTimeout(() => restoreAnnotations(data.annotations), 500);
    } catch (err) { alert(err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
};

const loadBaseImage = async (imageSrc, fileObj = null, width = 0, height = 0) => {
  const img = new Image();
  img.onload = async () => {
    const w = width || img.naturalWidth;
    const h = height || img.naturalHeight;
    currentBaseImageWidth = w; currentBaseImageHeight = h;
    if (fileObj) currentBaseImageData = await fileToBase64(fileObj);
    else currentBaseImageData = imageSrc;

    isCustomImageLoaded.value = true;

    setTimeout(() => {
      if (mapContainer.value) {
        map = L.map(mapContainer.value, { crs: L.CRS.Simple, minZoom: -3, maxZoom: 5, zoomControl: false, attributionControl: false });
        L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);
        const bounds = [[0, 0], [h, w]];
        baseLayer = L.imageOverlay(imageSrc, bounds, { opacity: 1 }).addTo(map);
        map.fitBounds(bounds);

        defaultCenter = [map.getCenter().lat, map.getCenter().lng];
        defaultZoom = map.getZoom();

        editableLayers = new L.FeatureGroup();
        map.addLayer(editableLayers);
        bindMapEvents();
        loadHistoricalLayers();
        map.on('zoomend', handleZoomEnd);
        handleZoomEnd();

        const savedState = localStorage.getItem(`geo_last_state_${props.config.toolId}`);
        if (savedState) {
          try {
            const parsed = JSON.parse(savedState);
            map.setView(parsed.center, parsed.zoom);
            defaultCenter = [map.getCenter().lat, map.getCenter().lng];
            defaultZoom = map.getZoom();
          } catch (e) {}
        }

        resizeObserver = new ResizeObserver(() => { if (map) map.invalidateSize(); });
        resizeObserver.observe(mapContainer.value);
        document.addEventListener('fullscreenchange', handleResize);
      }
    }, 100);
  };
  img.src = imageSrc;
};

const resetImage = () => {
  if (map) { map.remove(); map = null; }
  isCustomImageLoaded.value = false;
  drawnLayers.value = [];
  groups.value = [{ id: 1, name: '默认' }];
  selectedNode.value = null;
  currentBaseImageData = null;
};

const restoreAnnotations = (annotations) => {
  if (!annotations || !Array.isArray(annotations) || !map) return;
  const isValidPoint = (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]);
  annotations.forEach(item => {
    if (!item || !item.type || !item.coords || item.coords.length === 0) {
      console.warn('跳过无效图层:', item);
      return;
    }
    if (!item.coords.every(isValidPoint)) {
      console.warn('跳过无效图层(坐标含NaN):', item.id);
      return;
    }

    let layer = null;
    try {
      if (item.type === 'polygon' || item.type === 'circle' || item.type === 'ellipse') layer = L.polygon(item.coords, item.style).addTo(map);
      else if (item.type === 'polyline') layer = L.polyline(item.coords, item.style).addTo(map);
      else if (item.type === 'rectangle') layer = L.rectangle(item.coords, item.style).addTo(map);
      else if (item.type === 'marker') {
        const markerStyle = { ...getDefaultStyle('marker'), ...(item.style || {}) };
        layer = L.marker(item.coords[0], { icon: getMarkerIcon(markerStyle) }).addTo(map);
      }
    } catch (e) {
      console.warn('渲染单个图层失败:', item, e);
      return;
    }

    if (layer) {
      editableLayers.addLayer(layer);
      const uuid = item.id || (Date.now().toString(36) + Math.random().toString(36).substring(2, 9));
      layer.uniqueId = uuid;
      
      const lat = (item.coords && item.coords[0] && item.coords[0][0] !== undefined) ? item.coords[0][0] : 0;
      const lng = (item.coords && item.coords[0] && item.coords[0][1] !== undefined) ? item.coords[0][1] : 0;

      const layerData = {
        id: uuid, toolId: props.config.toolId, title: item.title, type: item.type,
        lat: lat, lng: lng,
        layerRef: layer, docHtml: item.docHtml, style: item.style || {},
        objectName: (item.objectName === '默认名称' || !item.objectName) ? '' : item.objectName,
        group: item.group || '默认',
        fields: (item.fields || Array.from({ length: 500 })).map((f, idx) => {
          const defaultLabel = `信息的名称${idx + 1}`;
          return {
            label: (f.label === defaultLabel || !f.label) ? '' : f.label,
            value: f.value || ''
          };
        })
      };
      drawnLayers.value.push(layerData);
      if (item.group && !groups.value.find(g => g.name === item.group)) {
        groups.value.push({ id: 0, name: item.group });
      }
      layer.on('click', () => {
        const currentData = drawnLayers.value.find(d => d.id === layer.uniqueId);
        if (currentData) {
          selectedNode.value = { ...currentData };
          if (infoPanelRef.value) infoPanelRef.value.selectLayer(currentData);
        }
      });

      layer.on('contextmenu', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        contextMenuX.value = e.originalEvent.clientX;
        contextMenuY.value = e.originalEvent.clientY;
        contextMenuLayerData.value = layerData;
        contextMenuVisible.value = true;
      });
    }
  });
};

const refreshDataFromDB = async () => {
  if (!map || !editableLayers) return;
  editableLayers.clearLayers();
  drawnLayers.value = [];
  await loadHistoricalLayers();
};

// 导出工程时 NaN 校验 + coords 回退
const getProjectData = () => {
  const layersWithCoords = drawnLayers.value.map(item => {
    let coords = extractCoordsFromLayer(item);

    if (coords.length === 0 && item.coords && item.coords.length > 0) {
      coords = item.coords;
    }

    return { ...item, coords };
  });
  
  const rawData = buildProjectFile(props.config, map, layersWithCoords, currentBaseImageData, currentBaseImageWidth, currentBaseImageHeight);
  rawData.groups = JSON.parse(JSON.stringify(groups.value));
  rawData.fileId = props.fileId; // 🚨 核心：把当前文件编号打包进工程数据
  return JSON.parse(JSON.stringify(rawData));
};

const loadProjectData = async (projectData) => {
  if (props.config.toolId === 'geo-eagle-eye') {
    alert('“鹰眼公共平台”是独立工具，它的数据是自动永久保存的，不支持加载工程文件覆盖数据，以免造成数据丢失。');
    return;
  }

  if (drawnLayers.value.length > 0) {
    const confirmLoad = window.confirm('当前工作区有未保存的图形，加载新工程将覆盖它们。确定要继续吗？');
    if (!confirmLoad) return;
  }

  clearAllLayers(true); 
  if (map) { map.remove(); map = null; }

  const { baseLayer: baseCfg, mapState, layers, groups: loadedGroups } = projectData;
  if (!baseCfg) {
    alert('工程数据损坏：缺少底图信息！');
    return;
  }
  
  if (loadedGroups && Array.isArray(loadedGroups)) {
    if (loadedGroups.length > 0 && typeof loadedGroups[0] === 'string') {
      groups.value = [{ id: 1, name: '默认' }];
      loadedGroups.forEach(g => { if (g !== '默认') groups.value.push({ id: 0, name: g }); });
    } else {
      groups.value = loadedGroups;
    }
  } else {
    groups.value = [{ id: 1, name: '默认' }];
  }

  const view = props.config.initialView || { center: [39.0123, 117.3456], zoom: 15 };
  
  const mapOptions = (baseCfg.type === 'custom-canvas')
    ? { crs: L.CRS.Simple, minZoom: -5, maxZoom: 10, zoomControl: false, attributionControl: false, center: [0, 0], zoom: 1 }
    : { center: view.center, zoom: view.zoom, zoomControl: false, attributionControl: false };

  map = L.map(mapContainer.value, mapOptions);
  L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);

  defaultCenter = [map.getCenter().lat, map.getCenter().lng];
  defaultZoom = map.getZoom();

  if (baseCfg.type === 'custom-canvas' && baseCfg.customImage) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = baseCfg.customWidth || img.naturalWidth;
        const h = baseCfg.customHeight || img.naturalHeight;
        currentBaseImageData = baseCfg.customImage;
        currentBaseImageWidth = w;
        currentBaseImageHeight = h;
        isCustomImageLoaded.value = true;
        const bounds = [[0, 0], [h, w]];
        baseLayer = L.imageOverlay(baseCfg.customImage, bounds, { opacity: 1 }).addTo(map);
        map.fitBounds(bounds);
        defaultCenter = [map.getCenter().lat, map.getCenter().lng];
        defaultZoom = map.getZoom();
        resolve();
      };
      img.src = baseCfg.customImage;
    });
  } else {
    if (baseCfg.type === 'amap-satellite' || baseCfg.type === 'amap-standard') {
      baseLayer = L.tileLayer(baseCfg.url, { subdomains: ['1', '2', '3', '4'], maxZoom: 18, maxNativeZoom: 18 }).addTo(map);
      if (baseCfg.annoUrl) annoLayer = L.tileLayer(baseCfg.annoUrl, { subdomains: ['1', '2', '3', '4'], maxZoom: 18, maxNativeZoom: 18 }).addTo(map);
    } else if (baseCfg.type === 'esri-world') {
      baseLayer = L.tileLayer(baseCfg.url, { maxZoom: 19 }).addTo(map);
      if (baseCfg.annoUrl) annoLayer = L.tileLayer(baseCfg.annoUrl, { maxZoom: 19 }).addTo(map);
    } else if (baseCfg.type === 'local-image') {
      baseLayer = L.imageOverlay(baseCfg.url, baseCfg.bounds, { opacity: 1, interactive: false }).addTo(map);
      map.fitBounds(baseCfg.bounds);
      defaultCenter = [map.getCenter().lat, map.getCenter().lng];
      defaultZoom = map.getZoom();
    }
  }

  if (map && mapState && mapState.center && mapState.center.lat !== undefined) {
    map.setView([mapState.center.lat, mapState.center.lng], mapState.zoom || 15);
    defaultCenter = [map.getCenter().lat, map.getCenter().lng];
    defaultZoom = map.getZoom();
  }

  editableLayers = new L.FeatureGroup();
  map.addLayer(editableLayers);
  bindMapEvents();
  map.on('zoomend', handleZoomEnd);
  handleZoomEnd();

  if (layers && layers.length > 0) {
    restoreAnnotations(layers);
  }

  forceAutoSave();
};

const saveProjectToInventoryAction = async (projectName) => {
  const data = getProjectData();
  data.name = projectName || `工程_${new Date().getTime()}`;
  return await saveProjectToInventory(data);
};

defineExpose({
  getProjectData,
  loadProjectData,
  refreshDataFromDB,
  saveProjectToInventory: saveProjectToInventoryAction
});
</script>

<style scoped>
.map-wrapper { position: relative; width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; flex: 1; background: #1a1a1a; }
.map-container-div { width: 100%; height: 100%; background: #1a1a1a; }

.custom-zoom-control { position: absolute; top: 15px; left: 15px; z-index: 1000; display: flex; flex-direction: column; background: white; border-radius: 4px; box-shadow: 0 1px 5px rgba(0,0,0,0.4); overflow: hidden; }
.custom-zoom-control button { width: 30px; height: 30px; border: none; background: white; font-size: 18px; font-weight: bold; color: #333; cursor: pointer; border-bottom: 1px solid #ccc; display: flex; align-items: center; justify-content: center; }
.custom-zoom-control button:last-child { border-bottom: none; }
.custom-zoom-control button:hover { background: #f4f4f4; }

.custom-bottom-toolbar {
  position: absolute;
  bottom: 15px;
  left: 15px;
  z-index: 1050;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}
.reset-center-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: #f0f0f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;
  color: #333;
}
.reset-center-btn:hover { background: #e6f7ff; border-color: #1890ff; color: #1890ff; }
.zoom-percent-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #333;
}
.zoom-percent-slider {
  width: 100px;
  cursor: pointer;
}
.zoom-percent-label {
  font-weight: bold;
  color: #1890ff;
}

.upload-container { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 999; background: #1a1a1a; display: flex; justify-content: center; align-items: center; }
.upload-box { background: #fff; padding: 40px 60px; border-radius: 10px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.upload-box h2 { margin-top: 0; color: #333; }
.upload-box p { color: #666; font-size: 14px; }
.upload-actions { 
  display: flex; 
  gap: 10px; 
  justify-content: center; /* 🚨 新增：让剩下的单个按钮居中 */
  margin-top: 20px; 
}.action-btn { background: #f0f0f0; color: #333; border: 1px solid #ccc; padding: 8px 16px; font-size: 14px; border-radius: 5px; cursor: pointer; transition: 0.2s; }
.action-btn.primary { background: #1890ff; color: white; border-color: #1890ff; }
.action-btn.primary:hover { background: #40a9ff; }
.action-btn:hover { background: #e0e0e0; }
.upload-hint { font-size: 12px !important; color: #999 !important; margin-top: 15px; }
.custom-toolbar { position: absolute; top: 80px; left: 15px; z-index: 1050; background: white; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; flex-direction: column; padding: 4px; gap: 4px; }
.custom-toolbar button { width: 24px; height: 24px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #333; }
.custom-toolbar button:hover { background: #f0f0f0; }
.custom-toolbar button.active { background: #e6f7ff; color: #1890ff; box-shadow: inset 0 0 0 1px #1890ff; }
.toolbar-divider { margin: 2px 0; border: none; border-top: 1px solid #eee; }

.custom-context-menu {
  position: fixed;
  z-index: 9999;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 80px;
}
.context-menu-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 13px;
  color: #1f2937;
  cursor: pointer;
  transition: background 0.2s;
}
.context-menu-item:hover { background: #f3f4f6; }
.context-menu-item.delete-item { color: #ef4444; }
.context-menu-item.delete-item:hover { background: #fee2e2; }
</style>