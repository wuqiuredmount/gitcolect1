<template>
  <div class="app-container">
    <header class="title-bar">
      <div class="title">多功能软件集成APP</div>
      <div class="window-controls">
        <button>—</button><button>□</button><button>×</button>
      </div>
    </header>

    <main class="content-area">
      <template v-if="!currentTool">
        <div class="group-selector">
          <button v-for="group in groups" :key="group.id" :class="{ active: currentGroupId === group.id }" @click="currentGroupId = group.id">
            {{ group.name }}
          </button>
        </div>
        <div class="tool-grid">
          <div v-for="tool in currentGroupTools" :key="tool.id" class="tool-card" @click="openTool(tool)">
            {{ tool.name }}
          </div>
        </div>
      </template>
      
      <div v-else class="active-tool">
        <div class="active-tool-header">
          <span class="active-tool-name">{{ currentTool.name }}</span>
          <button class="back-btn" @click="currentTool = null">← 返回工具箱</button>
        </div>
        <div class="tool-content">
          <component :is="currentTool.component" />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, shallowRef, markRaw, computed } from 'vue';
import ChinaMapTool from './components/tools/geo/ChinaMapTool.vue';

const currentTool = shallowRef(null);
const currentGroupId = ref('geo'); 

const groups = ref([
  {
    id: 'geo',
    name: '🗺️ 地理信息',
    tools: [
      { id: 'map', name: '世界卫星地图', component: markRaw(ChinaMapTool) },
      ...Array.from({ length: 5 }).map((_, i) => ({ id: `geo-ph-${i}`, name: '工具', component: null }))
    ]
  },
  {
    id: 'card',
    name: '🎴 卡牌游戏',
    tools: [
      ...Array.from({ length: 6 }).map((_, i) => ({ id: `card-ph-${i}`, name: '工具', component: null }))
    ]
  }
]);

const currentGroupTools = computed(() => {
  const group = groups.value.find(g => g.id === currentGroupId.value);
  return group ? group.tools : [];
});

const openTool = (tool) => {
  if (tool.component) {
    currentTool.value = tool;
  }
};
</script>

<style scoped>
.app-container { display: flex; flex-direction: column; height: 100vh; background: #f0f0f0; font-family: sans-serif; margin: 0; }
.title-bar { display: flex; justify-content: space-between; padding: 10px; background: #fff; border-bottom: 1px solid #ccc; font-size: 16px; }
.window-controls button { margin-left: 5px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 14px; }
.content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.group-selector { display: flex; background: #fff; border-bottom: 1px solid #ccc; padding: 0 10px; }
.group-selector button { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 14px; font-weight: bold; color: #666; border-bottom: 2px solid transparent; transition: 0.2s; }
.group-selector button:hover { background: #f5f5f5; }
.group-selector button.active { color: #1890ff; border-bottom-color: #1890ff; }
.tool-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; background: #ccc; padding: 1px; flex: 1; overflow: auto; }
.tool-card { background: #fff; height: 80px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; font-size: 14px; }
.tool-card:hover { background: #e6f7ff; }
.active-tool { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.active-tool-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 15px; background: #fff; border-bottom: 1px solid #ccc; }
.active-tool-name { font-weight: bold; font-size: 15px; color: #333; }
.back-btn { padding: 5px 10px; cursor: pointer; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; }
.back-btn:hover { background: #e0e0e0; }
.tool-content { flex: 1; position: relative; overflow: hidden; }
</style>