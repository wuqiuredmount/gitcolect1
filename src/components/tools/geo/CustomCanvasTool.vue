<template>
  <BaseMapTool :config="config" />
</template>

<script setup>
import BaseMapTool from './BaseMapTool.vue';

const config = {
  toolId: 'geo-custom-canvas',
  baseLayer: { type: 'custom-canvas' },
  initialView: { center: [0, 0], zoom: 1 },
  visibleTools: {
    zoomControl: true,
    drawToolbar: true,
    markerDocPanel: true,
    locatingPanel: true, // ✨ 恢复定位查找
    opacityPanel: true,
    layerListPanel: true,
    infoPanel: true
  }
};
</script>