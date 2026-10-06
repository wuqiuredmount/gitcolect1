// src/groups/whiteboard/utils/excalidrawBridge.js
// 🖊️ Vue ↔ React 桥接层（路线 A：Vue 组件内挂载 React root）
//
// 依据 .agents/references/excalidraw-vue-integration.md：
//   - onMounted：container 用 react-dom/client 的 createRoot 渲染 <Excalidraw />
//   - onBeforeUnmount：root.unmount() 并清空容器，避免内存泄漏
//   - excalidrawAPI：拿 imperative API，暴露给 Vue 侧调用
//     ⚠️ 0.18.x 的 prop 名是 `excalidrawAPI`（**不是**旧版的 `onExcalidrawAPI`）；
//        传错名字不会报错，只在控制台留一句
//        'excalidrawAPI should be a function!'，API 则永远拿不到。
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

// 元素净化诊断开关：默认关闭。
// 打开方式（浏览器控制台执行一次即可，刷新后失效）：
//   window.__WB_DEBUG_SANITIZE__ = true
// 打开后会逐字段打印序列化失败的真实字段名 + 错误信息，用于定位「坏字段」。
export const isSanitizeDebugOn = () =>
  typeof window !== 'undefined' && window.__WB_DEBUG_SANITIZE__ === true;

// 元素净化：字段级容错。
// 🚨 设计原则：**字段坏了只丢该字段，绝不丢整个元素**。
//    历史 bug：旧实现是 `JSON.parse(JSON.stringify(el))` 整体序列化 + 失败即
//    catch 丢弃整个元素（元素级丢弃），导致"一处坏全丢"——只要某元素含一个
//    不可序列化字段，该元素就被静默丢弃，onChange 最终收到空数组，
//    状态栏恒为「元素 0 个」。
//
//    现策略（三级降级）：
//      ① 整体序列化成功 → 直接用（快路径，正常元素都走这里）
//      ② 失败 → 逐字段序列化，坏字段剔除、好字段全留（几何/id/type 一定保住）
//      ③ customData 单独再兜一层（它是最可能被外部代码写脏的字段）
//
// 🚨 修复后**必须保留** WhiteboardTool / elementSync 里的 `allowDelete` 门控。
//    该门控正是挡在"净化丢元素 → 集合差误判为已删除 → 全量软删除"之间的闸门。
//    现在净化不丢元素了，门控看似"多余"，但**绝不能拆**：它是防误删的最后一道保险，
//    且首帧/场景还原期仍需它拦截。拆掉 = 立即恢复全量误删风险。
export const sanitizeElements = (elements) => {
  const list = Array.isArray(elements) ? elements : [];
  const debug = isSanitizeDebugOn();
  const out = [];

  list.forEach(el => {
    if (!el || typeof el !== 'object' || !el.id) return;

    // ① 快路径：整体可序列化
    try {
      out.push(JSON.parse(JSON.stringify(el)));
      return;
    } catch (e) {
      if (debug) {
        console.warn('[excalidrawBridge][诊断] 整体序列化失败，转入字段级降级:', {
          id: el.id,
          type: el.type,
          message: e && e.message
        });
      }
    }

    // ② 字段级降级：逐个字段尝试，坏的剔除，好的保留
    const safe = {};
    const badKeys = [];
    Object.keys(el).forEach(key => {
      // 内部/原型字段直接跳过
      if (key === '__proto__' || key === 'constructor') return;
      let value;
      try {
        value = el[key];
      } catch (e) {
        // 取值本身就抛（getter 异常 / 代理陷阱）
        badKeys.push({ key, reason: '取值异常', message: e && e.message });
        return;
      }
      try {
        safe[key] = JSON.parse(JSON.stringify(value));
      } catch (e) {
        // 单字段坏 → 只丢该字段
        badKeys.push({ key, type: typeof value, message: e && e.message });
      }
    });

    // ③ customData 兜底：它是白板唯一的"外部写入字段"（customData.name / .group），
    //    最可能被写入不可序列化对象（如 Vue reactive 代理、DOM 节点），
    //    单独再降一级：能留的键留下，坏的键剔除。
    if (el.customData && typeof el.customData === 'object') {
      const cd = {};
      const badCdKeys = [];
      Object.keys(el.customData).forEach(k => {
        try {
          cd[k] = JSON.parse(JSON.stringify(el.customData[k]));
        } catch (e) {
          badCdKeys.push({ key: k, type: typeof el.customData[k], message: e && e.message });
        }
      });
      safe.customData = cd;
      if (debug && badCdKeys.length) {
        console.warn('[excalidrawBridge][诊断] customData 内部坏键:', {
          id: el.id,
          badCdKeys
        });
      }
    }

    // 🚨 关键：保底补齐最小必要字段，确保该元素仍可入库（绝不整元素丢弃）
    if (!safe.id) safe.id = el.id;
    if (!safe.type) safe.type = el.type || 'rectangle';

    if (debug) {
      console.warn('[excalidrawBridge][诊断] 元素已按字段级降级保留:', {
        id: safe.id,
        type: safe.type,
        droppedFields: badKeys,
        keptFieldCount: Object.keys(safe).length
      });
    }

    out.push(safe);
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
    // 🚨🚨【问题 2 根因修复】prop 名是 `excalidrawAPI`，**不是** `onExcalidrawAPI`！
    //   实测证据（node_modules/@excalidraw/excalidraw/dist/prod/index.js）：
    //     let { excalidrawAPI: n, viewModeEnabled, … } = t;   // t = props
    //     …
    //     typeof n == "function" ? n(d)
    //                            : console.error("excalidrawAPI should be a function!")
    //   旧代码传的是 `onExcalidrawAPI`（0.17 时代的名字），于是：
    //     · Excalidraw 侧 excalidrawAPI === undefined → 走 else 分支
    //     · 控制台只打一句 'excalidrawAPI should be a function!'（很容易被刷屏埋掉）
    //     · API 从未注入 → onApiReady 从未回调 → 上层 api.value 恒 null
    //       → api.getSceneElements() 恒 -3 → captureScene(api) 失效
    //       → 「手动同步」「关闭兜底落库」全断（问题 2 的完整因果链）
    //   这也解释了「onChange 正常但 onExcalidrawAPI 从不触发」的诡异组合：
    //   两者是**各自独立**的 props，前者名字对、后者名字错。
    //   ⚠️ 勿改回 onExcalidrawAPI —— 0.18.1 只认 excalidrawAPI。
    excalidrawAPI: (api) => {
      if (typeof onApiReady === 'function') {
        try { onApiReady(api); } catch (e) { console.error('[excalidrawBridge] onApiReady 回调异常:', e); }
      }
    },
    onChange: (elements, appState, files) => {
      if (typeof onChange !== 'function') return;
      try {
        const rawCount = Array.isArray(elements) ? elements.length : 0;

        // 🚨 常驻告警（保留）：净化把元素丢光了 —— 报警。
        //   （核心 bug 已修，此告警作为「误删防线」的哨兵长期保留）
        const safe = sanitizeElements(elements);
        if (rawCount > 0 && safe.length === 0) {
          console.error(
            '[excalidrawBridge] 🚨 净化后元素数归零！raw=' + rawCount +
            ' safe=0，请检查 sanitizeElements 是否又被改回元素级丢弃'
          );
        }

        onChange(safe, appState, files);
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
