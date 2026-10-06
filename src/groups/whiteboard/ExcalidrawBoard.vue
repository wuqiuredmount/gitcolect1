<!-- src/groups/whiteboard/ExcalidrawBoard.vue -->
<!-- 🖊️ Excalidraw 画布宿主（纯 VUE 包装层，不含业务逻辑） -->
<!-- 职责：挂载 / 卸载 React root，向上抛出场景变化与 imperative API -->
<template>
  <div ref="host" class="excalidraw-host"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { mountExcalidraw, captureScene, applyScene, sanitizeElements } from './utils/excalidrawBridge.js';

const props = defineProps({
  // 初始场景（仅首次挂载时生效，之后由画布自己维护）
  initialScene: { type: Array, default: () => [] },
  initialAppState: { type: Object, default: () => ({}) },
  // UIOptions 透传，默认精简掉本项目用不到的入口
  uiOptions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['change', 'api-ready']);

const host = ref(null);
let instance = null;
let api = null;

onMounted(() => {
  if (!host.value) return;
  instance = mountExcalidraw(host.value, {
    initialData: {
      elements: sanitizeElements(props.initialScene),
      appState: props.initialAppState || {}
    },
    uiOptions: props.uiOptions,
    onApiReady: (nextApi) => {
      api = nextApi;
      emit('api-ready', nextApi);
    },
    onChange: (elements, appState) => {
      emit('change', elements, appState);
    }
  });
});

onBeforeUnmount(() => {
  api = null;
  if (instance) {
    instance.unmount();
    instance = null;
  }
});

// 外部需要「当前画布内容」时调用（保存 / 切页兜底）
const getScene = () => {
  const scene = captureScene(api);
  return { scene: scene.elements, appState: scene.appState };
};

// 外部需要用新数据整体替换画布时调用（切换白板 / 恢复备份）
const setScene = (elements, appState) => {
  applyScene(api, elements, appState);
};

// 手动聚焦到某个元素（信息栏点击定位用）
const scrollToElement = (elementId) => {
  if (!api || typeof api.getSceneElements !== 'function') return;
  const el = api.getSceneElements().find(e => e && e.id === elementId);
  if (!el || typeof api.scrollToContent !== 'function') return;
  try {
    api.scrollToContent(el, { fitToViewport: true, animate: true });
  } catch (e) {
    console.warn('[ExcalidrawBoard] 定位元素失败:', e);
  }
};

// 监听初始场景被外部替换（例如切换白板时）→ 整体刷新画布
watch(() => props.initialScene, (next, prev) => {
  if (!api) return;
  if (next === prev) return;
  applyScene(api, next, props.initialAppState);
}, { deep: false });

defineExpose({
  getScene,
  setScene,
  scrollToElement,
  getApi: () => api
});
</script>

<style scoped>
/* 🚨 必须是非零高度，否则 Excalidraw 画布空白（官方已知坑） */
.excalidraw-host {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
}
</style>
