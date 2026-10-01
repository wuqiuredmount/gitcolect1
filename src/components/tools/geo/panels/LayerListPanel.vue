<template>
  <MapPanel :title="`📋 图形列表 (${layers.length})`" :initialBottom="150" :initialCollapsed="true">
    <div class="list-container">
      <div class="search-box">
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="输入名称检索..." 
          class="search-input"
        />
      </div>

      <ul v-if="filteredLayers.length > 0" class="layer-list">
        <li v-for="item in filteredLayers" :key="item.id" @dblclick="$emit('locate', item)" title="双击定位">
          <span class="layer-title">{{ item.title }}</span>
          <span class="layer-type">{{ item.type }}</span>
        </li>
      </ul>
      
      <div v-else-if="layers.length === 0" class="empty-list">暂无图形</div>
      <div v-else class="empty-list">未找到匹配元素</div>
    </div>
  </MapPanel>
</template>

<script setup>
import { ref, computed } from 'vue';
import MapPanel from './MapPanel.vue';

const props = defineProps({ 
  layers: { type: Array, default: () => [] } 
});
defineEmits(['locate']);

const searchQuery = ref('');

const filteredLayers = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.layers;
  }
  const query = searchQuery.value.trim().toLowerCase();
  return props.layers.filter(item => 
    item.title && item.title.toLowerCase().includes(query)
  );
});
</script>

<style scoped>
.list-container { display: flex; flex-direction: column; width: 200px; }
.search-box { padding: 5px 8px; border-bottom: 1px solid #eee; }
.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  font-size: 10px;
  border: 1px solid #ccc;
  border-radius: 3px;
  outline: none;
}
.search-input:focus { border-color: #1890ff; }
.layer-list { list-style: none; margin: 0; padding: 0; max-height: 150px; overflow-y: auto; }
.layer-list li { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 10px; transition: background 0.2s; }
.layer-list li:hover { background: #e6f7ff; }
.layer-title { flex: 1; font-weight: bold; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px; }
.layer-type { width: 30px; color: #888; text-align: right; margin-left: 5px; }
.empty-list { padding: 8px; text-align: center; color: #999; font-size: 10px; white-space: nowrap; }
</style>