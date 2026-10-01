<template>
  <MapPanel title="🎨 图层透明度" :initialBottom="15">
    <div class="controls-body">
      <label>底图 <input type="range" min="0" max="1" step="0.1" :value="baseOpacity" @input="$emit('update:base', parseFloat($event.target.value))"></label>
      <label v-if="showAnno">注记 <input type="range" min="0" max="1" step="0.1" :value="annoOpacity" @input="$emit('update:anno', parseFloat($event.target.value))"></label>
    </div>
  </MapPanel>
</template>

<script setup>
import MapPanel from './MapPanel.vue';

defineProps({
  baseOpacity: { type: Number, default: 1 },
  annoOpacity: { type: Number, default: 1 },
  showAnno: { type: Boolean, default: true } 
});

defineEmits(['update:base', 'update:anno']);
</script>

<style scoped>
.controls-body { display: flex; flex-direction: column; gap: 5px; white-space: nowrap; }
.controls-body label { display: flex; align-items: center; justify-content: space-between; gap: 5px; font-size: 10px; }
.controls-body input[type="range"] { width: 60px; }
</style>