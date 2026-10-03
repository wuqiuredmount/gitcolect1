<template>
  <BaseMapTool ref="baseMapToolRef" :config="config" />
</template>

<script setup>
import { ref } from 'vue';
import BaseMapTool from './BaseMapTool.vue';

const baseMapToolRef = ref(null);

const config = {
  toolId: 'geo-custom-canvas',
  baseLayer: { type: 'custom-canvas' },
  initialView: { center: [0, 0], zoom: 1 },
  visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true }
};

defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>