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
// 🚨【防御层 3b】watch 在 api 未就绪时不再直接 return（旧代码会永久丢弃这次变更），
//   改为打标记，等 onApiReady 里补执行。
let sceneDirty = false;

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
      // 🚨【防御层 3b】无条件把 initialScene 灌进画布。
      //   理由：父组件可能在画布创建之后才拿到 scene（异步读库），
      //   或 initialScene 在挂载时仍是空数组。此处以「权威数据」姿态重放一次，
      //   保证画布里一定是 props.initialScene 对应的场景，不残留空场景快照。
      applyScene(api, props.initialScene, props.initialAppState);
      // 补执行：api 就绪前被 watch 拦下的场景替换请求
      if (sceneDirty) {
        sceneDirty = false;
        applyScene(api, props.initialScene, props.initialAppState);
      }
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
// 🚨【防御层 3b】旧代码 `if (!api) return` 在 api 尚未就绪时会把这次变更永久丢弃，
//   首帧救不回。现改为打 dirty 标记，由 onApiReady 补执行。
watch(() => props.initialScene, (next, prev) => {
  if (next === prev) return;
  if (!api) {
    sceneDirty = true;
    return;
  }
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
