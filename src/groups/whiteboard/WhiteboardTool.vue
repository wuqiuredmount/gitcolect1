<!-- src/groups/whiteboard/WhiteboardTool.vue -->
<!-- 🖊️ 第三产品：Excalidraw 白板主组件 -->
<!-- 职责：挂载画布 + 地理范围绑定 + 元素级同步（编号/指纹/富文本/回收站） -->
<template>
  <div class="whiteboard-tool">
    <!-- 顶部信息条：白板编号 / 地理范围 / 同步状态 -->
    <div class="wb-status-bar">
      <span class="wb-badge">🖊️ {{ boardName }}</span>
      <span class="wb-badge wb-badge-id">{{ boardId || '初始化中…' }}</span>
      <span class="wb-badge" :class="{ 'wb-badge-ok': !isDefaultBasis, 'wb-badge-warn': isDefaultBasis }">
        {{ isDefaultBasis ? '坐标基准：出厂默认（可在右侧修改）' : '坐标基准：已绑定' }}
      </span>
      <span class="wb-badge">
        元素 {{ stats.total }} 个 · 已登记 {{ stats.registered }} · 待换算 {{ stats.skipped }}
      </span>
      <span v-if="lastSyncAt" class="wb-badge wb-badge-dim">同步于 {{ lastSyncText }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn" @click="syncNow" :disabled="syncing">{{ syncing ? '同步中…' : '立即同步' }}</button>
      <button class="wb-btn" @click="isGeoPanelOpen = !isGeoPanelOpen">
        {{ isGeoPanelOpen ? '收起范围设置' : '地理范围设置' }}
      </button>
    </div>

    <div class="wb-body">
      <!-- Excalidraw 画布（懒加载，避免首屏加载 React） -->
      <div class="wb-canvas-wrap">
        <!-- 🚨【防御层 3a】画布宿主延迟到「board.scene 已还原」后才挂载
             —— 根因：子组件 onMounted 同步执行，早于父组件 onMounted 里的两个 await，
                导致首帧 initialData.elements = []，onChange 抛空数组，
                elementSync 走「集合差 → 全部软删除」分支，把已登记元素误删进回收站。
             用 v-if="boardReady" 保证 initialScene 有值之后才创建 React 画布。 -->
        <template v-if="boardReady">
          <Suspense>
            <template #default>
              <AsyncExcalidrawBoard
                ref="boardRef"
                :initial-scene="initialScene"
                :initial-app-state="initialAppState"
                :ui-options="uiOptions"
                @api-ready="handleApiReady"
                @change="handleChange"
              />
            </template>
            <template #fallback>
              <div class="wb-loading">白板引擎加载中…（首次加载较慢，请稍候）</div>
            </template>
          </Suspense>
        </template>
        <div v-else class="wb-loading">正在还原白板场景…</div>
      </div>

      <!-- 右侧：地理范围 / 画布基准 设置 -->
      <aside v-if="isGeoPanelOpen" class="wb-geo-panel">
        <h4>地理范围绑定（bounds）</h4>
        <p class="wb-hint">白板元素通过该范围换算经纬度。一经确定不建议频繁改动，否则已登记元素坐标会漂移。</p>
        <label>南纬 minLat<input type="number" step="0.0001" v-model.number="geoForm.minLat" /></label>
        <label>北纬 maxLat<input type="number" step="0.0001" v-model.number="geoForm.maxLat" /></label>
        <label>西经 minLng<input type="number" step="0.0001" v-model.number="geoForm.minLng" /></label>
        <label>东经 maxLng<input type="number" step="0.0001" v-model.number="geoForm.maxLng" /></label>

        <h4>画布基准尺寸（冻结）</h4>
        <p class="wb-hint">用于像素→经纬度换算。修改会使全部已登记元素坐标漂移，请谨慎。</p>
        <label>画布宽<input type="number" step="1" min="1" v-model.number="geoForm.canvasWidth" /></label>
        <label>画布高<input type="number" step="1" min="1" v-model.number="geoForm.canvasHeight" /></label>

        <div class="wb-geo-actions">
          <button class="wb-btn wb-btn-primary" @click="saveGeoBasis" :disabled="geoBusy">保存并重算</button>
          <button class="wb-btn" @click="resetGeoBasis" :disabled="geoBusy">恢复出厂</button>
        </div>
        <p v-if="geoMessage" class="wb-geo-msg">{{ geoMessage }}</p>

        <h4>已登记元素</h4>
        <p class="wb-hint">点击定位到画布中的对应元素；点击「详情」编辑富文本（与地图同一套 documents 表）。</p>
        <ul class="wb-element-list">
          <li v-for="item in registeredList" :key="item.id" @click="locateElement(item)">
            <span class="wb-el-id">{{ item.id }}</span>
            <span class="wb-el-name">{{ item.objectName || item.title }}</span>
            <button class="wb-el-doc" @click.stop="openDoc(item)">详情</button>
          </li>
          <li v-if="registeredList.length === 0" class="wb-empty">暂无已登记元素</li>
        </ul>
        <div class="wb-doc-preview" v-if="docPreview">
          <h4>富文本预览 · {{ docPreview.name }}</h4>
          <p class="wb-hint">内容来自 documents 表，与地图元素共用同一套富文本存储。</p>
          <div class="wb-doc-body" v-html="docPreview.html"></div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue';

// 🖊️ Excalidraw 画布宿主也懒加载：真正的 React/Excalidraw 代码在点开白板后才下载
const AsyncExcalidrawBoard = defineAsyncComponent(
  () => import('./ExcalidrawBoard.vue')
);

import { ensureCoordinateBasis, getBounds, setBounds, getCanvas, setCanvas, getBoardName } from './utils/boardSettings.js';
import { getDocument } from '../geo/utils/documentStore.js';
import { ensureDefaultBoard, saveBoard, getBoard, WB_LEGACY_BOARD_ID } from './utils/boardStore.js';
import { WB_TOOL_ID, syncScene, rebuildIdMap, getRegisteredElements, ElementIdMap } from './utils/elementSync.js';
import { WHITEBOARD_DEFAULTS } from '../geo/utils/toolDefaults.js';
import { isValidBounds, isValidCanvas } from './utils/coordinate.js';

const props = defineProps({
  fileId: { type: String, default: 'legacy-file' },
  isLoadingProject: { type: Boolean, default: false }
});

// ---------- 状态 ----------
const boardRef = ref(null);
const api = ref(null);

const boardId = ref('');
const boardName = ref(WHITEBOARD_DEFAULTS.boardName);
const isDefaultBasis = ref(true);
const isGeoPanelOpen = ref(false);

const initialScene = ref([]);
const initialAppState = ref({});
const lastSyncAt = ref(0);
const syncing = ref(false);
const geoBusy = ref(false);
const geoMessage = ref('');

// 🚨【防御层 3a】boardReady：board.scene 是否已从库中还原完毕。
//   false 时模板不挂载 <AsyncExcalidrawBoard>，从根上杜绝「首帧空场景」。
const boardReady = ref(false);
// 🚨【防御层 1】canvasReady：画布元素是否已就绪（可安全做集合差同步）。
//   🩹 触发条件改造（本轮）：旧实现把它绑在 api-ready 上，但 api-ready 从未触发
//      → canvasReady 永远 false → 元素从不登记（状态栏恒 0）。
//   现语义纠正为「数据就绪」：initialScene 已灌入 + nextTick 已过 + idMap 已重建。
//   api-ready 保留为**备选触发源**，两者互为兜底（先到先赢，幂等）。
const canvasReady = ref(false);
let pendingElements = null;

// 🚨【闸门③】场景活元素数基线：initialScene 灌入时的「活元素」数量。
//   用途：若某次 onChange 回抛 alive=0 而基线 > 0，说明是 Excalidraw 尚未消化
//   initialData 的空回抛，而非用户真删光 → 拦截本轮（不删、不登记）。
let sceneAliveBaseline = 0;
// 🚨【闸门③】分水岭：是否已见过「第一次非空 onChange」。
//   这是「Excalidraw 已消化完 initialData」的唯一可靠证明。
//   一旦置 true，闸门③ **永久失效**，后续所有 onChange（含用户真的删光）都不受约束。
//   用 firstNonEmptyChangeSeen 而非「首次空回抛」判据：后者时间窗模糊，
//   且会误伤「反复画一笔删一笔」与「真删光」两种正常场景。
let firstNonEmptyChangeSeen = false;

// 🚨 幂等置位：canvasReady 只升不降，两个触发源（onMounted / api-ready）先到先赢。
const armCanvasReady = (reason) => {
  if (canvasReady.value) return;
  canvasReady.value = true;
  console.log('[诊断-HT] canvasReady 已由', reason, '打开');
};

const stats = reactive({ total: 0, registered: 0, skipped: 0 });
const registeredList = ref([]);

const geoForm = reactive({
  minLat: 0, maxLat: 0, minLng: 0, maxLng: 0,
  canvasWidth: WHITEBOARD_DEFAULTS.canvasWidth,
  canvasHeight: WHITEBOARD_DEFAULTS.canvasHeight
});

// 换算三件套（内存副本，避免每次 onChange 都读库）
let bounds = null;
let canvas = null;
let idMap = new ElementIdMap();
let syncTimer = null;
let disposed = false;

// UIOptions：精简掉本项目用不到的入口（协作、库、导出图片等）
const uiOptions = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    saveAsImage: true
  }
};

const lastSyncText = computed(() =>
  lastSyncAt.value ? new Date(lastSyncAt.value).toLocaleTimeString('zh-CN') : ''
);

// ---------- 元素同步 ----------

// 防抖：Excalidraw 的 onChange 在拖拽时会高频触发，不能每次都写库
const scheduleSync = (elements) => {
  // 🔍【诊断-HT】入口（已降级 console.debug，默认不刷屏）
  console.debug('[诊断-HT] scheduleSync 被调:', Array.isArray(elements) ? elements.length : '(非数组)',
    '| canvasReady:', canvasReady.value, '| pendingElements 旧值:',
    pendingElements ? pendingElements.length : null);
  // 🚨【防御层 1】画布未就绪（首帧 / setScene 尚未执行完）时不调度同步。
  //   理由：此时 elements 可能是空的初始化快照，一旦进 runSync 会被当成
  //   「全部已登记元素都消失」→ 触发 elementSync 的软删除分支，把元素误删进回收站。
  //   只暂存最新快照，等 canvasReady 置位后由 handleApiReady 补一次同步。
  if (!canvasReady.value) {
    pendingElements = elements;
    console.debug('[诊断-HT] scheduleSync → 被 canvasReady=false 拦下，只暂存');
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    runSync(elements);
  }, 800);
};

const runSync = async (elements) => {
  const list = Array.isArray(elements) ? elements : [];
  // 只统计「活着的」元素（isDeleted 是 Excalidraw 的软删除标记）
  const alive = list.filter(e => e && !e.isDeleted);
  stats.total = alive.length;
  console.debug('[诊断-HT] runSync 入口: 传入', list.length, '| alive', alive.length,
    '| canvasReady:', canvasReady.value, '| bounds:', !!bounds, '| canvas:', !!canvas);

  // 🚨【防御层 1】硬守卫：画布未就绪一律不做任何同步（含删除判定）。
  //   这是「误删」的最后一道闸门——即便上层调度逻辑被绕过，这里也拦得住。
  if (!canvasReady.value) {
    console.debug('[诊断-HT] runSync → 被 canvasReady 守卫拦下（未登记）');
    stats.skipped = alive.length;
    stats.registered = idMap.size;
    return;
  }

  if (!bounds || !canvas) {
    console.debug('[诊断-HT] runSync → 被 bounds/canvas 缺失拦下（未登记）');
    stats.skipped = alive.length;
    stats.registered = idMap.size;
    return;
  }

  // 🚨🚨【闸门③】防「闸门①②打开后仍回来的空回抛」。
  //   背景：applyScene 是异步生效的，nextTick 只保证 Vue flush，
  //   不保证 React/Excalidraw 已消化完 initialData。因此可能存在：
  //     t0 scene 灌入(10) → t1 nextTick → t2 canvasReady=true → t3 idMap 重建(10 条)
  //     t4 Excalidraw 首帧 onChange 抛 [] → alive=[] → 集合差 = 全部 10 条 → 💥 全量误删
  //   闸门①②只防「某个时间点之前」，防不住「时间点之后回来的空数组」，故需本闸门。
  //
  //   判据收紧为 firstNonEmptyChangeSeen（而非「首次空回抛」）：
  //     「Excalidraw 何时消化完 initialData」只有「第一次吐出非空」能证明。
  //     一旦见过非空 → 闸门③ 永久失效 → 后续所有 onChange 不受约束。
  //   这样两个正常场景都不会被误伤：
  //     · 首次就非空（用户直接画）→ 立刻置位，之后删光可正常删除
  //     · 反复「画一笔删一笔」→ 首次画就把标志置位，后续空回抛均放行
  if (!firstNonEmptyChangeSeen) {
    if (alive.length === 0 && sceneAliveBaseline > 0) {
      // ⭐ 关键日志（保留 console.log）：闸门③ 命中 = 一次潜在的「全量误删」被挡下。
      //   这是安全哨兵，不属噪声，必须可见。
      console.log('[诊断-HT] 闸门③拦截：Excalidraw 尚未消化 initialData（基线',
        sceneAliveBaseline, '个，本轮回抛 0 个），本轮不删不登记');
      stats.skipped = alive.length;
      stats.registered = idMap.size;
      return;
    }
    if (alive.length > 0) {
      firstNonEmptyChangeSeen = true;
      console.debug('[诊断-HT] 闸门③已解除：见到首次非空 onChange（', alive.length, '个）');
    }
  }

  syncing.value = true;
  try {
    console.debug('[诊断-HT] runSync → 放行，即将调用 syncScene，元素数:', list.length);
    const result = await syncScene({
      elements: list,
      idMap,
      bounds,
      canvas,
      fileId: safeFileId(),
      // 🚨【防御层 2】只有画布确实就绪时才允许删除分支；否则 elementSync 内部整块跳过。
      //   双保险：WhiteboardTool 已用 canvasReady 守卫，这里再显式声明一次意图。
      // 🩹 本轮加强：再加一条「本轮确有活元素」前置条件 —— 空场景绝不传 true。
      //   注意：这是**调用侧新增的额外条件**，elementSync 内部的 allowDelete 门控
      //   一行未动，仍是防误删的最后一道保险（两层独立防护，不相互替代）。
      allowDelete: alive.length > 0
    });
    stats.registered = idMap.size;
    stats.skipped = result.skipped;
    lastSyncAt.value = Date.now();
    await refreshRegisteredList();
  } catch (e) {
    console.error('[WhiteboardTool] 元素同步失败:', e);
  } finally {
    syncing.value = false;
  }
};

const syncNow = async () => {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  // 🚨【防御层 4】手动同步同样受画布就绪守卫。
  //   「立即同步」按钮在首帧/场景还原期间被点击时，getScene() 可能返回空场景，
  //   缺了这层守卫就会绕过 runSync 的语义直接走删除分支。
  //   ⚠️ 若后续仍误删，第一嫌疑是 sanitizeElements 静默丢弃含循环引用的元素
  //      （excalidrawBridge.js:57-70）。
  if (!canvasReady.value || !boardRef.value?.getScene) return;
  const snap = boardRef.value.getScene();
  await runSync(snap ? snap.scene : []);
};

const refreshRegisteredList = async () => {
  try {
    const list = await getRegisteredElements(safeFileId());
    registeredList.value = list;
  } catch (e) {
    registeredList.value = [];
  }
};

const safeFileId = () => props.fileId || 'legacy-file';

// ---------- Excalidraw 事件 ----------

const handleApiReady = async (nextApi) => {
  api.value = nextApi;
  // 🩹 canvasReady 的**备选触发源**（主触发源在 onMounted）。
  //   语义纠正后 canvasReady 表达的是「元素数据已就绪」，不再依赖 api 到位；
  //   但 api-ready 若真能触发，说明画布确实活着，也应打开闸门 —— 互为兜底。
  //   armCanvasReady 幂等：若 onMounted 已置位，这里直接 no-op，不会重复。
  await nextTick();
  armCanvasReady('api-ready 备选触发（api 就绪）');

  // 补一次「暂存快照」同步：canvasReady 之前被 scheduleSync 挡下的变更在此落地。
  if (pendingElements) {
    const snap = pendingElements;
    pendingElements = null;
    console.debug('[诊断-HT] handleApiReady → 补同步暂存快照，元素数:', snap.length);
    scheduleSync(snap);
  }
};

// 画布变化 → 防抖同步元素（不做全量 saveAllLayers 覆盖，由 elementSync 增量处理）
const handleChange = (elements) => {
  console.debug('[诊断-HT] handleChange 收到:', Array.isArray(elements) ? elements.length : '(非数组)');
  scheduleSync(elements);
};

const locateElement = async (item) => {
  const elId = item && item.wbElementId;
  if (!elId || !boardRef.value?.scrollToElement) return;
  boardRef.value.scrollToElement(elId);
};

// ---------- 富文本详情（复用 documents 表）----------
// 核实结论：项目现有富文本组件为 components/tools/geo/panels/MarkerDocPanel.vue，
//   由 BaseMapTool.vue:92 挂载，内部调 saveDocument(toolId, fileId, nodeId, html)。
//   InfoDatabase.vue 只做只读 v-html 预览；InfoPanel.vue 是信息栏（无富文本）。
// 白板元素点开即「编辑画布上的图形」，与地图语义不同，故此处不整套复用 MarkerDocPanel
//   的样式面板（其样式项由 node.type 驱动，wb- 前缀会全空），
//   而是直接复用同一张 documents 表 + 同一套 documentStore API，保证数据层完全一致。
const docPreview = ref(null);

const openDoc = async (item) => {
  if (!item) return;
  try {
    const html = await getDocument(WB_TOOL_ID, safeFileId(), item.id);
    if (html === null || html === undefined) {
      docPreview.value = {
        name: item.objectName || item.title || item.id,
        html: '<p style="color:#9ca3af;">该元素暂无富文本内容（新元素会自动生成模板，可在信息数据库查看）。</p>'
      };
      return;
    }
    docPreview.value = {
      name: item.objectName || item.title || item.id,
      html: String(html) || '<p style="color:#9ca3af;">暂无内容</p>'
    };
  } catch (e) {
    console.error('[WhiteboardTool] 读取富文本失败:', e);
    docPreview.value = { name: item.id, html: '<p style="color:#ef4444;">读取失败</p>' };
  }
};

// ---------- 地理范围设置 ----------

const loadGeoForm = () => {
  if (bounds) {
    geoForm.minLat = bounds.minLat;
    geoForm.maxLat = bounds.maxLat;
    geoForm.minLng = bounds.minLng;
    geoForm.maxLng = bounds.maxLng;
  }
  if (canvas) {
    geoForm.canvasWidth = canvas.canvasWidth;
    geoForm.canvasHeight = canvas.canvasHeight;
  }
};

const saveGeoBasis = async () => {
  geoBusy.value = true;
  geoMessage.value = '';
  try {
    const nextBounds = {
      minLat: Number(geoForm.minLat), maxLat: Number(geoForm.maxLat),
      minLng: Number(geoForm.minLng), maxLng: Number(geoForm.maxLng)
    };
    const nextCanvas = {
      canvasWidth: Math.round(Number(geoForm.canvasWidth)),
      canvasHeight: Math.round(Number(geoForm.canvasHeight))
    };
    if (!isValidBounds(nextBounds)) {
      geoMessage.value = '❌ 地理范围非法：北纬须大于南纬、东经须大于西经，且在合法经纬度区间内。';
      return;
    }
    if (!isValidCanvas(nextCanvas)) {
      geoMessage.value = '❌ 画布尺寸非法：宽高必须是大于 0 的数字。';
      return;
    }
    bounds = await setBounds(nextBounds);
    canvas = await setCanvas(nextCanvas);
    isDefaultBasis.value = false;
    geoMessage.value = '✅ 已保存，正在按新基准重算全部元素坐标…';
    await syncNow();
    geoMessage.value = '✅ 已保存并重算完成。';
  } catch (e) {
    geoMessage.value = '❌ 保存失败：' + e.message;
  } finally {
    geoBusy.value = false;
  }
};

const resetGeoBasis = async () => {
  geoBusy.value = true;
  geoMessage.value = '';
  try {
    bounds = await setBounds(WHITEBOARD_DEFAULTS.bounds);
    canvas = await setCanvas({
      canvasWidth: WHITEBOARD_DEFAULTS.canvasWidth,
      canvasHeight: WHITEBOARD_DEFAULTS.canvasHeight
    });
    isDefaultBasis.value = true;
    loadGeoForm();
    await syncNow();
    geoMessage.value = '✅ 已恢复出厂基准。';
  } catch (e) {
    geoMessage.value = '❌ 恢复失败：' + e.message;
  } finally {
    geoBusy.value = false;
  }
};

// ---------- 生命周期 ----------

onMounted(async () => {
  try {
    // 1. 换算基准（首启自动写入出厂默认）
    const basis = await ensureCoordinateBasis();
    bounds = basis.bounds;
    canvas = basis.canvas;
    isDefaultBasis.value = basis.isDefault;
    loadGeoForm();

    // 2. 白板记录（首启自动创建「白板 1」）
    const board = await ensureDefaultBoard();
    boardId.value = (board && board.boardId) || WB_LEGACY_BOARD_ID;
    boardName.value = await getBoardName();

    // 3. 还原场景到画布
    initialScene.value = (board && Array.isArray(board.scene)) ? board.scene : [];
    initialAppState.value = (board && board.appState) || {};
    // 🚨【闸门③】记录场景活元素数基线（供 runSync 判断"空回抛"是否异常）
    sceneAliveBaseline = initialScene.value.filter(e => e && !e.isDeleted).length;

    // 4. 重建 element → annotation 映射（保证刷新后不重复登记）
    idMap = await rebuildIdMap(safeFileId());
    stats.registered = idMap.size;
    stats.total = initialScene.value.filter(e => e && !e.isDeleted).length;
    await refreshRegisteredList();

    // 🚨【防御层 3a】以上步骤（含两个 await）全部完成后才放行画布挂载，
    //   保证 <AsyncExcalidrawBoard> 拿到的 initialScene 就是库里的真实场景，
    //   而不是空数组（旧代码因 onMounted 同步先行，必然拿到空数组 → 误删）。
    await nextTick();
    boardReady.value = true;

    // 🩹 在此处置 canvasReady —— 不再依赖 api-ready。
    //   三个条件此时全部满足：
    //     ① board.scene 已灌入 initialScene（步骤 3）
    //     ② await nextTick() 已过（React 有机会消化 initialData）
    //     ③ idMap 已重建完成（步骤 4，集合差判定有正确基准）
    //   api-ready 仍保留为备选触发源（见 handleApiReady），先到先赢、幂等。
    armCanvasReady('onMounted: scene灌入 + nextTick + idMap 重建完成');

    // 🚨 T1：注册跨组件刷新钩子，供 RecycleBinModal 恢复后回灌画布
    registerRefreshHook();
  } catch (e) {
    // ⭐ 关键日志（保留 console.error）：初始化失败 → 画布不会挂载，必须可见。
    console.error('[诊断-HT] 🚨 onMounted 抛异常 → boardReady 未能置 true，画布不会挂载！', e);
  }
});

onBeforeUnmount(async () => {
  disposed = true;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  unregisterRefreshHook();
  // 关闭前兜底：把当前场景整体落库（元素级同步已由防抖逻辑处理）
  try {
    const snap = boardRef.value?.getScene?.();
    if (snap && boardId.value) {
      await saveBoard({
        boardId: boardId.value,
        fileId: safeFileId(),
        name: boardName.value,
        bounds,
        canvas,
        scene: snap.scene,
        appState: snap.appState
      });
    }
  } catch (e) {
    console.warn('[WhiteboardTool] 卸载前保存失败:', e);
  }
});

// 供 GisApp（信息数据库 / 回收站恢复）调用：重新从库读元素
const refreshDataFromDB = async () => {
  try {
    idMap = await rebuildIdMap(safeFileId());
    await refreshRegisteredList();
    stats.registered = idMap.size;

    // 🚨 T1【关键】回收站恢复后，画布上的 React 组件不会自动感知 board.scene 的变化。
    //   这里重新读白板场景并整体刷回画布，保证「恢复的元素真的重新出现」，
    //   同时依据新的 scene 重建 idMap，避免下一次 onChange 把恢复元素当新元素重复登记。
    if (boardId.value && boardRef.value?.setScene) {
      const board = await getBoard(boardId.value);
      if (board) {
        const scene = Array.isArray(board.scene) ? board.scene : [];
        boardRef.value.setScene(scene, board.appState || {});
        initialScene.value = scene;
        initialAppState.value = board.appState || {};
        stats.total = scene.filter(e => e && !e.isDeleted).length;
        // 🚨【防御层 1】恢复回写属于「权威数据」，必须显式重新打开同步开关，
        //   否则恢复的元素会因 canvasReady 仍为 false 而永远不同步。
        // 🩹 本轮：改用幂等入口，与另两个触发源共用同一套置位语义。
        armCanvasReady('回收站恢复回写（权威数据）');
      }
    }
  } catch (e) {
    console.warn('[WhiteboardTool] 刷新数据失败:', e);
  }
};

// 🚨 T1 补丁：把刷新入口暴露到 window，供 RecycleBinModal 跨组件调用
//   理由：回收站弹窗由 GisApp 顶层渲染，拿不到白板实例引用（KeepAlive + 动态组件），
//        用轻量钩子比改造 GisApp 的 ref 传递链更安全（不触碰既有地图逻辑）。
const registerRefreshHook = () => {
  try {
    window.__wbRefreshHook = refreshDataFromDB;
  } catch (e) { /* 忽略 */ }
};

const unregisterRefreshHook = () => {
  try {
    if (window.__wbRefreshHook === refreshDataFromDB) window.__wbRefreshHook = null;
  } catch (e) { /* 忽略 */ }
};

defineExpose({
  refreshDataFromDB,
  syncNow
});
</script>

<style scoped>
.whiteboard-tool {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #f0f2f5;
}

/* ---------- 顶部状态条 ---------- */
.wb-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.wb-badge {
  font-size: 12px;
  color: #4b5563;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 3px 8px;
  white-space: nowrap;
}
.wb-badge-id { font-family: 'Consolas', 'Courier New', monospace; color: #0066cc; }
.wb-badge-ok { background: #ecfdf5; color: #059669; }
.wb-badge-warn { background: #fffbeb; color: #b45309; }
.wb-badge-dim { color: #9ca3af; background: transparent; }
.wb-spacer { flex: 1; }
.wb-btn {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #374151;
  transition: all 0.2s ease;
}
.wb-btn:hover:not(:disabled) { border-color: #1890ff; color: #1890ff; background: #f0f7ff; }
.wb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wb-btn-primary { background: #1890ff; border-color: #1890ff; color: #fff; }
.wb-btn-primary:hover:not(:disabled) { background: #096dd9; border-color: #096dd9; color: #fff; }

/* ---------- 主体 ---------- */
.wb-body { display: flex; flex: 1; min-height: 0; }
.wb-canvas-wrap { flex: 1; min-width: 0; height: 100%; position: relative; background: #fff; }
.wb-loading {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: #6b7280; font-size: 13px;
}

/* ---------- 右侧地理范围面板 ---------- */
.wb-geo-panel {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid #e5e7eb;
  background: #fff;
  padding: 12px;
  overflow-y: auto;
  font-size: 12px;
}
.wb-geo-panel h4 {
  margin: 12px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 4px;
}
.wb-geo-panel h4:first-child { margin-top: 0; }
.wb-geo-panel label {
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px; margin-bottom: 6px; color: #4b5563;
}
.wb-geo-panel input {
  width: 120px; padding: 3px 6px; font-size: 12px;
  border: 1px solid #d1d5db; border-radius: 4px;
}
.wb-geo-panel input:focus { outline: none; border-color: #1890ff; }
.wb-hint { color: #9ca3af; font-size: 11px; line-height: 1.5; margin: 4px 0 8px; }
.wb-geo-actions { display: flex; gap: 8px; margin-top: 10px; }
.wb-geo-msg { margin-top: 8px; font-size: 11px; line-height: 1.5; color: #374151; }
.wb-element-list { list-style: none; padding: 0; margin: 6px 0 0; max-height: 260px; overflow-y: auto; }
.wb-element-list li {
  display: flex; gap: 6px; align-items: center;
  padding: 5px 6px; border-radius: 4px; cursor: pointer;
  border-bottom: 1px solid #f9fafb;
}
.wb-element-list li:hover { background: #f0f7ff; }
.wb-el-id { font-family: 'Consolas', 'Courier New', monospace; color: #0066cc; flex-shrink: 0; }
.wb-el-name { color: #4b5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-empty { color: #9ca3af; cursor: default; justify-content: center; }
.wb-empty:hover { background: transparent; }

/* ---------- 元素行内「详情」按钮 ---------- */
.wb-el-doc {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  color: #1890ff;
}
.wb-el-doc:hover { background: #f0f7ff; border-color: #1890ff; }

/* ---------- 富文本预览（documents 表）---------- */
.wb-doc-preview { margin-top: 14px; border-top: 1px solid #f3f4f6; padding-top: 8px; }
.wb-doc-body {
  margin-top: 6px;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fcfcfd;
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
  word-break: break-word;
}
.wb-doc-body img { max-width: 100%; height: auto; }
</style>

