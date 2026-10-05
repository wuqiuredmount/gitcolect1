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
  toolId: 'geo-province-map',
  baseLayer: { type: 'local-image', url: '/maps/中国地图0003.png', bounds: [[3, 73], [55, 135]] },
  initialView: { center: [35, 105], zoom: 4 },
  visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true }
};

defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>