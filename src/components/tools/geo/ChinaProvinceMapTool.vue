<template>
  <BaseMapTool :config="config" />
</template>

<script setup>
import BaseMapTool from './BaseMapTool.vue';

const config = {
  toolId: 'geo-province-map',
  baseLayer: {
    type: 'local-image',
    url: '/maps/中国地图0003.png',
    bounds: [[3, 73], [55, 135]]
  },
  initialView: { center: [35, 105], zoom: 4 },
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