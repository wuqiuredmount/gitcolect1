<template>
  <BaseMapTool ref="baseMapToolRef" :config="config" :file-id="fileId" />
</template>

<script setup>
import { ref } from 'vue';
import BaseMapTool from './BaseMapTool.vue';

const props = defineProps({
  fileId: { type: String, default: 'legacy-file' } // 🚨 接收文件编号
});

const baseMapToolRef = ref(null);

const config = {
  toolId: 'geo-world-map',
  baseLayer: {
    type: 'amap-satellite',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
  },
  initialView: { center: [30, 0], zoom: 3 },
  visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true }
};

defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>