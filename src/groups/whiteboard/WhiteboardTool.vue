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
import { ref, reactive, computed, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';

// 🖊️ Excalidraw 画布宿主也懒加载：真正的 React/Excalidraw 代码在点开白板后才下载
const AsyncExcalidrawBoard = defineAsyncComponent(
  () => import('./ExcalidrawBoard.vue')
);

import { ensureCoordinateBasis, getBounds, setBounds, getCanvas, setCanvas, getBoardName } from './utils/boardSettings.js';
import { getDocument } from '../geo/utils/documentStore.js';
import { ensureDefaultBoard, saveBoard, WB_LEGACY_BOARD_ID } from './utils/boardStore.js';
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

  if (!bounds || !canvas) {
    stats.skipped = alive.length;
    stats.registered = idMap.size;
    return;
  }

  syncing.value = true;
  try {
    const result = await syncScene({
      elements: list,
      idMap,
      bounds,
      canvas,
      fileId: safeFileId()
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
  const snap = boardRef.value?.getScene?.();
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

const handleApiReady = (nextApi) => {
  api.value = nextApi;
};

// 画布变化 → 防抖同步元素（不做全量 saveAllLayers 覆盖，由 elementSync 增量处理）
const handleChange = (elements) => {
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

    // 4. 重建 element → annotation 映射（保证刷新后不重复登记）
    idMap = await rebuildIdMap(safeFileId());
    stats.registered = idMap.size;
    stats.total = initialScene.value.filter(e => e && !e.isDeleted).length;
    await refreshRegisteredList();
  } catch (e) {
    console.error('[WhiteboardTool] 初始化失败:', e);
  }
});

onBeforeUnmount(async () => {
  disposed = true;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
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
  } catch (e) {
    console.warn('[WhiteboardTool] 刷新数据失败:', e);
  }
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

