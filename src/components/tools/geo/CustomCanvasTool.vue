<template>
  <BaseMapTool ref="baseMapToolRef" :config="config" :is-loading-project="isLoadingProject" :file-id="fileId" />
</template>

<script setup>
import { ref } from 'vue';
import BaseMapTool from './BaseMapTool.vue';

const props = defineProps({
  isLoadingProject: { type: Boolean, default: false },
  fileId: { type: String, default: 'legacy-file' } // 🚨 接收文件编号
});

const baseMapToolRef = ref(null);

const config = {
  toolId: 'geo-custom-canvas',
  baseLayer: { type: 'custom-canvas' },
  initialView: { center: [0, 0], zoom: 1 },
  visibleTools: { zoomControl: true, drawToolbar: true,
  markerDocPanel: true, locatingPanel: true, opacityPanel: true,
  layerListPanel: true, infoPanel: true }
};

defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>