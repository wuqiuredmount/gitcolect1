<template><BaseMapTool :config="config" /></template>
<script setup>
import BaseMapTool from './BaseMapTool.vue';
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
</script>