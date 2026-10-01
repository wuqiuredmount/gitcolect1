<template>
  <!-- 关键：去掉了 @click，完全依赖脚本中的 mouseup 判断 -->
  <div 
    class="map-panel" 
    :class="{ collapsed: !isExpanded }"
    ref="panelRef"
    @mousedown="startDrag"
  >
    <div class="panel-header">
      <span>{{ title }}</span>
      <span class="toggle-icon">{{ isExpanded ? '▼' : '▶' }}</span>
    </div>
    <div v-show="isExpanded" class="panel-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  initialTop: { type: Number, default: 15 },
  initialRight: { type: Number, default: 15 }
});

const isExpanded = ref(true);
const panelRef = ref(null);

const startDrag = (e) => {
  if (!e.target.closest('.panel-header')) return;

  const panel = panelRef.value;
  const rect = panel.getBoundingClientRect();

  const startX = e.clientX;
  const startY = e.clientY;
  const initLeft = rect.left;
  const initTop = rect.top;
  let isDragging = false;

  panel.style.position = 'fixed';
  panel.style.left = rect.left + 'px';
  panel.style.top = rect.top + 'px';
  panel.style.right = 'auto';
  panel.style.marginBottom = '0';

  const onMouseMove = (moveEvent) => {
    if (!isDragging) {
      if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
        isDragging = true;
      }
    }
    if (isDragging) {
      panel.style.left = (initLeft + moveEvent.clientX - startX) + 'px';
      panel.style.top = (initTop + moveEvent.clientY - startY) + 'px';
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // 如果没有发生拖拽（移动距离小于3像素），则视为点击，触发折叠
    if (!isDragging) {
      isExpanded.value = !isExpanded.value;
    }
    isDragging = false;
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};
</script>

<style scoped>
.map-panel {
  position: absolute;
  right: 15px;
  top: v-bind('initialTop + "px"'); /* 核心：接收初始高度 */
  z-index: 1050;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 5px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  width: max-content;
  min-width: 80px;
  max-width: 200px;
  user-select: none;
  overflow: hidden;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  cursor: move;
  font-weight: bold;
  font-size: 10px;
  color: #333;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  min-width: 60px;
}
.toggle-icon { font-size: 9px; color: #666; margin-left: 5px; }
.panel-body { padding: 6px 10px; white-space: nowrap; }
.collapsed .panel-body { display: none; }
.collapsed .panel-header { border-bottom: none; border-radius: 5px; }
</style>