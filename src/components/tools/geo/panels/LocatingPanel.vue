<template>
  <MapPanel title="🔍 定位查找" :initialBottom="260">
    <div class="locating-body">
      <div class="search-box">
        <input type="text" v-model="searchQuery" @keyup.enter="emitSearch" placeholder="输入地名" />
        <button @click="emitSearch" :disabled="isSearching">{{ isSearching ? '...' : '搜索' }}</button>
      </div>
      <p v-if="searchMessage" class="search-msg">{{ searchMessage }}</p>
    </div>
  </MapPanel>
</template>

<script setup>
import { ref } from 'vue';
import MapPanel from './MapPanel.vue';

const searchQuery = ref('');
const isSearching = ref(false);
const searchMessage = ref('');
const emit = defineEmits(['search']);

const emitSearch = () => {
  if (!searchQuery.value.trim()) return;
  emit('search', searchQuery.value, (msg) => { searchMessage.value = msg; });
};
</script>

<style scoped>
.locating-body { display: flex; flex-direction: column; gap: 5px; }
.search-box { display: flex; gap: 4px; }
.search-box input { width: 90px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px; font-size: 10px; outline: none; }
.search-box input:focus { border-color: #1890ff; }
.search-box button { padding: 4px 8px; background: #1890ff; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 10px; }
.search-box button:disabled { background: #aaa; }
.search-msg { font-size: 9px; color: #666; margin: 0; white-space: normal; max-width: 120px; line-height: 1.4; }
</style>