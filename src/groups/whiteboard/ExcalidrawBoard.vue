<!-- src/groups/whiteboard/ExcalidrawBoard.vue -->
<!-- 🖊️ Excalidraw 画布宿主（纯 VUE 包装层，不含业务逻辑） -->
<!-- 职责：挂载 / 卸载 React root，向上抛出场景变化与 imperative API -->
<template>
  <div ref="host" class="excalidraw-host"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { mountExcalidraw, captureScene, applyScene, sanitizeElements } from './utils/excalidrawBridge.js';
import { filterBrokenElements } from './utils/elementSync.js';

const props = defineProps({
  // 初始场景（仅首次挂载时生效，之后由画布自己维护）
  initialScene: { type: Array, default: () => [] },
  initialAppState: { type: Object, default: () => ({}) },
  // UIOptions 透传，默认精简掉本项目用不到的入口
  uiOptions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['change', 'api-ready', 'selection-change']);

const host = ref(null);
let instance = null;
let api = null;
// 🚨【防御层 3b】watch 在 api 未就绪时不再直接 return（旧代码会永久丢弃这次变更），
//   改为打标记，等 onApiReady 里补执行。
let sceneDirty = false;
// 🚨【P1-B 新增】上一次抛出的选中集合签名（见 onChange 内注释）。
//   为什么用「签名比对」而不是深比较数组：onChange 每次拖拽都会触发，
//   而 appState.selectedElementIds 的对象引用每次都是新的 →
//   直接比较引用必然不等 → 会陷入「每帧都 emit」的性能坑。
let lastSelectionSig = null;

/**
 * 🛡️【C 方案 · 最后一道防线】把任意来源的元素数组净化成「可安全渲染」的数组。
 *   两道关卡串联，顺序不可颠倒：
 *     ① filterBrokenElements —— 按 type 校验必需字段，剔除残缺元素（防渲染崩溃）
 *     ② sanitizeElements    —— 字段级序列化容错（防 IndexedDB DataCloneError）
 *   之所以放在**本组件内**（而非只在 WhiteboardTool），是因为这里是
 *   `initialData.elements` 与 `updateScene({elements})` 的**唯一出口** ——
 *   无论上游哪条路径漏了校验，都拦得住（既含 props.initialScene，
 *   也含 watch 触发的 setScene / applyScene）。
 * @param {Array} elements - 任意来源的元素数组
 * @returns {Array} 可安全渲染的元素数组
 */
const toSafeElements = (elements) => {
  const { safe, dropped } = filterBrokenElements(elements);
  if (dropped.length > 0) {
    // ⚠️ console.warn（非 debug）：护住画布的安全哨兵，必须可见
    console.warn(`[ExcalidrawBoard] 🛡️ 已隔离 ${dropped.length} 个残缺元素（防渲染崩溃）：`);
    dropped.forEach(d => {
      console.warn(`[ExcalidrawBoard]   - id=${d.id} type=${d.type} 缺字段=[${d.missing.join(', ')}]`);
    });
  }
  return sanitizeElements(safe);
};

onMounted(() => {
  if (!host.value) return;
  instance = mountExcalidraw(host.value, {
    initialData: {
      elements: toSafeElements(props.initialScene),
      appState: props.initialAppState || {}
    },
    uiOptions: props.uiOptions,
    onApiReady: (nextApi) => {
      api = nextApi;
      // 🚨【防御层 3b】无条件把 initialScene 灌进画布。
      //   理由：父组件可能在画布创建之后才拿到 scene（异步读库），
      //   或 initialScene 在挂载时仍是空数组。此处以「权威数据」姿态重放一次，
      //   保证画布里一定是 props.initialScene 对应的场景，不残留空场景快照。
      applyScene(api, toSafeElements(props.initialScene), props.initialAppState);
      // 补执行：api 就绪前被 watch 拦下的场景替换请求
      if (sceneDirty) {
        sceneDirty = false;
        applyScene(api, toSafeElements(props.initialScene), props.initialAppState);
      }
      emit('api-ready', nextApi);
    },
    onChange: (elements, appState) => {
      emit('change', elements, appState);
      // 🚨【P1-B 新增】选中集合变化 → 向上抛 id 数组。
      //   来源：appState.selectedElementIds 形如 { 'elId': true, 'elId2': false }
      //   ⇒ 只取值为 true 的键（Excalidraw 会保留取消选中的键，值置 false 而非删除）。
      //   ⚠️ 用「join 成签名再比对」做去重：onChange 在拖拽/绘制期间高频触发，
      //      选中集合没变时必须**不 emit**，否则下游面板会被反复重挂（内容闪烁 + 丢焦点）。
      //      不用直接比较数组引用 —— appState 每次都是新对象，引用必然不等，等于没去重。
      //      （不排序：Excalidraw 的 selectedElementIds 键序稳定，同一集合得到同一签名。）
      const sel = (appState && appState.selectedElementIds) || {};
      const ids = Object.keys(sel).filter(k => sel[k]);
      const sig = ids.join('|');
      if (sig === lastSelectionSig) return;
      lastSelectionSig = sig;
      emit('selection-change', ids);
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
  // 🛡️【C 方案】出口统一净化（setScene 是外部直接注入元素的入口）
  applyScene(api, toSafeElements(elements), appState);
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
  applyScene(api, toSafeElements(next), props.initialAppState);
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
