<template><BaseMapTool :config="config" /></template>
<script setup>
import BaseMapTool from './BaseMapTool.vue';
const config = {
  toolId: 'geo-world-map',
  baseLayer: {
    type: 'esri-world',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    annoUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
  },
  initialView: { center: [30, 0], zoom: 3 },
  visibleTools: { zoomControl: true, drawToolbar: true, markerDocPanel: true, locatingPanel: true, opacityPanel: true, layerListPanel: true, infoPanel: true }
};
</script>