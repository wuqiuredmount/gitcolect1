<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container-div"></div>

    <div class="custom-toolbar">
      <button :class="{ active: activeTool === 'polygon' }" @click="startDrawing('polygon')" title="绘制多边形">⬠</button>
      <button :class="{ active: activeTool === 'polyline' }" @click="startDrawing('polyline')" title="绘制折线">📈</button>
      <button :class="{ active: activeTool === 'rectangle' }" @click="startDrawing('rectangle')" title="绘制矩形">⬜</button>
      <button :class="{ active: activeTool === 'marker' }" @click="startDrawing('marker')" title="绘制标记点">📍</button>
      <hr class="toolbar-divider">
      <button :class="{ active: activeTool === 'edit' }" @click="toggleEditMode" title="编辑图形形状">✏️</button>
      <button @click="clearAllLayers" title="清除所有" style="color: #e74c3c;">🗑️</button>
      <hr class="toolbar-divider">
      <button @click="toggleFullscreen" title="全屏切换">⛶</button>
    </div>

    <!-- 1. 定位查找 -->
    <LocatingPanel @search="handleSearch" />

    <!-- 2. 图形列表 (纯列表，支持检索和双击定位) -->
    <LayerListPanel 
      :layers="drawnLayers" 
      @locate="flyToLayer" 
    />

    <!-- 3. 图层透明度 -->
    <OpacityPanel :baseOpacity="baseOpacity" :annoOpacity="annoOpacity" @update:base="updateBaseOpacity" @update:anno="updateAnnoOpacity" />

    <!-- 4. 信息栏 (500个字段编辑 + 格式管理 + 导出 Excel) -->
    <InfoPanel 
      ref="infoPanelRef"
      :layers="drawnLayers" 
      @locate="flyToLayer" 
      @update-layer="handleLayerUpdate" 
    />

    <MarkerDocPanel 
      v-if="selectedNode"
      :node="selectedNode"
      @close="selectedNode = null"
      @update:title="handleNodeTitleUpdate"
      @update:content="val => selectedNode.docHtml = val"
      @update:style="val => updateNodeStyle(val)"
    />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

import { zhCN_DrawLocal, drawStyles } from '../../../groups/geo/drawConfig.js';
import MarkerDocPanel from './panels/MarkerDocPanel.vue';
import LocatingPanel from './panels/LocatingPanel.vue';
import LayerListPanel from './panels/LayerListPanel.vue';
import OpacityPanel from './panels/OpacityPanel.vue';
import InfoPanel from './panels/InfoPanel.vue';

L.drawLocal = zhCN_DrawLocal;
const AMAP_KEY = '69d86725ca981d56159af949ce2a68ec'; 

let map = null;
let editableLayers = null;
let baseLayer = null;
let annoLayer = null;
let currentDrawHandler = null;
let tempRectangle = null;
let rectStartLatLng = null;
let resizeObserver = null; 

const mapContainer = ref(null);
const infoPanelRef = ref(null); 
const selectedNode = ref(null);
const baseOpacity = ref(1);
const annoOpacity = ref(1);
const activeTool = ref(null); 
const drawnLayers = ref([]);

onMounted(() => {
  if (!mapContainer.value) return;

  // ✨ 全球底图初始化
  map = L.map(mapContainer.value, { center: [30, 0], zoom: 3, zoomControl: true, attributionControl: false });
  L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);

  baseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
  }).addTo(map);

  annoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
  }).addTo(map);

  editableLayers = new L.FeatureGroup();
  map.addLayer(editableLayers);

  bindMapEvents();
  
  resizeObserver = new ResizeObserver(() => {
    if (map) map.invalidateSize();
  });
  resizeObserver.observe(mapContainer.value);

  document.addEventListener('fullscreenchange', handleResize);
});

onUnmounted(() => {
  if (map) map.remove();
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  document.removeEventListener('fullscreenchange', handleResize);
});

const handleResize = () => { setTimeout(() => { if (map) map.invalidateSize(); }, 100); };

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.warn(err));
  } else {
    document.exitFullscreen();
  }
};

const handleSearch = async (query, callback) => {
  callback('正在搜索...');
  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(query)}&key=${AMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const location = data.geocodes[0].location.split(',');
      map.flyTo([parseFloat(location[1]), parseFloat(location[0])], 6, { duration: 2 });
      callback(`已定位：${data.geocodes[0].formatted_address}`);
    } else {
      callback('未找到相关地点。');
    }
  } catch (error) {
    callback('搜索失败，请检查网络。');
  }
};

const bindMapEvents = () => {
  map.on(L.Draw.Event.DRAWSTART, () => { map.on('contextmenu', finishDrawing); });
  map.on(L.Draw.Event.DRAWSTOP, () => {
    map.off('contextmenu', finishDrawing);
    if (!currentDrawHandler || !currentDrawHandler._enabled) activeTool.value = null;
  });
  map.on(L.Draw.Event.CREATED, (e) => {
    addLayerToMap(e.layer, e.layerType, e.layer.getLatLng ? e.layer.getLatLng() : (e.layer.getBounds ? e.layer.getBounds().getCenter() : null));
    activeTool.value = null;
    currentDrawHandler = null;
  });
  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer((layer) => {
      const item = drawnLayers.value.find(d => d.layerRef === layer);
      if (item) {
        item.lat = layer.getLatLng ? layer.getLatLng().lat : (layer.getBounds ? layer.getBounds().getCenter().lat : 0);
        item.lng = layer.getLatLng ? layer.getLatLng().lng : (layer.getBounds ? layer.getBounds().getCenter().lng : 0);
      }
    });
  });
};

const addLayerToMap = (layer, type, latlng) => {
  editableLayers.addLayer(layer);
  const initialTitle = type === 'marker' ? '默认名称' : `自定义${type === 'polygon' ? '区域' : type === 'polyline' ? '路线' : type === 'rectangle' ? '矩形' : '标记'}`;
  const layerData = {
    id: layer._leaflet_id, title: initialTitle, type, lat: latlng ? latlng.lat : 0, lng: latlng ? latlng.lng : 0,
    layerRef: layer, docHtml: '<p>开始编写您的文档...</p>',
    objectName: '默认名称',
    fields: Array.from({ length: 500 }).map((_, i) => ({ label: `信息的名称${i + 1}`, value: '' })),
    style: { color: layer.options.color || '#3388ff', fillColor: layer.options.fillColor || '#3388ff', fillOpacity: layer.options.fillOpacity !== undefined ? layer.options.fillOpacity : 0.2, weight: layer.options.weight || 3 }
  };
  drawnLayers.value.push(layerData);
  
  layer.on('click', () => { 
    selectedNode.value = { ...layerData }; 
    if (infoPanelRef.value) {
      infoPanelRef.value.selectLayer(layerData);
    }
  });
};

const handleLayerUpdate = (updatedLayer) => {
  const index = drawnLayers.value.findIndex(l => l.id === updatedLayer.id);
  if (index !== -1) {
    drawnLayers.value[index] = { ...drawnLayers.value[index], ...updatedLayer };
  }
};

const flyToLayer = (item) => {
  if (item.lat && item.lng) {
    map.flyTo([item.lat, item.lng], 6, { duration: 1.5 });
    if (item.layerRef) item.layerRef.fire('click');
  }
};

const handleNodeTitleUpdate = (newTitle) => {
  if (selectedNode.value) {
    selectedNode.value.title = newTitle;
    const item = drawnLayers.value.find(d => d.id === selectedNode.value.id);
    if (item) item.title = newTitle;
  }
};

const clearAllLayers = () => {
  editableLayers.clearLayers();
  if (tempRectangle) { map.removeLayer(tempRectangle); tempRectangle = null; }
  selectedNode.value = null; activeTool.value = null; rectStartLatLng = null; drawnLayers.value = [];
};

const startDrawing = (type) => {
  if (currentDrawHandler && currentDrawHandler._enabled) currentDrawHandler.disable();
  if (tempRectangle) { map.removeLayer(tempRectangle); tempRectangle = null; }
  rectStartLatLng = null; activeTool.value = type;

  if (type === 'rectangle') { map.on('click', handleRectangleClick); map.on('mousemove', handleRectangleMouseMove); return; }

  let options = { shapeOptions: drawStyles[type] };
  if (type === 'polygon') currentDrawHandler = new L.Draw.Polygon(map, options);
  else if (type === 'polyline') currentDrawHandler = new L.Draw.Polyline(map, options);
  else if (type === 'marker') currentDrawHandler = new L.Draw.Marker(map, options);
  if (currentDrawHandler) currentDrawHandler.enable();
};

const handleRectangleClick = (e) => {
  if (!rectStartLatLng) {
    rectStartLatLng = e.latlng;
    tempRectangle = L.rectangle([rectStartLatLng, rectStartLatLng], { color: '#ffcc00', fillOpacity: 0.4 }).addTo(map);
  } else {
    if (tempRectangle) { addLayerToMap(tempRectangle, 'rectangle', tempRectangle.getBounds().getCenter()); tempRectangle = null; }
    finishCustomRectangle();
  }
};
const handleRectangleMouseMove = (e) => { if (rectStartLatLng && tempRectangle) tempRectangle.setBounds(new L.LatLngBounds(rectStartLatLng, e.latlng)); };
const finishCustomRectangle = () => { map.off('click', handleRectangleClick); map.off('mousemove', handleRectangleMouseMove); rectStartLatLng = null; tempRectangle = null; activeTool.value = null; map.off('contextmenu', finishDrawing); };
const finishDrawing = () => {
  if (activeTool.value === 'rectangle') { if (tempRectangle) addLayerToMap(tempRectangle, 'rectangle', tempRectangle.getBounds().getCenter()); finishCustomRectangle(); return; }
  if (currentDrawHandler && currentDrawHandler._enabled) { if (activeTool.value === 'marker') currentDrawHandler.disable(); else currentDrawHandler._finishShape(); }
  map.off('contextmenu', finishDrawing); activeTool.value = null;
};

const toggleEditMode = () => {
  if (activeTool.value === 'edit') { activeTool.value = null; editableLayers.eachLayer((l) => l.editing && l.editing.disable()); } 
  else { if (currentDrawHandler && currentDrawHandler._enabled) currentDrawHandler.disable(); if (tempRectangle) finishCustomRectangle(); activeTool.value = 'edit'; editableLayers.eachLayer((l) => { if (l.editing) l.editing.enable(); }); }
};

const updateNodeStyle = (newStyle) => {
  if (selectedNode.value && selectedNode.value.layerRef) {
    selectedNode.value.layerRef.setStyle({ color: newStyle.color, fillColor: newStyle.fillColor, fillOpacity: newStyle.fillOpacity, weight: newStyle.weight });
    selectedNode.value.style = { ...newStyle };
  }
};
const updateBaseOpacity = (val) => { baseOpacity.value = val; if (baseLayer) baseLayer.setOpacity(val); };
const updateAnnoOpacity = (val) => { annoOpacity.value = val; if (annoLayer) annoLayer.setOpacity(val); };

onMounted(() => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
});
</script>

<style scoped>
.map-wrapper { position: relative; width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; flex: 1; }
.map-container-div { width: 100%; height: 100%; background: #1a1a1a; }

.custom-toolbar {
  position: absolute; top: 80px; left: 15px; z-index: 1050;
  background: white; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  display: flex; flex-direction: column; padding: 4px; gap: 4px;
}
.custom-toolbar button { width: 24px; height: 24px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #333; }
.custom-toolbar button:hover { background: #f0f0f0; }
.custom-toolbar button.active { background: #e6f7ff; color: #1890ff; box-shadow: inset 0 0 0 1px #1890ff; }
.toolbar-divider { margin: 2px 0; border: none; border-top: 1px solid #eee; }
</style>