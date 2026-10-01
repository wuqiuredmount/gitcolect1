<template>
  <MapPanel :title="`📋 图形列表 (${layers.length})`" :initialTop="130">
    <ul v-if="layers.length > 0" class="layer-list">
      <li v-for="item in layers" :key="item.id" @dblclick="$emit('locate', item)" title="双击定位">
        <span class="layer-title">{{ item.title }}</span>
        <span class="layer-type">{{ item.type }}</span>
      </li>
    </ul>
    <div v-else class="empty-list">暂无图形</div>
  </MapPanel>
</template>

<script setup>
import MapPanel from './MapPanel.vue';
defineProps({ layers: { type: Array, default: () => [] } });
defineEmits(['locate']);
</script>

<style scoped>
.layer-list { list-style: none; margin: 0; padding: 0; max-height: 150px; overflow-y: auto; }
.layer-list li { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 10px; transition: background 0.2s; }
.layer-list li:hover { background: #e6f7ff; }
.layer-title { flex: 1; font-weight: bold; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px; }
.layer-type { width: 30px; color: #888; text-align: right; margin-left: 5px; }
.empty-list { padding: 8px; text-align: center; color: #999; font-size: 10px; white-space: nowrap; }
</style>