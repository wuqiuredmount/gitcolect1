<!-- src/groups/whiteboard/WhiteboardPanels.vue -->
<!-- 🧩 白板 P0 面板薄包装（对应鹰眼的「图形列表 + 信息栏」完整度） -->
<!--
  职责（仅此两条，不含任何业务逻辑）：
    ① 顶栏内联区：把「图形列表」Teleport 到 GisApp 的 #tool-header-slot（与地图完全一致）
    ② 浮层容器：承载「信息栏」（InfoPanel 自带 MapPanel 浮层定位，沿用默认 left/bottom）

  ⚠️ 为什么不直接 Teleport 原面板（三个已核实的原因）：
    1. InfoPanel.vue 的根节点就是 <MapPanel>（单根），把它 Teleport 到顶栏会变成
       「顶栏里一个 absolute 浮层」而跑位。
    2. GisApp.vue 的 #tool-header-slot 是普通 div（.header-slot { flex:1 }），
       不是浮层容器，塞进去的浮层会被顶栏布局裁剪。
    3. 所以：图形列表 → Teleport 到顶栏（它是 inline-block 下拉，天然适配顶栏）；
       信息栏   → 留在工具内容区内做浮层（与鹰眼「信息栏也是浮层」视觉一致）。

  ⚠️ 本组件不引入 layerScheduler（显示窗口 / 30 秒轮换 / 热点）：
    - 不传 displayIds → LayerListPanel 走「不进入窗口过滤」分支
    - 不传 enableHotspot → 「🔥 热点信息」选项与「🔥 刷新热点」按钮都不渲染
    - 无 setInterval → 不存在轮换
    故必须传 hideWindowHint，避免「当前显示 N 个 · 每 30 秒自动轮换」文案说谎。

  ⚠️ 事件全部原样上抛，不在此处做任何副作用（写库 / 改画布都在 WhiteboardTool 里）。
-->
<template>
  <!-- ① 图形列表 → 顶栏内联（与 BaseMapTool.vue:64 同一挂载点、同一套 props 语义） -->
  <Teleport to="#tool-header-slot">
    <LayerListPanel
      v-if="showLayerList"
      :panel-id="'layerList-' + toolId"
      :layers="layers"
      :groups="groups"
      :hide-window-hint="true"
      @locate="$emit('locate', $event)"
      @add-group="$emit('add-group', $event)"
      @remove-group="$emit('remove-group', $event)"
      @rename-group="$emit('rename-group', $event)"
      @update-layer-group="$emit('update-layer-group', $event)"
      @delete-layer="$emit('delete-layer', $event)"
      @filter-group="$emit('filter-group', $event)"
    />
  </Teleport>

  <!-- ② 信息栏 → 工具内容区内的浮层（MapPanel 自身定位，不传 inline） -->
  <InfoPanel
    v-if="showInfoPanel"
    ref="infoPanelRef"
    :tool-id="toolId"
    :layers="layers"
    @locate="$emit('locate', $event)"
    @update-layer="$emit('update-layer', $event)"
  />
</template>

<script setup>
import { ref } from 'vue';
import LayerListPanel from '../../components/tools/geo/panels/LayerListPanel.vue';
import InfoPanel from '../../components/tools/geo/panels/InfoPanel.vue';

defineProps({
  // 图形列表数据（白板侧由 WhiteboardTool 提供，字段与地图 annotation 同构）
  layers: { type: Array, default: () => [] },
  // 可选分组名数组（PresetGroups 由面板内部补齐，此处只补白板自建分组）
  groups: { type: Array, default: () => [] },
  // 面板 id 前缀（与地图命名规则保持一致，便于 :: 定位 / 调试）
  toolId: { type: String, default: 'wb-whiteboard' },
  // 显隐开关（白板侧恒为 true，保留 prop 便于日后做可见性配置）
  showLayerList: { type: Boolean, default: true },
  showInfoPanel: { type: Boolean, default: true }
});

defineEmits([
  'locate',
  'add-group',
  'remove-group',
  'rename-group',
  'update-layer-group',
  'delete-layer',
  'filter-group',
  'update-layer'
]);

// 🚨 关键：把 InfoPanel 暴露的 selectLayer 原样转出去，
//   让 WhiteboardTool 可以通过本包装的 ref 直接做「画布点选 → 信息栏联动」。
const infoPanelRef = ref(null);
const selectLayer = (layer) => {
  if (infoPanelRef.value && typeof infoPanelRef.value.selectLayer === 'function') {
    infoPanelRef.value.selectLayer(layer);
  }
};

defineExpose({ selectLayer });
</script>
