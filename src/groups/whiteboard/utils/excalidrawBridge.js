// src/groups/whiteboard/utils/excalidrawBridge.js
// 🖊️ Vue ↔ React 桥接层（路线 A：Vue 组件内挂载 React root）
//
// 依据 .agents/references/excalidraw-vue-integration.md：
//   - onMounted：container 用 react-dom/client 的 createRoot 渲染 <Excalidraw />
//   - onBeforeUnmount：root.unmount() 并清空容器，避免内存泄漏
//   - onExcalidrawAPI：拿 imperative API，暴露给 Vue 侧调用
//   - 必须引入 @excalidraw/excalidraw/index.css，容器必须有非零高度
//
// 约束：本文件不做任何持久化，持久化由 WhiteboardTool.vue + boardStore/elementSync 负责。

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// 画布状态白名单：只持久化这些字段。
// Excalidraw 的 appState 里含大量 UI 瞬态（collaborators、resizingElement 等），
// 若全量 JSON 化会带上不可序列化对象，导致 IndexedDB 写入失败（DataCloneError）。
export const APP_STATE_WHITELIST = [
  'viewBackgroundColor',
  'gridSize',
  'zenModeEnabled',
  'gridModeEnabled',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemArrowType',
  'currentItemRoundness',
  'scrollX',
  'scrollY',
  'zoom'
];

// 从 Excalidraw 的 appState 中抽取可安全持久化的子集
export const pickAppState = (appState) => {
  const picked = {};
  if (!appState || typeof appState !== 'object') return picked;
  APP_STATE_WHITELIST.forEach(key => {
    const v = appState[key];
    const t = typeof v;
    if (v === null || t === 'string' || t === 'number' || t === 'boolean') {
      picked[key] = v;
    }
  });
  return picked;
};

// 元素净化：剔除不可 JSON 序列化的字段，返回纯数据数组
export const sanitizeElements = (elements) => {
  const list = Array.isArray(elements) ? elements : [];
  const out = [];
  list.forEach(el => {
    if (!el || typeof el !== 'object' || !el.id) return;
    try {
      out.push(JSON.parse(JSON.stringify(el)));
    } catch (e) {
      // 含循环引用 / 非纯数据 → 丢弃该元素（不阻塞其他元素保存）
      console.warn('[excalidrawBridge] 元素无法序列化，已跳过:', el.id, e);
    }
  });
  return out;
};

/**
 * 挂载 Excalidraw 到一个 DOM 容器
 * @param {HTMLElement} container - 必须有非零高度
 * @param {object} opts
 * @param {object} [opts.initialData]  - { elements, appState }
 * @param {Function} [opts.onChange]   - (elements, appState, files) => void
 * @param {Function} [opts.onApiReady] - (api) => void，拿到 imperative API
 * @param {object} [opts.uiOptions]    - UIOptions 透传
 * @returns {{ unmount: Function }}
 */
export const mountExcalidraw = (container, opts = {}) => {
  if (!container) throw new Error('[excalidrawBridge] 缺少挂载容器');

  const { initialData, onChange, onApiReady, uiOptions } = opts;
  const root = createRoot(container);

  root.render(createElement(Excalidraw, {
    initialData: initialData || undefined,
    // 🚨 语言：本项目为中文界面，固定简体中文
    langCode: 'zh-CN',
    UIOptions: uiOptions || {},
    onExcalidrawAPI: (api) => {
      if (typeof onApiReady === 'function') {
        try { onApiReady(api); } catch (e) { console.error('[excalidrawBridge] onApiReady 回调异常:', e); }
      }
    },
    onChange: (elements, appState, files) => {
      if (typeof onChange !== 'function') return;
      try {
        onChange(sanitizeElements(elements), appState, files);
      } catch (e) {
        console.error('[excalidrawBridge] onChange 回调异常:', e);
      }
    }
  }));

  return {
    unmount: () => {
      try {
        // React 18 的 unmount 是异步的，先排队再清容器，避免 "removeChild" 报错
        root.unmount();
        queueMicrotask(() => {
          try { container.innerHTML = ''; } catch (e) { /* 忽略 */ }
        });
      } catch (e) {
        console.warn('[excalidrawBridge] 卸载 React root 失败:', e);
      }
    }
  };
};

// 读取场景 + 画布状态（供手动保存 / 页面隐藏时兜底落库）
export const captureScene = (api) => {
  if (!api) return { elements: [], appState: {} };
  const elements = typeof api.getSceneElements === 'function' ? api.getSceneElements() : [];
  const appState = typeof api.getAppState === 'function' ? api.getAppState() : {};
  return {
    elements: sanitizeElements(elements),
    appState: pickAppState(appState)
  };
};

// 把已保存的场景写回画布（清空当前元素 + 更新画布状态）
export const applyScene = (api, scene, appState) => {
  if (!api) return;
  try {
    if (Array.isArray(scene) && typeof api.updateScene === 'function') {
      api.updateScene({ elements: scene });
    }
    if (appState && typeof api.updateScene === 'function') {
      api.updateScene({ appState: pickAppState(appState) });
    }
  } catch (e) {
    console.error('[excalidrawBridge] 应用场景失败:', e);
  }
};
