<template>
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
  initialBottom: { type: Number, default: 15 },
  initialLeft: { type: Number, default: 60 },
  // ✨ 新增：是否默认折叠
  initialCollapsed: { type: Boolean, default: false }
});

// ✨ 核心修改：如果传入了初始折叠，则默认是折叠状态
const isExpanded = ref(!props.initialCollapsed);
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
  panel.style.bottom = 'auto';
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
  left: v-bind('initialLeft + "px"');
  bottom: v-bind('initialBottom + "px"');
  z-index: 1050;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 5px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  width: max-content;
  min-width: 80px;
  max-width: 350px; /* 稍微放宽一点 */
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