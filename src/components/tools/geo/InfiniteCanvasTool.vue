<template>
  <BaseMapTool ref="baseMapToolRef" :config="config" />
</template>

<script setup>
import { ref } from 'vue';
import BaseMapTool from './BaseMapTool.vue';

const baseMapToolRef = ref(null);

const config = {
  toolId: 'geo-infinite-canvas', // 唯一标识，确保该工具拥有独立的数据空间和文件库存
  baseLayer: { type: 'infinite-white' }, // 核心：声明底图类型为无限白色画布
  initialView: { center: [0, 0], zoom: 0 }, // 默认中心点为坐标系原点
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

// 向 App.vue 暴露底层的核心能力（保存/加载工程）
defineExpose({
  getProjectData: () => baseMapToolRef.value?.getProjectData(),
  loadProjectData: (data) => baseMapToolRef.value?.loadProjectData(data),
  saveProjectToInventory: (name) => baseMapToolRef.value?.saveProjectToInventory(name)
});
</script>