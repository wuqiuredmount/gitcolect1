<template>
  <!-- 🚨 核心：把 fileId 传递给 BaseMapTool -->
  <BaseMapTool ref="baseMapToolRef" :config="config" :file-id="fileId" />
</template>

<script setup>
import { ref } from 'vue';
import BaseMapTool from './BaseMapTool.vue';

// 🚨 核心：接收父组件传来的 fileId
const props = defineProps({
  fileId: { type: String, default: 'legacy-file' }
});

const baseMapToolRef = ref(null);

const config = {
  toolId: 'geo-china-map',
  baseLayer: {
    type: 'amap-satellite',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
  },
  initialView: { center: [39.0123, 117.3456], zoom: 15 },
  visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true }
};

defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>