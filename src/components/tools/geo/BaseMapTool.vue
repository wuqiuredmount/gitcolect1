<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container-div"></div>

    <!-- ⚠️ 核心修复：使用绝对定位强行覆盖，确保上传界面一定能显示 -->
    <div v-if="config.baseLayer.type === 'custom-canvas' && !isCustomImageLoaded" class="upload-container">
      <div class="upload-box">
        <h2>📁 自定义底图 + 自由标记</h2>
        <p>请选择底图，或加载之前的标注</p>
        <div class="upload-actions">
          <button class="action-btn primary" @click="triggerUpload('base')">🖼️ 打开底图</button>
          <button class="action-btn" @click="triggerUpload('layer')">📋 打开标注层</button>
          <button class="action-btn" @click="triggerUpload('both')">📦 打开底图+标注层</button>
        </div>
        <p class="upload-hint">支持任意图片格式，大文件也无需担心</p>
        <input type="file" accept="image/*" @change="handleBaseUpload" ref="baseInputRef" style="display: none;" />
        <input type="file" accept=".json,.freemap" @change="handleLayerUpload" ref="layerInputRef" style="display: none;" />
        <input type="file" accept=".json,.freemap" @change="handleBothUpload" ref="bothInputRef" style="display: none;" />
      </div>
    </div>

    <template v-if="config.baseLayer.type !== 'custom-canvas' || isCustomImageLoaded">
      <div v-if="config.visibleTools.drawToolbar" class="custom-toolbar" :data-tool-id="'draw-' + config.toolId">
        <button :class="{ active: activeTool === 'polygon' }" @click="startDrawing('polygon')" title="绘制多边形">⬠</button>
        <button :class="{ active: activeTool === 'polyline' }" @click="startDrawing('polyline')" title="绘制折线">📈</button>
        <button :class="{ active: activeTool === 'rectangle' }" @click="startDrawing('rectangle')" title="绘制矩形">⬜</button>
        <button :class="{ active: activeTool === 'marker' }" @click="startDrawing('marker')" title="绘制标记点">📍</button>
        <hr class="toolbar-divider">
        <button :class="{ active: activeTool === 'edit' }" @click="toggleEditMode" title="编辑图形形状">✏️</button>
        <button @click="clearAllLayers" title="清除所有" style="color: #e74c3c;">🗑️</button>
        <hr class="toolbar-divider">
        <button @click="toggleFullscreen" title="全屏切换">⛶</button>
        <hr v-if="config.baseLayer.type === 'custom-canvas'" class="toolbar-divider">
        <button v-if="config.baseLayer.type === 'custom-canvas'" @click="resetImage" title="重新选择图片">🖼️</button>
      </div>

      <LocatingPanel v-if="config.visibleTools.locatingPanel" :panel-id="'locating-' + config.toolId" @search="handleSearch" />
      <LayerListPanel v-if="config.visibleTools.layerListPanel" :panel-id="'layerList-' + config.toolId" :layers="drawnLayers" @locate="flyToLayer" />
      <OpacityPanel v-if="config.visibleTools.opacityPanel" :panel-id="'opacity-' + config.toolId" :baseOpacity="baseOpacity" :annoOpacity="annoOpacity" :showAnno="config.baseLayer.annoUrl ? true : false" @update:base="updateBaseOpacity" @update:anno="updateAnnoOpacity" />
      <InfoPanel v-if="config.visibleTools.infoPanel" ref="infoPanelRef" :tool-id="config.toolId" :layers="drawnLayers" @locate="flyToLayer" @update-layer="handleLayerUpdate" />

      <MarkerDocPanel 
        v-if="config.visibleTools.markerDocPanel && selectedNode"
        :node="selectedNode"
        :tool-id="config.toolId"
        @close="selectedNode = null"
        @update:title="handleTitleUpdate"
        @update:content="handleDocContentUpdate"
        @update:style="val => updateNodeStyle(val)"
      />

      <div v-if="config.baseLayer.type === 'custom-canvas'" class="save-toolbar">
        <button @click="saveData('base')">💾 保存底图</button>
        <button @click="saveData('layer')">💾 保存标注层</button>
        <button @click="saveData('both')">📦 保存底图+标注层</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

import { zhCN_DrawLocal, drawStyles } from '../../../groups/geo/utils/drawConfig.js';
import { saveAllLayers, getAllLayers } from '../../../groups/geo/utils/annotationStore.js';
import { downloadFile, fileToBase64, serializeAnnotations, packageProject, parseProject } from '../../../groups/geo/utils/fileManager.js';

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
      visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true }
    })
  }
});

const mapContainer = ref(null);
const baseInputRef = ref(null);
const layerInputRef = ref(null);
const bothInputRef = ref(null);
const infoPanelRef = ref(null);

let map = null;
let editableLayers = null;
let baseLayer = null;
let annoLayer = null;
let currentDrawHandler = null;
let tempRectangle = null;
let rectStartLatLng = null;
let resizeObserver = null;

let currentBaseImageData = null;
let currentBaseImageWidth = 0;
let currentBaseImageHeight = 0;

const selectedNode = ref(null);
const baseOpacity = ref(1);
const annoOpacity = ref(1);
const activeTool = ref(null);
const drawnLayers = ref([]);
const isCustomImageLoaded = ref(false);
const AMAP_KEY = '69d86725ca981d56159af949ce2a68ec';

const initMap = () => {
  if (!mapContainer.value) return;
  if (map) { map.remove(); }
  const view = props.config.initialView || { center: [39.0123, 117.3456], zoom: 15 };
  const baseCfg = props.config.baseLayer;
  const mapOptions = baseCfg.type === 'custom-canvas'
    ? { crs: L.CRS.Simple, minZoom: -3, maxZoom: 5, zoomControl: true, attributionControl: false }
    : { center: view.center, zoom: view.zoom, zoomControl: true, attributionControl: false };

  map = L.map(mapContainer.value, mapOptions);
  L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);

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
  resizeObserver = new ResizeObserver(() => { if (map) map.invalidateSize(); });
  resizeObserver.observe(mapContainer.value);
  document.addEventListener('fullscreenchange', handleResize);
};

onMounted(() => {
  if (props.config.baseLayer.type === 'custom-canvas') return; 
  initMap();

  const bluePinIcon = L.divIcon({
    className: 'custom-blue-pin',
    html: `<div style="position: relative; width: 30px; height: 42px;">
             <div style="position: absolute; top: 0; left: 0; width: 26px; height: 26px; background: #1890ff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
             <div style="position: absolute; top: 8px; left: 8px; width: 14px; height: 14px; background: #fff; border-radius: 50%;"></div>
           </div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42]
  });
  L.Marker.prototype.options.icon = bluePinIcon;
});

onUnmounted(() => {
  if (map) map.remove();
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  document.removeEventListener('fullscreenchange', handleResize);
});

const handleResize = () => { setTimeout(() => { if (map) map.invalidateSize(); }, 100); };
const toggleFullscreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.warn(err)); else document.exitFullscreen(); };

const loadHistoricalLayers = async () => {
  if (!map || !editableLayers) return;
  const records = await getAllLayers(props.config.toolId);
  if (!records || records.length === 0) return;
  records.forEach(item => {
    let layer = null;
    try {
      if (item.type === 'polygon') layer = L.polygon(item.coords, item.style).addTo(map);
      else if (item.type === 'polyline') layer = L.polyline(item.coords, item.style).addTo(map);
      else if (item.type === 'rectangle') layer = L.rectangle(item.coords, item.style).addTo(map);
      else if (item.type === 'marker') layer = L.marker(item.coords[0]).addTo(map);
    } catch (e) { console.warn('加载历史图层失败', e); }
    if (layer) {
      editableLayers.addLayer(layer);
      layer.uniqueId = item.id;
      const layerData = { ...item, layerRef: layer };
      drawnLayers.value.push(layerData);
      layer.on('click', () => {
        const currentData = drawnLayers.value.find(d => d.id === layer.uniqueId);
        if (currentData) {
          selectedNode.value = { ...currentData };
          if (infoPanelRef.value) infoPanelRef.value.selectLayer(currentData);
        }
      });
    }
  });
};

const bindMapEvents = () => {
  map.on(L.Draw.Event.DRAWSTART, () => { map.on('contextmenu', finishDrawing); });
  map.on(L.Draw.Event.DRAWSTOP, () => {
    map.off('contextmenu', finishDrawing);
    if (!currentDrawHandler || !currentDrawHandler._enabled) activeTool.value = null;
  });
  map.on(L.Draw.Event.CREATED, (e) => {
    addLayerToMap(e.layer, e.layerType, e.layer.getLatLng ? e.layer.getLatLng() : (e.layer.getBounds ? e.layer.getBounds().getCenter() : null));
    activeTool.value = null; currentDrawHandler = null;
  });
  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer((layer) => {
      const item = drawnLayers.value.find(d => d.id === layer.uniqueId);
      if (item) {
        item.lat = layer.getLatLng ? layer.getLatLng().lat : (layer.getBounds ? layer.getBounds().getCenter().lat : 0);
        item.lng = layer.getLatLng ? layer.getLatLng().lng : (layer.getBounds ? layer.getBounds().getCenter().lng : 0);
      }
    });
    saveAllLayers(props.config.toolId, drawnLayers.value);
  });
};

const addLayerToMap = (layer, type, latlng) => {
  const uuid = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  layer.uniqueId = uuid;
  editableLayers.addLayer(layer);
  const initialTitle = type === 'marker' ? '默认名称' : `自定义${type === 'polygon' ? '区域' : type === 'polyline' ? '路线' : type === 'rectangle' ? '矩形' : '标记'}`;
  const layerData = {
    id: uuid, toolId: props.config.toolId, title: initialTitle, type,
    lat: latlng ? latlng.lat : 0, lng: latlng ? latlng.lng : 0,
    layerRef: layer, docHtml: '', objectName: '默认名称',
    fields: Array.from({ length: 500 }).map((_, i) => ({ label: `信息的名称${i + 1}`, value: '' })),
    style: { color: layer.options.color || '#3388ff', fillColor: layer.options.fillColor || '#3388ff', fillOpacity: layer.options.fillOpacity !== undefined ? layer.options.fillOpacity : 0.2, weight: layer.options.weight || 3 }
  };
  drawnLayers.value.push(layerData);
  layer.on('click', () => {
    const currentData = drawnLayers.value.find(d => d.id === layer.uniqueId);
    if (currentData) {
      selectedNode.value = { ...currentData };
      if (infoPanelRef.value) infoPanelRef.value.selectLayer(currentData);
    }
  });
  saveAllLayers(props.config.toolId, drawnLayers.value);
};

const handleLayerUpdate = (updatedLayer) => {
  const index = drawnLayers.value.findIndex(l => l.id === updatedLayer.id);
  if (index !== -1) {
    drawnLayers.value[index] = { ...drawnLayers.value[index], ...updatedLayer, toolId: props.config.toolId };
    if (selectedNode.value && selectedNode.value.id === updatedLayer.id) {
      selectedNode.value = { ...selectedNode.value, ...updatedLayer };
    }
    saveAllLayers(props.config.toolId, drawnLayers.value);
  }
};
const handleTitleUpdate = (val) => { if (selectedNode.value) { selectedNode.value.title = val; handleLayerUpdate({ id: selectedNode.value.id, title: val }); } };
const handleDocContentUpdate = (val) => { if (selectedNode.value) { selectedNode.value.docHtml = val; handleLayerUpdate({ id: selectedNode.value.id, docHtml: val }); } };
const flyToLayer = (item) => {
  if (item.lat && item.lng && map) {
    const zoom = props.config.baseLayer.type === 'custom-canvas' ? 2 : 16;
    map.flyTo([item.lat, item.lng], zoom, { duration: 1.5 });
    if (item.layerRef) item.layerRef.fire('click');
  }
};
const clearAllLayers = () => {
  editableLayers.clearLayers();
  if (tempRectangle) { map.removeLayer(tempRectangle); tempRectangle = null; }
  selectedNode.value = null; activeTool.value = null; rectStartLatLng = null; drawnLayers.value = [];
  saveAllLayers(props.config.toolId, []);
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
      callback(`已定位：${data.geocodes[0].formatted_address}`);
    } else {
      callback('未找到相关地点。');
    }
  } catch (error) { callback('搜索失败，请检查网络。'); }
};

const triggerUpload = (type) => {
  if (type === 'base') baseInputRef.value.click();
  else if (type === 'layer') layerInputRef.value.click();
  else if (type === 'both') bothInputRef.value.click();
};

const handleBaseUpload = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  loadBaseImage(url, file);
  event.target.value = '';
};

const handleLayerUpload = (event) => {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = parseProject(e.target.result);
      if (data.baseImage) {
        loadBaseImage(data.baseImage, null, data.width, data.height);
        setTimeout(() => restoreAnnotations(data.annotations), 500);
      } else { alert("该文件仅包含标注层，请先打开一张底图，再加载标注层！"); }
    } catch (err) { alert(err.message); }
  };
  reader.readAsText(file); event.target.value = '';
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
  reader.readAsText(file); event.target.value = '';
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
        map = L.map(mapContainer.value, { crs: L.CRS.Simple, minZoom: -3, maxZoom: 5, zoomControl: true, attributionControl: false });
        L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);
        const bounds = [[0, 0], [h, w]];
        baseLayer = L.imageOverlay(imageSrc, bounds, { opacity: 1 }).addTo(map);
        map.fitBounds(bounds);
        editableLayers = new L.FeatureGroup();
        map.addLayer(editableLayers);
        bindMapEvents();
        loadHistoricalLayers();
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
  drawnLayers.value = []; selectedNode.value = null; currentBaseImageData = null;
};

const saveData = async (type) => {
  const timestamp = new Date().getTime();
  if (type === 'base') {
    if (!currentBaseImageData) return alert("底图数据不存在！");
    downloadFile(currentBaseImageData, `底图_${timestamp}.png`, 'image/png');
    return;
  }
  const serializedAnnotations = serializeAnnotations(drawnLayers.value);
  if (type === 'layer') {
    const jsonStr = JSON.stringify({ annotations: serializedAnnotations }, null, 2);
    downloadFile(jsonStr, `标注层_${timestamp}.json`);
  } else if (type === 'both') {
    const projectStr = packageProject(currentBaseImageData, currentBaseImageWidth, currentBaseImageHeight, serializedAnnotations);
    downloadFile(projectStr, `底图+标注层_${timestamp}.freemap`);
  }
};

const restoreAnnotations = (annotations) => {
  if (!annotations || !map) return;
  annotations.forEach(item => {
    let layer = null;
    if (item.type === 'polygon') layer = L.polygon(item.coords, item.style).addTo(map);
    else if (item.type === 'polyline') layer = L.polyline(item.coords, item.style).addTo(map);
    else if (item.type === 'rectangle') layer = L.rectangle(item.coords, item.style).addTo(map);
    else if (item.type === 'marker') layer = L.marker(item.coords[0]).addTo(map);
    if (layer) {
      editableLayers.addLayer(layer);
      const uuid = item.id || (Date.now().toString(36) + Math.random().toString(36).substring(2, 9));
      layer.uniqueId = uuid;
      const layerData = {
        id: uuid, toolId: props.config.toolId, title: item.title, type: item.type, lat: item.coords[0][0], lng: item.coords[0][1],
        layerRef: layer, docHtml: item.docHtml, style: item.style,
        objectName: item.objectName || '默认名称',
        fields: item.fields || Array.from({ length: 500 }).map((_, i) => ({ label: `信息的名称${i + 1}`, value: '' }))
      };
      drawnLayers.value.push(layerData);
      layer.on('click', () => {
        const currentData = drawnLayers.value.find(d => d.id === layer.uniqueId);
        if (currentData) {
          selectedNode.value = { ...currentData };
          if (infoPanelRef.value) infoPanelRef.value.selectLayer(currentData);
        }
      });
    }
  });
};
</script>

<style scoped>
.map-wrapper { position: relative; width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; flex: 1; background: #1a1a1a; }
.map-container-div { width: 100%; height: 100%; background: #1a1a1a; }

/* ⚠️ 核心修复：让上传界面绝对覆盖，避免高度塌陷导致的黑屏 */
.upload-container { 
  position: absolute; 
  top: 0; left: 0; right: 0; bottom: 0; 
  z-index: 999; 
  background: #1a1a1a; 
  display: flex; 
  justify-content: center; 
  align-items: center; 
}
.upload-box { background: #fff; padding: 40px 60px; border-radius: 10px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.upload-box h2 { margin-top: 0; color: #333; }
.upload-box p { color: #666; font-size: 14px; }
.upload-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
.action-btn { background: #f0f0f0; color: #333; border: 1px solid #ccc; padding: 8px 16px; font-size: 14px; border-radius: 5px; cursor: pointer; transition: 0.2s; }
.action-btn.primary { background: #1890ff; color: white; border-color: #1890ff; }
.action-btn.primary:hover { background: #40a9ff; }
.action-btn:hover { background: #e0e0e0; }
.upload-hint { font-size: 12px !important; color: #999 !important; margin-top: 15px; }
.custom-toolbar { position: absolute; top: 80px; left: 15px; z-index: 1050; background: white; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; flex-direction: column; padding: 4px; gap: 4px; }
.custom-toolbar button { width: 24px; height: 24px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #333; }
.custom-toolbar button:hover { background: #f0f0f0; }
.custom-toolbar button.active { background: #e6f7ff; color: #1890ff; box-shadow: inset 0 0 0 1px #1890ff; }
.toolbar-divider { margin: 2px 0; border: none; border-top: 1px solid #eee; }
.save-toolbar { position: absolute; bottom: 15px; left: 150px; z-index: 1050; display: flex; gap: 8px; background: rgba(255, 255, 255, 0.9); padding: 5px 10px; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.save-toolbar button { background: #f0f0f0; border: 1px solid #ccc; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; transition: 0.2s; }
.save-toolbar button:hover { background: #e0e0e0; }
</style>