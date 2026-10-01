<template>
  <div class="map-wrapper">
    <!-- 1. 初始状态：上传/加载界面 -->
    <div v-if="!isImageLoaded" class="upload-container">
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

    <!-- 2. 已加载图片：显示画布和工具 -->
    <template v-else>
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
        <hr class="toolbar-divider">
        <button @click="resetImage" title="重新选择图片">🖼️</button>
      </div>

      <!-- 1. 图形列表 -->
      <LayerListPanel 
        :layers="drawnLayers" 
        @locate="flyToLayer" 
      />
      
      <!-- 2. 图层透明度 (仅底图) -->
      <OpacityPanel :baseOpacity="baseOpacity" :showAnno="false" @update:base="updateBaseOpacity" />

      <!-- 3. 信息栏 -->
      <InfoPanel 
        ref="infoPanelRef"
        :layers="drawnLayers" 
        @locate="flyToLayer" 
        @update-layer="handleLayerUpdate" 
      />

      <!-- 保存栏 -->
      <div class="save-toolbar">
        <button @click="saveData('base')">💾 保存底图</button>
        <button @click="saveData('layer')">💾 保存标注层</button>
        <button @click="saveData('both')">📦 保存底图+标注层</button>
      </div>

      <MarkerDocPanel 
        v-if="selectedNode"
        :node="selectedNode"
        @close="selectedNode = null"
        @update:title="handleNodeTitleUpdate"
        @update:content="val => selectedNode.docHtml = val"
        @update:style="val => updateNodeStyle(val)"
      />
    </template>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

import { zhCN_DrawLocal, drawStyles } from '../../../groups/geo/drawConfig.js';
import { downloadFile, fileToBase64, serializeAnnotations, packageProject, parseProject } from '../../../groups/geo/utils/fileManager.js';
import MarkerDocPanel from './panels/MarkerDocPanel.vue';
import LayerListPanel from './panels/LayerListPanel.vue';
import OpacityPanel from './panels/OpacityPanel.vue';
import InfoPanel from './panels/InfoPanel.vue';

L.drawLocal = zhCN_DrawLocal;

let map = null;
let editableLayers = null;
let baseLayer = null;
let currentDrawHandler = null;
let tempRectangle = null;
let rectStartLatLng = null;
let resizeObserver = null;

const mapContainer = ref(null);
const baseInputRef = ref(null);
const layerInputRef = ref(null);
const bothInputRef = ref(null);

const infoPanelRef = ref(null); 
const selectedNode = ref(null);
const baseOpacity = ref(1);
const activeTool = ref(null);
const drawnLayers = ref([]);
const isImageLoaded = ref(false);

let currentBaseImageData = null;
let currentBaseImageWidth = 0;
let currentBaseImageHeight = 0;

// ================= 上传 =================
const triggerUpload = (type) => {
  if (type === 'base') baseInputRef.value.click();
  else if (type === 'layer') layerInputRef.value.click();
  else if (type === 'both') bothInputRef.value.click();
};

const handleBaseUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadBaseImage(url, file);
  event.target.value = '';
};

const handleLayerUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = parseProject(e.target.result);
      if (data.baseImage) {
        loadBaseImage(data.baseImage, null, data.width, data.height);
        setTimeout(() => restoreAnnotations(data.annotations), 500);
      } else {
        alert("该文件仅包含标注层，请先打开一张底图，再加载标注层！");
      }
    } catch (err) {
      alert(err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

const handleBothUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = parseProject(e.target.result);
      if (!data.baseImage) {
        alert("文件格式错误，未找到底图数据！");
        return;
      }
      loadBaseImage(data.baseImage, null, data.width, data.height);
      setTimeout(() => restoreAnnotations(data.annotations), 500);
    } catch (err) {
      alert(err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

// ================= 加载底图 =================
const loadBaseImage = async (imageSrc, fileObj = null, width = 0, height = 0) => {
  const img = new Image();
  img.onload = async () => {
    const w = width || img.naturalWidth;
    const h = height || img.naturalHeight;
    
    currentBaseImageWidth = w;
    currentBaseImageHeight = h;

    if (fileObj) {
      currentBaseImageData = await fileToBase64(fileObj);
    } else {
      currentBaseImageData = imageSrc;
    }

    isImageLoaded.value = true;
    setTimeout(() => {
      initMap(imageSrc, w, h);
    }, 100);
  };
  img.src = imageSrc;
};

const initMap = (imageUrl, width, height) => {
  if (!mapContainer.value) return;
  if (map) { map.remove(); }

  map = L.map(mapContainer.value, {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 5,
    zoomControl: true,
    attributionControl: false
  });

  L.DomEvent.on(mapContainer.value, 'contextmenu', L.DomEvent.preventDefault);

  const bounds = [[0, 0], [height, width]];
  baseLayer = L.imageOverlay(imageUrl, bounds, { opacity: 1 }).addTo(map);
  map.fitBounds(bounds);

  editableLayers = new L.FeatureGroup();
  map.addLayer(editableLayers);
  bindMapEvents();

  resizeObserver = new ResizeObserver(() => { if (map) map.invalidateSize(); });
  resizeObserver.observe(mapContainer.value);
  document.addEventListener('fullscreenchange', handleResize);
};

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

const resetImage = () => {
  if (map) { map.remove(); map = null; }
  isImageLoaded.value = false;
  drawnLayers.value = [];
  selectedNode.value = null;
  currentBaseImageData = null;
};

// ================= 保存与恢复 =================
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
      const layerData = {
        id: layer._leaflet_id, title: item.title, type: item.type, lat: item.coords[0][0], lng: item.coords[0][1],
        layerRef: layer, docHtml: item.docHtml, style: item.style,
        objectName: item.objectName || '默认名称',
        fields: item.fields || Array.from({ length: 500 }).map((_, i) => ({ label: `信息的名称${i + 1}`, value: '' }))
      };
      drawnLayers.value.push(layerData);
      layer.on('click', () => { 
        selectedNode.value = { ...layerData }; 
        if (infoPanelRef.value) infoPanelRef.value.selectLayer(layerData);
      });
    }
  });
};

// ================= 绘图逻辑 =================
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
    if (infoPanelRef.value) infoPanelRef.value.selectLayer(layerData);
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
    map.flyTo([item.lat, item.lng], 2, { duration: 1.5 });
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
.map-wrapper { position: relative; width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; flex: 1; background: #1a1a1a; }
.upload-container { display: flex; justify-content: center; align-items: center; height: 100%; width: 100%; }
.upload-box { background: #fff; padding: 40px 60px; border-radius: 10px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.upload-box h2 { margin-top: 0; color: #333; }
.upload-box p { color: #666; font-size: 14px; }
.upload-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
.action-btn { background: #f0f0f0; color: #333; border: 1px solid #ccc; padding: 8px 16px; font-size: 14px; border-radius: 5px; cursor: pointer; transition: 0.2s; }
.action-btn.primary { background: #1890ff; color: white; border-color: #1890ff; }
.action-btn.primary:hover { background: #40a9ff; }
.action-btn:hover { background: #e0e0e0; }
.upload-hint { font-size: 12px !important; color: #999 !important; margin-top: 15px; }
.map-container-div { width: 100%; height: 100%; background: #1a1a1a; }
.custom-toolbar { position: absolute; top: 80px; left: 15px; z-index: 1050; background: white; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; flex-direction: column; padding: 4px; gap: 4px; }
.custom-toolbar button { width: 24px; height: 24px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #333; }
.custom-toolbar button:hover { background: #f0f0f0; }
.custom-toolbar button.active { background: #e6f7ff; color: #1890ff; box-shadow: inset 0 0 0 1px #1890ff; }
.toolbar-divider { margin: 2px 0; border: none; border-top: 1px solid #eee; }
.save-toolbar { position: absolute; bottom: 15px; left: 150px; z-index: 1050; display: flex; gap: 8px; background: rgba(255, 255, 255, 0.9); padding: 5px 10px; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.save-toolbar button { background: #f0f0f0; border: 1px solid #ccc; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; transition: 0.2s; }
.save-toolbar button:hover { background: #e0e0e0; }
</style>