<template>
  <!-- 🚨 绑定 ref 以暴露底层能力，并传递 fileId -->
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
  toolId: 'geo-china-standard-map',
  baseLayer: {
    // 保持原有的高德标准矢量地图（style=7）
    type: 'amap-standard',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}',
    // 保持原有的注记图层（style=8）
    annoUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
  },
  initialView: { center: [39.0123, 117.3456], zoom: 15 },
  visibleTools: {
    zoomControl: true,
    drawToolbar: true,
    markerDocPanel: true,
    locatingPanel: true,
    opacityPanel: true,
    layerListPanel: true,
    infoPanel: true
  }
};

// 🚨 核心修改：将底层引擎方法暴露给 App.vue（文件库存）
defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>