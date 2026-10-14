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
      <!-- 🆕【P2】回到中心点：把视口对准全部活元素的外接框。
           链路：handleBackToCenter → boardRef.centerToContent()
                 → ExcalidrawBoard 内部 api.scrollToContent(alive, { fitToViewport, animate })
           ⚠️ 不直接调 boardRef.getApi().scrollToContent —— 空场景/软删除过滤/异常兜底
              都收在 ExcalidrawBoard.centerToContent 里，外部只处理「成没成」。 -->
      <button class="wb-btn" @click="handleBackToCenter">回到中心点</button>
      <button class="wb-btn" @click="syncNow" :disabled="syncing">{{ syncing ? '同步中…' : '立即同步' }}</button>
      <!-- 🤖【P1-A】AI 批量导入开关（面板内联在画布左上角）；对外发布模式隐藏 -->
      <button v-if="INTERNAL_TOOLS" class="wb-btn" :class="{ 'wb-btn-primary': showAiImportPanel }" @click="showAiImportPanel = !showAiImportPanel">
        {{ showAiImportPanel ? '收起AI导入' : 'AI批量导入' }}
      </button>
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
                @selection-change="handleSelectionChange"
              />
            </template>
            <template #fallback>
              <div class="wb-loading">白板引擎加载中…（首次加载较慢，请稍候）</div>
            </template>
          </Suspense>
        </template>
        <div v-else class="wb-loading">正在还原白板场景…</div>

        <!-- ⬇️ 白板 P0 面板（块 3 新增，2026-10-06）
             🚨 插入点必须是 .wb-canvas-wrap 内部、且与上面的 v-if="boardReady" 同级：
               ① 在 .wb-canvas-wrap 内 → 它是最近的 positioned 祖先（第 618 行 position:relative），
                  InfoPanel 的 MapPanel 非 inline 是 position:absolute，包含块正是它
                  → 信息栏落在「画布左下角」，与鹰眼视觉一致。
                  若放到 .whiteboard-tool 的直接子级（无 position）→ 包含块会上溯到
                  GisApp 的 .tool-content（position:relative + overflow:hidden）
                  → 既跑位、又可能被裁。
               ② 与 v-if="boardReady" 同级（不放进 v-if 内）→ Teleport 不被 boardReady 延后，
                  顶栏「图形列表」首帧即可挂载。
             ⚠️ 本组件自身无样式、不产生定位上下文，不影响上面的 absolute 包含块链。 -->
        <WhiteboardPanels
          ref="wbPanelsRef"
          :layers="wbPanelLayers"
          :groups="wbPanelGroups"
          :tool-id="WB_TOOL_ID"
          @locate="whiteboardLocate"
          @add-group="handleWbAddGroup"
          @remove-group="handleWbRemoveGroup"
          @rename-group="handleWbRenameGroup"
          @update-layer-group="handleWbUpdateGroup"
          @delete-layer="handleWbDeleteElement"
          @filter-group="handleWbFilterGroup"
          @update-layer="handleWbLayerUpdate"
        />

        <!-- 🤖【P1-A】AI 批量导入面板（inline 模式，与 InfoPanel 同为 .wb-canvas-wrap 内的浮层）
             ⚠️ 用 inline 内联，**不照抄地图侧的 Teleport to="#tool-header-slot"**（白板无此 slot）。
             ℹ️ toolId 用白板自己的 WB_TOOL_ID ⇒ 导入的记录直接落进白板的信息库，
                与地图元素共用同一套 annotations/documents 表，但 toolId 隔离互不干扰。 -->
        <AiImportPanel
          v-if="INTERNAL_TOOLS && showAiImportPanel && boardReady"
          inline
          :tool-id="WB_TOOL_ID"
          :file-id="safeFileId()"
          @imported="handleWbAiImported"
        />

        <!-- 📝【P1-B 新增】画布选中元素 → 富文本编辑面板
             🚨 插入点与 WhiteboardPanels 同理，必须在 .wb-canvas-wrap 内、
                与 v-if="boardReady" 同级：
                  ① 它是最近的 positioned 祖先（.wb-canvas-wrap { position:relative }）
                     ⇒ MarkerDocPanel 的 .doc-panel { position:absolute; top:15px; right:15px }
                        落成「画布右上角浮层」，与地图侧视觉一致，且不遮顶栏（本组件在画布区内）。
                  ② 放进 v-if 内会被 boardReady 延后；与它同级则首帧即可存在。
             🚨 hide-style-panel：白板元素 type 是 wb- 前缀，样式项必然全空 → 整体隐藏。
             ⚠️ node 只在「选中的元素能反查到 annotation」时才非空 ——
                未登记元素（防抖窗内刚画的）与空白处点选都不显示面板，避免拿脏 node 去写库。 -->
        <MarkerDocPanel
          v-if="currentDocNode"
          :node="currentDocNode"
          :tool-id="WB_TOOL_ID"
          :file-id="safeFileId()"
          :hide-style-panel="true"
          @close="handleDocPanelClose"
          @update:title="handleDocTitleUpdate"
        />
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
            <!-- 🚨【第 25 轮】UI 显示兜底：objectName 为空（匿名元素）→ 「未命名」，
                 绝不回退显示 element.id / annotation id（用户明确要求不露技术 ID）。
                 兜底只在这一层做，数据层保持真实的空字符串。 -->
            <span class="wb-el-name">{{ item.objectName || item.title || '未命名' }}</span>
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
// ===== [SECTION:AsyncExcalidrawBoard] =====
const AsyncExcalidrawBoard = defineAsyncComponent(
  () => import('./ExcalidrawBoard.vue')
);

import { ensureCoordinateBasis, getBounds, setBounds, getCanvas, setCanvas, getBoardName } from './utils/boardSettings.js';
import { getDocument } from '../geo/utils/documentStore.js';
import { ensureDefaultBoard, saveBoard, getBoard, WB_LEGACY_BOARD_ID } from './utils/boardStore.js';
// ✅ 合并导入：filterBrokenElements 与 WB_TOOL_ID 等同源自 elementSync.js
import { WB_TOOL_ID, syncScene, rebuildIdMap, getRegisteredElements, ElementIdMap,
         filterBrokenElements } from './utils/elementSync.js';
import { WHITEBOARD_DEFAULTS } from '../geo/utils/toolDefaults.js';
import { isValidBounds, isValidCanvas } from './utils/coordinate.js';
// 🧩 块 3：白板 P0 面板（图形列表 → 顶栏；信息栏 → 画布左下角浮层）
import WhiteboardPanels from './WhiteboardPanels.vue';
// 🚨 构建期开关：对外发布模式隐藏内部工具（AI导入 / 回收站 / 待放置）
import { INTERNAL_TOOLS } from '../../featureFlags.js';
// 🤖【P1-A】AI 批量导入面板：懒加载（与 AsyncExcalidrawBoard 同理，
//   面板依赖 MapPanel/图表等一堆东西，没必要进首屏）。
// ===== [SECTION:AiImportPanel] =====
const AiImportPanel = defineAsyncComponent(
  () => import('../../components/tools/geo/panels/AiImportPanel.vue')
);
// 📝【P1-B】富文本编辑面板：与 AiImportPanel 同理懒加载。
//   ⚠️ 路径核对：WhiteboardTool.vue 在 src/groups/whiteboard/，
//      面板在 src/components/tools/geo/panels/ ⇒ 上溯两级到 src/components ✓
//      （与 AiImportPanel 同为 components 子树，故前缀一致）
// ===== [SECTION:MarkerDocPanel] =====
const MarkerDocPanel = defineAsyncComponent(
  () => import('../../components/tools/geo/panels/MarkerDocPanel.vue')
);
// 🤖【P1-A】记录 → 画布元素生成器（AI 导入后让画布立刻出现对应文字元素）
import { recordToElement } from './utils/recordToElement.js';
// 🧩 块 4：画布侧写操作（改组 / 删除）所需的官方 API
//   核实来源 node_modules/@excalidraw/excalidraw/dist/types/excalidraw/index.d.ts:22-23
//     `export { mutateElement, ... } from "./element/mutateElement"`
//     `export { CaptureUpdateAction } from "./store"`
//   ⚠️ MEMO R5：mutateElement 只改引用、**不触发重绘**，必须配
//      updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
import { mutateElement, CaptureUpdateAction } from '@excalidraw/excalidraw';
// ⚠️ 此处**不** import moveToRecycleBin：删除的唯一落库入口是 runSync（elementSync.js:281）。
//    白板面板侧手动调它会形成第二个删除入口，并因缺 wbElementRaw 导致恢复失效（见 handleWbDeleteElement 注释）。

// ===== [SECTION:props] =====
const props = defineProps({
  fileId: { type: String, default: 'legacy-file' },
  isLoadingProject: { type: Boolean, default: false }
});

// ---------- 状态 ----------
// ===== [SECTION:boardRef] =====
const boardRef = ref(null);
const api = ref(null);

// ===== [SECTION:boardId] =====
const boardId = ref('');
const boardName = ref(WHITEBOARD_DEFAULTS.boardName);
// ===== [SECTION:isDefaultBasis] =====
const isDefaultBasis = ref(true);
const isGeoPanelOpen = ref(false);
// 🤖【P1-A】AI 批量导入面板开关（顶栏按钮控制）
// ===== [SECTION:showAiImportPanel] =====
const showAiImportPanel = ref(false);
// 🤖【P1-A】导入后补画布的重入锁。
//   为什么需要：AiImportPanel 的「一键导入全部」是**逐文件 emit('imported')**，
//   若 N 个文件就是 N 次调用；而本 handler 内含 await（读库 / rebuildIdMap / syncNow），
//   并发进入会重复 setScene（画面闪 + 元素翻倍风险）。
//   语义：后到的调用直接丢弃 —— 因为「读库 → 只补无 wbElementId 的记录」本身是幂等的，
//   最后一次调用（await 结束后）读到的库一定是最全的，足以覆盖前面的缺口。
//   ⚠️ 用「排队重跑」而非「直接丢弃」更稳：置 pending 标记，当前跑完再看是否需要补一轮。
// ===== [SECTION:wbAiImportBusy] =====
let wbAiImportBusy = false;
let wbAiImportPending = false;

// ===== [SECTION:initialScene] =====
const initialScene = ref([]);
const initialAppState = ref({});
// ===== [SECTION:lastSyncAt] =====
const lastSyncAt = ref(0);
const syncing = ref(false);
// ===== [SECTION:geoBusy] =====
const geoBusy = ref(false);
const geoMessage = ref('');

// 🚨【防御层 3a】boardReady：board.scene 是否已从库中还原完毕。
//   false 时模板不挂载 <AsyncExcalidrawBoard>，从根上杜绝「首帧空场景」。
// ===== [SECTION:boardReady] =====
const boardReady = ref(false);
// 🚨【防御层 1】canvasReady：画布元素是否已就绪（可安全做集合差同步）。
//   🩹 触发条件改造（本轮）：旧实现把它绑在 api-ready 上，但 api-ready 从未触发
//      → canvasReady 永远 false → 元素从不登记（状态栏恒 0）。
//   现语义纠正为「数据就绪」：initialScene 已灌入 + nextTick 已过 + idMap 已重建。
//   api-ready 保留为**备选触发源**，两者互为兜底（先到先赢，幂等）。
// ===== [SECTION:canvasReady] =====
const canvasReady = ref(false);
let pendingElements = null;

// 🚨【闸门③】场景活元素数基线：initialScene 灌入时的「活元素」数量。
//   用途：若某次 onChange 回抛 alive=0 而基线 > 0，说明是 Excalidraw 尚未消化
//   initialData 的空回抛，而非用户真删光 → 拦截本轮（不删、不登记）。
// ===== [SECTION:sceneAliveBaseline] =====
let sceneAliveBaseline = 0;
// 🚨【闸门③】分水岭：是否已见过「第一次非空 onChange」。
//   这是「Excalidraw 已消化完 initialData」的唯一可靠证明。
//   一旦置 true，闸门③ **永久失效**，后续所有 onChange（含用户真的删光）都不受约束。
//   用 firstNonEmptyChangeSeen 而非「首次空回抛」判据：后者时间窗模糊，
//   且会误伤「反复画一笔删一笔」与「真删光」两种正常场景。
// ===== [SECTION:firstNonEmptyChangeSeen] =====
let firstNonEmptyChangeSeen = false;

// 🚨 幂等置位：canvasReady 只升不降，两个触发源（onMounted / api-ready）先到先赢。
// ===== [SECTION:armCanvasReady] =====
const armCanvasReady = (reason) => {
  if (canvasReady.value) return;
  canvasReady.value = true;
  console.log('[诊断-HT] canvasReady 已由', reason, '打开');
};

// ===== [SECTION:stats] =====
const stats = reactive({ total: 0, registered: 0, skipped: 0 });
const registeredList = ref([]);
// 📝【P1-B】当前富文本面板绑定的节点（annotation 形状：id / type / title / lat / lng）。
//   null = 面板不渲染。由 handleSelectionChange 维护（画布点选 / 清空选中）。
// ===== [SECTION:currentDocNode] =====
const currentDocNode = ref(null);

// 🧩 块 3：白板 P0 面板包装组件 ref（用于「画布点选 → 信息栏联动」）
// ===== [SECTION:wbPanelsRef] =====
const wbPanelsRef = ref(null);

// ===== [SECTION:geoForm] =====
const geoForm = reactive({
  minLat: 0, maxLat: 0, minLng: 0, maxLng: 0,
  canvasWidth: WHITEBOARD_DEFAULTS.canvasWidth,
  canvasHeight: WHITEBOARD_DEFAULTS.canvasHeight
});

// 换算三件套（内存副本，避免每次 onChange 都读库）
// ===== [SECTION:bounds] =====
let bounds = null;
let canvas = null;
// ===== [SECTION:idMap] =====
let idMap = new ElementIdMap();
let syncTimer = null;
// ===== [SECTION:disposed] =====
let disposed = false;

// ---------- 🛡️【缺陷 2 修复（2026-10-07）】乐观写入的三件套状态 ----------
//
// 【背景】onBeforeUnmount 用「画布实时快照」整体覆盖 board.scene，会与
//   「回收站恢复 → refreshDataFromDB → setScene」竞争：
//   恢复已把库刷成新数据，但 React 尚未消化 setScene 时用户切走
//   → 旧快照回覆盖 → 元素回退 isDeleted=true → 下次 runSync 再生回收站记录。
//
// 【解法】区分「乐观写」与「权威写」：
//   · 乐观写 = 画布快照（onBeforeUnmount）→ 传 baseUpdatedAt，可能被 boardStore 拒绝
//   · 权威写 = 回收站恢复 / 清理工具 → 不传 base，强制生效（不牺牲 T1 情况 1）
//
// ① lastKnownUpdatedAt：上一次从库读到 / 写库成功后的 board.updatedAt（版本基线）
// ② canvasDirty：画布上是否有「尚未落库的用户改动」
// ③ saving：进程内写互斥，避免乐观写与权威写并发（DeepSeek 第 17 轮 §四已批）
// ===== [SECTION:lastKnownUpdatedAt] =====
let lastKnownUpdatedAt = undefined;   // undefined = 未知基线（此时不做校验，退化为旧行为）
let canvasDirty = false;
// ===== [SECTION:saving] =====
let saving = false;

// ⚠️ setScene 回灌期间，Excalidraw 会**回抛一次 onChange**（这是「库→画布」方向，
//   不是用户改动）。用这个标记把该次回抛排除，否则 canvasDirty 会被误置 true
//   → t1 场景（恢复后立刻关）就会走权威写 → 脏数据又回灌。
//   看内容判断不可靠（恢复前后内容可能完全相同），故用「短窗口锁定」。
// ===== [SECTION:sceneApplyLock] =====
let sceneApplyLock = 0;
const SCENE_APPLY_LOCK_MS = 300;      // 只需覆盖 Vue→React→onChange 的帧级延迟

/**
 * 权威写：从库里读回权威数据，再用「这份数据」覆写 board 记录。
 *
 * 【为什么读-改-写】
 *   本函数只刷新 scene（恢复的元素），但 board 记录是**整条覆盖**的。
 *   若直接 saveBoard({ scene }) 而不带上 name/bounds/canvas，
 *   saveBoard 会走 `existing` 兜底 —— 那些字段能保住，但 appState 会被写成 `{}`
 *   （saveBoard 对 appState 是 `board.appState || {}`，没有 existing 兜底）。
 *   → 必须先 getBoard() 取出完整记录，避免「权威写顺手清掉 appState」。
 *
 * 【为什么先写库、再刷画布】
 *   setScene 会触发一次 onChange；先写库可保证此刻库已是最终状态，
 *   后续即使有延迟回抛，也不会把库改回旧值。
 *
 * @param {Array} [sceneOverride] 不传则用当前库里的 scene
 * @returns {Promise<{saved:boolean, reason?:string}>}
 */
// ===== [SECTION:persistBoardAuthoritative] =====
const persistBoardAuthoritative = async (sceneOverride = undefined) => {
  if (!boardId.value) return { saved: false, reason: 'no-board-id' };
  const current = await getBoard(boardId.value);
  const result = await saveBoard({
    boardId: boardId.value,
    fileId: safeFileId(),
    name: boardName.value,
    bounds,
    canvas,
    scene: Array.isArray(sceneOverride) ? sceneOverride
      : ((current && current.scene) || []),
    appState: (current && current.appState) || {}
  });   // ⚠️ 不传 baseUpdatedAt = 权威写，强制生效（可能覆盖更新的库版本，这是设计意图）
  if (result && result.saved) lastKnownUpdatedAt = result.updatedAt;
  return result;
};

// UIOptions：精简掉本项目用不到的入口（协作、库、导出图片等）
// ===== [SECTION:uiOptions] =====
const uiOptions = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    saveAsImage: true
  }
};

// ===== [SECTION:lastSyncText] =====
const lastSyncText = computed(() =>
  lastSyncAt.value ? new Date(lastSyncAt.value).toLocaleTimeString('zh-CN') : ''
);

// ---------- 🧩 面板数据（块 3/4 新增，2026-10-06）----------
// 数据源 registeredList：由 refreshRegisteredList() 从
//   elementSync.getRegisteredElements(safeFileId()) 填充，内容 = annotations 表完整记录。
//
// 【字段同构性已核实】面板（LayerListPanel / InfoPanel）需要的字段白板 annotation 全部具备：
//   id / title / objectName / group / lat / lng  → buildAnnotation（elementSync.js:181-200）
//   wbElementId                                  → :192 恒写 element.id
// ⚠️ layerRef 不存在（Excalidraw 元素不是 Leaflet 图层），不注入：
//   面板的「点击图层」路径在白板侧用不到，定位统一走 @locate 事件 + wbElementId。
// ===== [SECTION:wbPanelLayers] =====
const wbPanelLayers = computed(() =>
  registeredList.value.map(item => ({
    ...item,
    // 🔑 wbElementId 是「面板 ↔ 画布元素」的唯一桥：
    //   列表定位（whiteboardLocate → scrollToElement）与画布点选反查（syncSelectedToInfoPanel）
    //   都靠它。库中恒存在（rebuildIdMap 就是靠它重建映射，elementSync.js:71-76），
    //   这里做一次兜底只是为了防御历史脏数据。
    wbElementId: item.wbElementId || null
  }))
);

// 分组名：白板自建分组（'默认' + annotations 里出现过的所有非空 group，去重）
// （PresetGroups / 热点等由 LayerListPanel 内部自行补齐，此处只管白板数据）
// ✅ 直接读库值即可：elementSync 更新分支现已同步 customData.group → annotations.group
//    （见 elementSync.js 更新分支的「分组同步」注释），无需再垫一层画布侧覆盖值。
// ===== [SECTION:wbPanelGroups] =====
const wbPanelGroups = computed(() => {
  const set = new Set(['默认']);
  registeredList.value.forEach(l => {
    const g = String(l.group || '').trim();
    if (g) set.add(g);
  });
  return Array.from(set);
});

// ---------- 元素同步 ----------

// 防抖：Excalidraw 的 onChange 在拖拽时会高频触发，不能每次都写库
// ===== [SECTION:scheduleSync] =====
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

// ===== [SECTION:runSync] =====
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
      //   注意：这是**调用侧新增的额外条件**，elementSync 内部的 allowDelete 门控
      //   一行未动，仍是防误删的最后一道保险（两层独立防护，不相互替代）。
      //
      // 🩹 第 6 轮修正（2026-10-07，DeepSeek 裁决）：
      //   ❌ 旧值 `alive.length > 0` 是**错的** —— 它把两种情况混为一谈：
      //        · 首帧空回抛（**应禁止**）：Excalidraw 还没消化 initialData，从未见过非空
      //        · 用户删光（**应允许**）：之前必然见过非空，此时 alive.length 恰好也是 0
      //      结果「删光所有元素」→ alive.length===0 → allowDelete:false → 删除被静默吞掉 💥
      //   ✅ 正确判据是 firstNonEmptyChangeSeen（「Excalidraw 已消化完 initialData」的唯一可靠证明）：
      //        · 从未见过非空 → false → allowDelete:false → 首帧空回抛不误删 ✅
      //        · 用户删光     → true  → allowDelete:true  → 正确归档进回收站 ✅
      //      与闸门③ 的置位语义完全一致（闸门③ 保证它只在「首次见到非空」时置 true）。
      //   ⚠️ 闸门③ 的拦截条件（:320-329）**一字未动** —— 它才是「首帧空回抛」的唯一防线：
      //      进入本行时若 firstNonEmptyChangeSeen===false，说明闸门③ 已判定不存在误删风险。
      allowDelete: firstNonEmptyChangeSeen
    });
    stats.registered = idMap.size;
    stats.skipped = result.skipped;
    lastSyncAt.value = Date.now();
    // 🛡️【缺陷 2 修复（2026-10-07）】元素级增量已落库（annotations/documents/recyclebin），
    //   但 board.scene 的落库仅在 onBeforeUnmount / restoreElementsToBoard / 清理工具。
    //   本轮同步完成后，画布上的元素状态已被持久化 → 清掉脏标记，
    //   避免「改了又改回原样」之类的场景仍触发 onBeforeUnmount 的写入。
    //
    // 🆕【第 2 步 D 修正（2026-10-08）】上面「直接置 false」在 D 落地后**必须改为累积式**。
    //   ❌ 旧写法 `canvasDirty = false` 的致命链（DeepSeek 指出，已复现确认）：
    //     ① 用户删 A → runSync#1 → prunedIds=['A'] → 需置 canvasDirty=true ✅
    //     ② runSync#1 末尾调 updateScene 剔画布元素 → **触发 onChange**（第 2 次）
    //     ③ 800ms 后再 runSync#2 → A 已不在画布/不在 idMap → prunedIds=[] 
    //     ④ 若此处无条件写 false ⇒ canvasDirty 被刷回 false ❌
    //     ⑤ 用户切走 → canvasDirty=false → 走【乐观写】→ 旧快照（含 A）回灌
    //        ⇒ **剔除结果被抹掉 ⇒ D 完全白做** 💥
    //   ✅ 正确语义：**canvasDirty 是「画布是否与库不一致」的累积标记**——
    //       只由「落库动作」清零，同步动作**只能标脏、不能清脏**。
    //       （合法清零点仅剩 3 处：onMounted 加载后 / refreshDataFromDB 两处回灌后）
    //   ⚠️ 绝不可改回 `canvasDirty = false` / `canvasDirty = prunedIds.length > 0`。
    if ((result.prunedIds || []).length > 0) {
      canvasDirty = true;
    }

    // 🆕【第 2 步 D · 让画布与回收站收敛】把本轮「已完整入档」的元素从**画布内存**剔除。
    //   为什么必须在这里剔（不能只在 elementSync 里剔）：
    //     syncScene 是纯数据层函数，拿不到画布 API（详见 elementSync.js D 块注释）。
    //   为什么用 getApi().updateScene 而不是 setScene()：
    //     · setScene → applyScene 会**一并重放 appState** + 全量 toSafeElements 净化 + 整体替换
    //     · 我们只想「减掉几个元素」⇒ updateScene({elements}) 精准且不动 appState
    //     · 与 excalidrawBridge.js:261（applyScene 内部）**完全同一用法**，本项目已验证
    //   ⚠️ 从 api.getSceneElements()【实况】过滤，**不用 list** ——
    //     list 是本轮 runSync 的**入口快照**，期间用户可能又新增了元素；
    //     用实况读出的最准，杜绝误删并发新增的元素。
    //   ⚠️ updateScene 会**回抛 onChange** ⇒ 再触发一次防抖 runSync（此时 prunedIds=[] 自然收敛）
    //     ⇒ 上面的累积式 canvasDirty 正是为此而设，**两条修正互相咬合，缺一不可**。
    //   ⚠️ 白名单剔除：只剔 prunedIds 里的 id，**绝不** blanket filter(e => !e.isDeleted)。
    if (Array.isArray(result.prunedIds) && result.prunedIds.length > 0) {
      try {
        const api = boardRef.value?.getApi ? boardRef.value.getApi() : null;
        if (api && typeof api.getSceneElements === 'function' && typeof api.updateScene === 'function') {
          const drop = new Set(result.prunedIds);
          const before = api.getSceneElements();
          const next = before.filter(e => !(e && drop.has(e.id)));
          if (next.length < before.length) {
            api.updateScene({ elements: next });
            console.log(`[WhiteboardTool] D：已从画布剔除 ${before.length - next.length} 个已归档元素（${before.length} → ${next.length}）`);
          }
        } else {
          console.warn('[WhiteboardTool] D：画布 API 不可用，跳过剔除（画布保留残留，不影响数据安全）');
        }
      } catch (e) {
        // 剔除失败不影响数据安全（元素已入档；只是画布多留了几个 isDeleted 残影）
        console.warn('[WhiteboardTool] D：剔除画布元素失败（已忽略）:', e);
      }
    }
    await refreshRegisteredList();
  } catch (e) {
    console.error('[WhiteboardTool] 元素同步失败:', e);
  } finally {
    syncing.value = false;
  }
};

// ===== [SECTION:syncNow] =====
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

// ===== [SECTION:refreshRegisteredList] =====
const refreshRegisteredList = async () => {
  try {
    const list = await getRegisteredElements(safeFileId());
    registeredList.value = list;
  } catch (e) {
    registeredList.value = [];
  }
  // 🧪【临时监控日志，2026-10-07】仅用于排查「画布看到 4 个 / 实际登记 6 个」的坐标重叠假设。
  //   开关：控制台执行 `window.__WB_MONITOR__ = true` 即开启（默认关闭，不影响正常使用）。
  //   输出每个登记元素在**画布坐标系**下的位置与尺寸（wbX/wbY/wbW/wbH）+ 反算的经纬度。
  //   ⚠️ 用途仅为观察，不改任何逻辑；排查结束后应整块移除（见 MEMO 待办）。
  if (window.__WB_MONITOR__) {
    console.log('[监控] 场景快照:');
    registeredList.value.forEach(item => {
      console.log(item.id, 'wbX=' + item.wbX, 'wbY=' + item.wbY, 'wbW=' + item.wbW, 'wbH=' + item.wbH, 'lat=' + item.lat, 'lng=' + item.lng);
    });
  }
};

// ===== [SECTION:safeFileId] =====
const safeFileId = () => props.fileId || 'legacy-file';

/**
 * 🛡️【C 方案】从库里读出的 scene 在送进画布前，先做元素完整性校验。
 *
 * 【为什么必须做（2026-10-07 事故，MEMO 坑#14）】
 *   降级重建路径曾产出 `type:'text'` 却无 `text`/`fontFamily` 的畸形元素 →
 *   写进 board.scene → 下次加载时 Excalidraw 渲染它抛 TypeError →
 *   **React error boundary 捕获 → 整个画布组件树不再更新 → 画布永久挂起**
 *   （「正在加载绘图...」不恢复），且用户连「选中+Delete」自救路径都没有。
 *
 * 【设计原则】画布必须对「坏元素」免疫，而不是假设「坏元素不存在」。
 *   单个元素的残缺，绝不能拖垮整块画布。
 *
 * 【行为】
 *   · 残缺元素**从返回数组中剔除** → 不进 initialData → 画布正常渲染其余元素
 *   · 缺损详情 `console.warn` 列出（id + type + 缺的字段），便于定位数据来源
 *   · ⚠️ **不写库、不删 annotations** —— 元素记录仍在信息数据库可见，
 *     用户可自行决定是否清理（真删要走正常 UI，如信息数据库 / 图形列表）
 *
 * @param {Array} rawScene - board.scene（可能含残缺元素）
 * @returns {Array} 可安全渲染的元素数组
 */
// ===== [SECTION:sanitizeSceneFromDB] =====
const sanitizeSceneFromDB = (rawScene) => {
  const raw = Array.isArray(rawScene) ? rawScene : [];
  if (raw.length === 0) return [];
  const { safe, dropped } = filterBrokenElements(raw);
  if (dropped.length > 0) {
    // ⚠️ 用 console.warn（非 debug）：这是「护住画布」的安全哨兵，必须可见
    console.warn(
      `[白板] 🛡️ 已隔离 ${dropped.length} 个残缺元素（不入画布，防渲染崩溃）：`
    );
    dropped.forEach(d => {
      console.warn(`[白板]   - id=${d.id} type=${d.type} 缺字段=[${d.missing.join(', ')}]`);
    });
    console.warn('[白板] 这些元素在信息数据库中仍在，可手动清理；本条仅内存剔除，未改库。');
  }
  return safe;
};

// ---------- Excalidraw 事件 ----------

// ===== [SECTION:handleApiReady] =====
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
// 🧩 块 4：补上第 2 个参数 appState —— 画布点选联动的数据源。
//   桥接链已核实：excalidrawBridge.js:51 `onChange: (elements, appState) => emit('change', ...)`
//                → ExcalidrawBoard.vue:52 `emit('change', elements, appState)`
//   两处**本就在透传 appState**，故只需在此处接住，桥接层一行未改。
// ===== [SECTION:handleChange] =====
const handleChange = (elements, appState) => {
  console.debug('[诊断-HT] handleChange 收到:', Array.isArray(elements) ? elements.length : '(非数组)');
  // 🛡️【缺陷 2 修复（2026-10-07）】标记「画布有未落库改动」。
  //   用途：onBeforeUnmount 据此分流 ——
  //     canvasDirty=false → 乐观写（可被版本校验拒绝，防脏数据回灌）
  //     canvasDirty=true  → 权威写（用户真改了东西，必须保住，不能被拒）
  //   ⚠️ setScene 回灌期间 Excalidraw 也会回抛一次 onChange（库→画布方向），
  //      那不是用户改动 → 用 sceneApplyLock 短窗口排除，否则 t1 场景会被误判为 dirty。
  if (Date.now() - sceneApplyLock > SCENE_APPLY_LOCK_MS) {
    canvasDirty = true;
  } else {
    console.debug('[诊断-HT] handleChange → 属 setScene 回灌回抛，不置 canvasDirty');
  }
  // ① 元素同步（原有逻辑，一行未动）
  scheduleSync(elements);
  // ② 画布点选 → 信息栏联动（新增）
  syncSelectedToInfoPanel(appState);
};

// ---------- 🧩 画布点选 ↔ 信息栏 / 面板联动（块 4 新增）----------

/**
 * 画布选中 → 信息栏联动
 *
 * 【数据链】
 *   appState.selectedElementIds（形如 { 'elId': true, 'elId2': false }）
 *     → 取第一个 true 的 key（多选时取第一个，已定）
 *     → 用 wbElementId 反查 wbPanelLayers（**不依赖 idMap**，解耦）
 *     → WhiteboardPanels.selectLayer → InfoPanel.selectLayer（defineExpose，InfoPanel.vue:195）
 *     → InfoPanel.selectedLayer 更新 → 渲染「对象名称 / fields」
 *
 * 【🚨 边界：选中集合变空时**绝不**调 selectLayer(null)】
 *   InfoPanel.vue:173-174 首行即 `layer.objectName` → 传 null 立刻 TypeError。
 *   InfoPanel 自身已有「layer 从 layers 中消失才清空」的 watch（:189-193），
 *   退出选中时面板保持上次内容 —— 这是**有意保留**的行为，不是 bug。
 */
// ===== [SECTION:syncSelectedToInfoPanel] =====
const syncSelectedToInfoPanel = (appState) => {
  const sel = (appState && appState.selectedElementIds) || {};
  const firstId = Object.keys(sel).find(k => sel[k]);
  if (!firstId) return;   // ← 见上方边界说明：空选中直接返回，不清空面板
  if (!wbPanelsRef.value || typeof wbPanelsRef.value.selectLayer !== 'function') return;
  const layer = wbPanelLayers.value.find(l => l.wbElementId === firstId);
  if (!layer) return;
  wbPanelsRef.value.selectLayer(layer);
};

/**
 * 画布选中 → 富文本面板（P1-B 新增）
 *
 * 【数据链】（与 syncSelectedToInfoPanel 完全同源，只多一层 annotation 反查）
 *   ExcalidrawBoard onChange → appState.selectedElementIds
 *     → emit('selection-change', ids)（子组件内已做签名去重，见 ExcalidrawBoard.vue）
 *     → 此处取第一个 id（多选取第一个，与信息栏联动保持一致）
 *     → 用 wbElementId 反查 registeredList（annotations 全量记录）
 *     → 把 annotation 转成 MarkerDocPanel 需要的 node 形状
 *     → MarkerDocPanel 内部 getDocument(WB_TOOL_ID, fileId, node.id) 读富文本
 *
 * 【🚨 边界：清空选中时**必须**关面板】
 *   与信息栏（有意保留上次内容）不同：富文本面板是**编辑器**，若选中清空后仍留在屏幕上，
 *   用户会误以为还在编辑原元素；且 onBeforeUnmount 的兜底保存会对着旧 node 再写一次。
 *   故此处 ids 为空 ⇒ currentDocNode = null ⇒ v-if 卸载（卸载时会自动兜底保存，符合预期）。
 *
 * 【🚨 为什么 node.id 传 annotation id（WB.xxxxx）而不是画布 nanoid】
 *   documents 表的键是 (toolId, fileId, nodeId)，而地图侧写入用的就是 annotation id
 *   （saveAllLayers 的 layer.id）。白板要「打开信息数据库 → 点详情 → 看到同一份富文本」，
 *   必须共用同一把键 ⇒ 一律用 WB.xxxxx。画布 nanoid 只是桥（wbElementId）。
 *
 * 【🚨 为什么 node.type 传 annotation.type（wb-text / wb-rectangle）】
 *   1) 面板的样式块已由 hide-style-panel 隐藏，type 不再驱动样式分支 → 传什么都不影响 UI；
 *   2) 但底部「类型：xxx」信息行会展示它，传 annotation.type 与信息数据库显示一致；
 *   3) 绝不能传画布侧 type（rectangle/text 无 wb- 前缀会破坏红线「白板元素 type 必带 wb-」）。
 */
// ===== [SECTION:handleSelectionChange] =====
const handleSelectionChange = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    currentDocNode.value = null;
    return;
  }
  const firstId = ids[0];
  // 🔑 wbElementId 桥接：registeredList 来自 annotations 表，其中 wbElementId 恒等于画布元素 id
  const anno = registeredList.value.find(item => item && item.wbElementId === firstId);
  if (!anno) {
    // 未登记元素（例：刚画出、还在 800ms 防抖窗内）→ 不显示面板。
    // 不报错、不清空：保持与信息栏一致，等 runSync 登记后再点即出现。
    return;
  }
  const next = {
    id: anno.id,                      // annotation id（WB.xxxxx）—— documents 表的键
    type: anno.type,                  // 白板 annotation type（wb-text / wb-rectangle…）
    title: anno.objectName || anno.title || '',
    docHtml: anno.docHtml || '',      // 兜底：documents 表无记录时面板用这个
    lat: anno.lat,
    lng: anno.lng
  };
  // 同元素不重设：避免 MarkerDocPanel 的 watch(props.node) 因新对象而重跑
  //（重跑会「先保存旧 node 再读新 node」，同 id 时虽无副作用，但会多做一次 IO）
  if (currentDocNode.value && currentDocNode.value.id === next.id) {
    // 但标题可能在别处被改过（如信息栏改名）→ 就地同步可变字段，不换对象引用
    currentDocNode.value.title = next.title;
    return;
  }
  currentDocNode.value = next;
};

/** 面板右上角 ✕ → 关闭（不取消选中，下次点选同一元素仍会因 handleSelectionChange 重开） */
// ===== [SECTION:handleDocPanelClose] =====
const handleDocPanelClose = () => {
  currentDocNode.value = null;
};

/**
 * 面板标题变更 → 同步到 registeredList 的本地副本（**不写库**）
 *
 * 【为什么不写库】与 handleWbLayerUpdate 同一裁决：字段持久化的唯一链路是
 *   runSync → elementSync（含指纹去重）。这里直接写 annotations 会形成第二个写入口，
 *   且绕过指纹去重。标题的落库由下一次 runSync 通过 customData 镜像完成。
 * 【为什么只改本地副本】让「信息数据库 / 图形列表」在本轮刷新前也显示新名字，
 *   属于纯 UI 补齐；下次 refreshRegisteredList() 会从库读回权威值并覆盖。
 */
// ===== [SECTION:handleDocTitleUpdate] =====
const handleDocTitleUpdate = (payload) => {
  if (!payload || !payload.id) return;
  const target = registeredList.value.find(item => item && item.id === payload.id);
  if (target) target.objectName = payload.title;
  console.debug('[白板面板] 富文本标题已改（本地，等 runSync 落库）:', payload.id, '→', payload.title);
};

/**
 * 🆕【P2】状态栏「回到中心点」→ 视口对准全部活元素的外接框
 *
 * 【为什么走 centerToContent 而不是 getApi().scrollToContent()】
 *   ① 空场景必须**不动作**：scrollToContent([]) 行为未定义（可能把视口甩到原点）；
 *   ② 软删除过滤：Excalidraw 删元素只置 isDeleted=true，数组里仍在 →
 *      不过滤会把「已删空的白板」误判为有内容；
 *   ③ 这两个判定收在 ExcalidrawBoard.centerToContent 内部一处，
 *      外部只拿布尔结果，避免把画布细节散落到业务组件。
 *
 * 【为什么不做 loading/disabled】滚动画布是**同步**调用（animate 只是视觉过渡），
 *   不存在可观测的等待期，加禁用态反而会引入状态抖动。
 */
// ===== [SECTION:handleBackToCenter] =====
const handleBackToCenter = () => {
  const api = boardRef.value?.getApi?.();
  // 画布未就绪（懒加载中 / 已卸载）→ 静默返回，不抛错、不弹窗
  if (!api) return;

  const ok = typeof boardRef.value.centerToContent === 'function'
    ? boardRef.value.centerToContent()
    : false;

  if (!ok) {
    // 空白板 或 scrollToContent 不可用：提示但**不改变任何状态**
    console.debug('[白板] 回到中心点：无活元素或画布 API 不可用，未执行');
  }
};

/**
 * 列表双击 / 收藏夹定位 → 画布滚动到该元素
 * 【数据链】LayerListPanel emit('locate', item)（:303 双击 / :308 收藏夹）
 *   → WhiteboardPanels 上抛 → 此处 → boardRef.scrollToElement(wbElementId)
 * 【为什么不用 item.layerRef.openPopup()】
 *   白板侧元素不是 Leaflet 图层，**不存在 layerRef**（见 wbPanelLayers 注释）。
 *   因此走 ExcalidrawBoard.vue:77-86 现成的 scrollToElement（内部 api.scrollToContent）。
 */
// ===== [SECTION:whiteboardLocate] =====
const whiteboardLocate = (item) => {
  const wbElementId = item && item.wbElementId;
  if (!wbElementId || !boardRef.value || typeof boardRef.value.scrollToElement !== 'function') return;
  boardRef.value.scrollToElement(wbElementId);
};

/**
 * 信息栏「保存」→ v1 是 **no-op**（不写库，避免双写绕过指纹去重）
 *
 * 【载荷形态已核实】InfoPanel.vue:202 `emit('update-layer', { ...updatedLayer, toolId })`
 *   → 载荷是「改过的图层对象 + toolId」，不是 { id }，故下面日志取 payload.id 是取 annotation id。
 *
 * 【为什么不写库】字段持久化的唯一链路是 runSync → elementSync（含指纹去重）；
 *   白板侧再开一个写库入口会造成双写。若将来要让信息栏改名立刻反映到画布显示名，
 *   应在这里补 customData 镜像（走 mutateElement + updateScene），而不是直接写 annotations。
 */
// ===== [SECTION:handleWbLayerUpdate] =====
const handleWbLayerUpdate = (payload) => {
  console.debug('[白板面板] update-layer（v1 不写库，走 runSync 单一入口）:', payload && payload.id);
};

/**
 * 分组过滤 → v1 是 **no-op**
 * 【依据】地图侧 handleFilterGroup → applyDisplayForView（BaseMapTool.vue:893-896），
 *   它操作的是 Leaflet 的 editableLayers 容器；白板画布无对应「图层显隐」概念。
 *   v1 范围已明确排除「分组过滤联动（画布↔面板↔列表）」→ 只记日志。
 */
// ===== [SECTION:handleWbFilterGroup] =====
const handleWbFilterGroup = (group) => {
  console.debug('[白板面板] filter-group（v1 不联动画布）:', group);
};

/** 新增分组：v1 只在 UI 层生效（分组名由 wbPanelGroups 从 annotations 派生，不单独存分组表） */
// ===== [SECTION:handleWbAddGroup] =====
const handleWbAddGroup = (name) => {
  console.debug('[白板面板] add-group:', name);
};

/** 删除分组：v1 同上，no-op（不批量改 annotations.group，避免绕过 syncScene 指纹去重） */
// ===== [SECTION:handleWbRemoveGroup] =====
const handleWbRemoveGroup = (name) => {
  console.debug('[白板面板] remove-group:', name);
};

/**
 * 分组改名（白板侧）：把该组内**全部**画布元素的 customData.group 改成新名。
 *
 * 【载荷形态】LayerListPanel emit('rename-group', { oldName, newName })
 *
 * 【与 handleWbUpdateGroup 的关系】
 *   后者是「单个元素改组」，本函数是「整组改名」——
 *   二者共用同一条落地链：customData.group →（800ms 防抖）runSync → annotations.group。
 *   故此处同样**不手动调 runSync**（避免在唯一入口外另开入口），
 *   批量改完只调一次 updateScene + refreshRegisteredList()。
 *
 * 【为什么批量合并成一次 updateScene】
 *   逐个 updateScene 会触发 N 次 onChange → N 次防抖重排，且 undo 栈被拆成 N 步。
 *   合并成一次 = 一次重绘 + 一条 undo 记录。
 */
// ===== [SECTION:handleWbRenameGroup] =====
const handleWbRenameGroup = ({ oldName, newName }) => {
  const trimmed = (newName == null ? '' : String(newName)).trim();
  if (!oldName || !trimmed || trimmed === oldName) return;

  // 只处理「有对应画布元素」的组内成员（无 wbElementId 者本就无法在画布上改名）
  const targets = wbPanelLayers.value.filter(l => (l.group || '默认') === oldName);
  const idMap = new Map();
  targets.forEach(l => { if (l.wbElementId) idMap.set(l.wbElementId, l); });
  if (idMap.size === 0) return;

  const el = boardRef.value?.getApi?.() || api.value;
  if (!el || typeof el.getSceneElements !== 'function' || typeof el.updateScene !== 'function') {
    console.warn('[白板面板] 改分组名失败：画布 API 未就绪');
    return;
  }

  const current = el.getSceneElements();
  let changed = 0;
  const next = current.map(e => {
    if (!e || !idMap.has(e.id)) return e;
    const item = idMap.get(e.id);
    const nextCustom = {
      ...(e.customData || {}),
      // customData 只镜像 { name, group }（与 handleWbUpdateGroup 同约束）
      name: (e.customData && e.customData.name) || item.title || item.objectName || '',
      group: trimmed
    };
    changed++;
    // ⚠️ mutateElement（MEMO R5）：只改引用、不触发重绘，故必须紧跟 updateScene
    return mutateElement(e, { customData: nextCustom });
  });
  if (changed === 0) return;

  el.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });

  // 列表立刻反映（只读库、不写库 → 不构成第二个写入口）
  refreshRegisteredList();
};

/**
 * 列表「删除」→ **只打 isDeleted 标记**，不从 scene 物理移除、不手动写回收站
 *
 * 【🚨 为什么必须这样（上一轮我写错了，此处是修正）】
 *   上一版做的是「先 moveToRecycleBin(..., null) 再 filter 物理移除」→ 恢复失效。
 *   失效链（已逐行核实）：
 *     ① 物理移除后元素**不在 scene** 里了；
 *     ② 下一次 onChange → runSync 删除分支（elementSync.js:260-295）自己会调
 *        `moveToRecycleBin`（:281），其第 5 参 `wbElementRaw` 取自
 *        `rawById`（:265-266）= **由当前 scene 列表建立的索引**；
 *        元素已被我移除 → `rawById.get(elementId)` = **undefined** → 传 null；
 *     ③ 恢复时（elementSync.js:517-544）：
 *        · 情况 1（:521-529）要求「元素仍在 scene 且 isDeleted」→ 已被我移除，进不去；
 *        · 情况 2（:534-541）要求 `rawMap.get(elementId)` 有值 → 是空 Map，进不去；
 *        · 于是落 `result.missing`（:543）→ 画布上**什么都不出现**。
 *   ⇒ 我上轮注释里写的「先改画布会被 onChange 抢跑导致回收站拿不到快照」**不成立**：
 *     rawById 就是从 scene 建的索引，物理移除才是拿不到 raw 的真正原因。
 *
 * 【正确做法：只打标记】
 *   保持元素留在 scene 数组里、仅置 isDeleted=true（Excalidraw 便不再渲染它）。
 *   随后 runSync 删除分支按「集合差」判定删除 → 正确带 wbElementRaw 入回收站；
 *   恢复时命中**情况 1**（擦除 isDeleted 标记）→ 元素真正回到画布。
 *
 * 【🚨 唯一入口原则】
 *   删除的判定与落库**唯一入口**是 runSync 的 allowDelete 门控（MEMO 坑#16）。
 *   此处只改画布、不写库 → 不构成第二个删除入口。
 *   ❌ 不要在这里补传 wbElementRaw，也不要在恢复侧改「物理重建」。
 *
 * 【载荷形态】LayerListPanel.vue:278 `emit('delete-layer', m)`，m 是列表项完整对象
 *   （`{ ...annotation, wbElementId }`）→ 确实带 wbElementId / id / lat / lng。
 *   ⚠️ 与 `update-layer-group` 的载荷形态**不同**（后者是 `{ id, group }` 且无 wbElementId），
 *      两者不可互换处理。
 */
// ===== [SECTION:handleWbDeleteElement] =====
const handleWbDeleteElement = (item) => {
  const wbElementId = item && item.wbElementId;
  if (!item || !item.id || !wbElementId) return;

  const el = boardRef.value?.getApi?.() || api.value;
  if (!el || typeof el.getSceneElements !== 'function' || typeof el.updateScene !== 'function') {
    console.warn('[白板面板] 删除失败：画布 API 未就绪');
    return;
  }

  // 🚨 只打 isDeleted 标记：不物理移除、不手动写回收站。
  //   Excalidraw 对 isDeleted=true 的元素不渲染，视觉上等同「已删除」。
  //   后续 runSync 会把它正确归档进回收站（含 wbElementRaw），恢复时走情况 1。
  const next = el.getSceneElements().map(e => {
    if (e && e.id === wbElementId) {
      return { ...e, isDeleted: true, updated: Date.now() };
    }
    return e;
  });
  el.updateScene({
    elements: next,
    appState: { selectedElementIds: {} },   // 防止选中态残留在已删除元素上
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  });
  console.debug('[白板面板] 已标记删除（等待 runSync 归档进回收站）:', wbElementId);
};

/**
 * 列表「改组」→ 分组双写（customData 镜像 + 画布刷新）
 *
 * 【为什么必须走 mutateElement + updateScene（MEMO R5 硬约束）】
 *   mutateElement.d.ts 明确「does not trigger re-render」——
 *   它只改对象引用，Excalidraw 不会重绘、也不会触发 onChange。
 *   → 必须紧接一次 updateScene({ elements, captureUpdate: IMMEDIATELY }) 才会落画面。
 *
 * 【customData 只镜像 { name, group }】
 *   fields（500 个空槽的对象）**留在 annotations 表**，不进 scene JSON：
 *   500 × N 元素会把场景体积放大到不可接受，且 fields 本就是库侧信息。
 *
 * 【为什么不触发指纹去重误判】
 *   buildFingerprint 的 payload 不含 group（elementSync.js）→
 *   改分组不会被判为「内容变更」而注销重建指纹，走的是纯 UI 层变更。
 */
// ===== [SECTION:handleWbUpdateGroup] =====
const handleWbUpdateGroup = (payload) => {
  // 🚨 载荷形态已核实：LayerListPanel.vue:268 发出的是 `{ id, group }`，
  //   **id = annotation id（WB.00012），载荷里没有 wbElementId**！
  //   画布元素 id 是 Excalidraw 生成的独立 id，两者不同 → 必须经 wbPanelLayers 反查。
  //   （我上一版误以为载荷是列表项对象而直接取 payload.wbElementId，会静默 no-op。）
  const annotationId = payload && payload.id;
  const group = payload && payload.group;
  if (!annotationId) return;

  const layerItem = wbPanelLayers.value.find(l => l.id === annotationId);
  const wbElementId = layerItem && layerItem.wbElementId;
  if (!wbElementId) {
    console.warn('[白板面板] 改组失败：未找到该 annotation 对应的画布元素', annotationId);
    return;
  }

  const el = boardRef.value?.getApi?.() || api.value;
  if (!el || typeof el.getSceneElements !== 'function' || typeof el.updateScene !== 'function') {
    console.warn('[白板面板] 改组失败：画布 API 未就绪');
    return;
  }
  const current = el.getSceneElements();
  const elIndex = current.findIndex(e => e && e.id === wbElementId);
  if (elIndex === -1) {
    console.warn('[白板面板] 改组失败：画布上没有该元素', wbElementId);
    return;
  }
  const target = current[elIndex];

  const nextCustom = {
    ...(target.customData || {}),
    // customData 只镜像 { name, group } —— fields 留在 annotations 表，
    // 否则 500 个空槽对象 × N 元素会把 scene JSON 放大到不可接受
    name: (target.customData && target.customData.name) || layerItem.title || layerItem.objectName || '',
    group: group == null ? '' : String(group)
  };
  // ⚠️ 用 mutateElement（MEMO R5）：它只改引用、不触发重绘，故必须紧跟 updateScene
  const patched = mutateElement(target, { customData: nextCustom });
  const next = current.slice();
  next[elIndex] = patched;
  el.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });

  // 🚨 此处**不**手动调 runSync。
  //   上一版写了 `await runSync(boardRef.getScene().scene)`，属「多此一举」，已移除，理由有三：
  //   ① updateScene 本身就会触发 onChange（captureUpdate 只影响 undo 栈捕获，不影响 onChange），
  //      而 onChange → scheduleSync 已有 800ms 防抖同步 → 手动再同步一次 = **重复触发 runSync**，
  //      既浪费（每次改组都全量重建指纹）又可能并发交错。
  //   ② 与 handleWbDeleteElement 是**同一类错误**：面板侧手动调用底层同步/落库函数，
  //      等于在「唯一入口」之外另开一个入口（删除侧已按裁决回滚，这里一并统一）。
  //   ③ 一致性不依赖它：防抖同步跑完后 refreshRegisteredList() 会刷新列表，
  //      customData.group → annotations.group 由 elementSync 统一处理。
  //   → 要让 UI 立刻反映，正确做法是等下一次 runSync，而不是在这里抢跑。
  //   ④ 但列表必须立刻反映（否则用户以为改组失败）→ 主动刷一次列表。
  //      ⚠️ 这里**只读库、不写库**，不构成第二个写入口：
  //      elementSync 更新分支现已同步 customData.group → annotations.group，
  //      故 refreshRegisteredList() 读到的就是新分组。
  //      （曾用「画布侧 override 缓存」垫过一层，现库值已正确 → 已按裁决移除，少一层隐患。）
  refreshRegisteredList();
  console.debug('[白板面板] 已改组:', wbElementId, '→', group);
};

// ===== [SECTION:locateElement] =====
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
// ===== [SECTION:docPreview] =====
const docPreview = ref(null);

// ===== [SECTION:openDoc] =====
const openDoc = async (item) => {
  if (!item) return;
  try {
    const html = await getDocument(WB_TOOL_ID, safeFileId(), item.id);
    if (html === null || html === undefined) {
      docPreview.value = {
        // 🚨【第 25 轮】兜底「未命名」，不再回退 item.id（不露技术 ID）
        name: item.objectName || item.title || '未命名',
        html: '<p style="color:#9ca3af;">该元素暂无富文本内容，可在右侧编辑器中补充。</p>'
      };
      return;
    }
    docPreview.value = {
      name: item.objectName || item.title || '未命名',
      html: String(html) || '<p style="color:#9ca3af;">暂无内容</p>'
    };
  } catch (e) {
    console.error('[WhiteboardTool] 读取富文本失败:', e);
    docPreview.value = { name: item.id, html: '<p style="color:#ef4444;">读取失败</p>' };
  }
};

// ---------- 地理范围设置 ----------

// ===== [SECTION:loadGeoForm] =====
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

// ===== [SECTION:saveGeoBasis] =====
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

// ===== [SECTION:resetGeoBasis] =====
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
    // 🛡️【缺陷 2 修复（2026-10-07）】记录版本基线：本次读到的库版本。
    //   onBeforeUnmount 的「乐观写」会带上它做 CAS 校验（库被别人改过则拒绝写入）。
    lastKnownUpdatedAt = (board && board.updatedAt) || undefined;
    canvasDirty = false;   // 刚加载，画布内容 = 库内容，无未落库改动

    // 3. 还原场景到画布
    // 🛡️【C 方案】先做元素完整性校验：剔除残缺元素，避免单元素毒死整个画布（MEMO 坑#14）
    initialScene.value = sanitizeSceneFromDB(board && board.scene);
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

  // ---------- 关闭前兜底保存（🛡️ 缺陷 2 修复：按 canvasDirty 分流）----------
  //
  // 【旧行为的问题】无条件用「画布实时快照」整体覆盖 board.scene：
  //   · t1 恢复后立刻关 → 画布旧快照回覆盖恢复后的新数据 → 元素回退 isDeleted=true
  //     → 下次 runSync 又写回收站 → 脏数据再生（本轮要修的根因）
  //   · t3 无操作关闭 → 白刷 updatedAt，无意义地把版本推高
  //
  // 【新行为】把「写」按画布是否有未落库改动分成两类（DeepSeek 第 17 轮 §一裁决）：
  //   · canvasDirty=false（画布无新改动）→ **乐观写**：传 baseUpdatedAt
  //       若库在此期间被别人改过（如恢复的权威写）→ boardStore 拒绝 → 不覆盖 ✅
  //       这正是 t1 的解：恢复已把库刷新，旧快照被拒，脏数据不再回灌。
  //   · canvasDirty=true（用户真改了画布）→ **权威写**：不传 baseUpdatedAt
  //       保证用户改动不被吞（t2）。⚠️ 代价：此时若库更新（恢复）会被覆盖 ——
  //       但这是**用户真实意图**优先，且该场景需「恢复后立刻又画了新东西再关」，概率极低。
  //
  // 另加 saving 互斥：若此时 refreshDataFromDB 的权威写正在进行，
  // 让路（不并发写同一条记录），避免「读-改-写」交错产生半新旧状态。
  try {
    if (saving) {
      console.warn('[WhiteboardTool] 检测到并发写入进行中，跳过卸载前保存');
      return;
    }
    const snap = boardRef.value?.getScene?.();
    if (!snap || !boardId.value) return;

    if (!canvasDirty) {
      // 🚪【放行优化】若基线未知（undefined，如 ensureDefaultBoard 未返回 updatedAt），
      //   乐观写会退化成「无条件覆盖」—— 那就等于旧行为，失去了修复意义。
      //   → 此时直接放弃写入：画布无改动，库里的内容**本来就是**权威版本，无需回写。
      //   ⚠️ 只有在「基线未知」时放弃；基线已知则正常走乐观写（保留 t3 的兜底语义）。
      if (lastKnownUpdatedAt === undefined) {
        console.log('[WhiteboardTool] 基线未知且画布无改动 → 跳过卸载前写入（无可回写内容）');
        return;
      }
      // 乐观写：带版本基线，库变过就自动放弃（防脏数据回灌）
      saving = true;
      try {
        const res = await saveBoard({
          boardId: boardId.value,
          fileId: safeFileId(),
          name: boardName.value,
          bounds,
          canvas,
          scene: snap.scene,
          appState: snap.appState
        }, { baseUpdatedAt: lastKnownUpdatedAt });
        if (res && res.saved) {
          lastKnownUpdatedAt = res.updatedAt;
          console.log('[WhiteboardTool] 卸载前乐观写成功');
        } else if (res && res.reason === 'stale') {
          console.warn('[WhiteboardTool] 🛡️ 卸载前写入被拒（库已更新，画布无改动）→ 已保留库版本');
        }
      } finally {
        saving = false;
      }
    } else {
      // 权威写：用户有未保存改动 → 必须保住
      saving = true;
      try {
        const res = await persistBoardAuthoritative(snap.scene);
        console.log('[WhiteboardTool] 卸载前权威写（画布有未落库改动）:', res && res.saved ? '成功' : '失败');
      } finally {
        saving = false;
      }
    }
  } catch (e) {
    console.warn('[WhiteboardTool] 卸载前保存失败:', e);
  }
});

// 供 GisApp（信息数据库 / 回收站恢复）调用：重新从库读元素
// ===== [SECTION:refreshDataFromDB] =====
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
        // 🛡️【C 方案】恢复回写同样走完整性校验（恢复的元素也可能是坏数据）
        const scene = sanitizeSceneFromDB(board.scene);
        // 🛡️【缺陷 2 修复（2026-10-07）】先把「画布即将被库数据替换」这一事实落库，
        //   再刷画布。理由：setScene 会触发一次 onChange 回抛，
        //   若此刻有并发的 onBeforeUnmount 写入，它会拿着旧快照覆盖。
        //   先写库 → 即使写入被旧快照覆盖，下面的基线也会因此变化而被 CAS 拒绝。
        //   ⚠️ 这一步同时承担「清理 isDeleted 残留」的职责（权威写不做任何过滤外的加工）。
        sceneApplyLock = Date.now();   // 开出回灌窗口：期间 onChange 不算用户改动
        const wRes = await persistBoardAuthoritative(scene);
        if (!wRes || !wRes.saved) {
          console.warn('[WhiteboardTool] 权威回写未成功:', wRes && wRes.reason);
        }
        boardRef.value.setScene(scene, board.appState || {});
        initialScene.value = scene;
        initialAppState.value = board.appState || {};
        stats.total = scene.filter(e => e && !e.isDeleted).length;
        // 回灌后画布 = 库（这段是唯一权威），此刻无未落库改动
        canvasDirty = false;
        // 🚨【防御层 1】恢复回写属于「权威数据」，必须显式重新打开同步开关，
        //   否则恢复的元素会因 canvasReady 仍为 false 而永远不同步。
        // 🩹 本轮：改用幂等入口，与另两个触发源共用同一套置位语义。
        armCanvasReady('回收站恢复回写（权威数据）');
      }
    }
    // 🛡️【缺陷 2 修复（2026-10-07）】本函数是「库 → 画布」的回灌入口：
    //   执行完后画布内容就是库内容（或至少库已是最新权威），故清掉脏标记。
    //   ⚠️ 放在外层而不是 setScene 分支内：即使 boardRef 未就绪（没走 setScene），
    //      「画布 = 库」的判断依然成立（画布上的元素本来就没变过）。
    //   ⚠️ 若回灌后用户又改动画布 → handleChange 会重新置 true，语义正确。
    canvasDirty = false;
  } catch (e) {
    console.warn('[WhiteboardTool] 刷新数据失败:', e);
  }
};

// 🤖【P1-A】AI 批量导入完成后的处理：把库里的新记录变成画布上的文字元素。
//
// 【为什么需要这一步】aiImporter 只负责写 annotations（数据层），
//   白板画布不会自动出现新元素 —— 必须有人「记录 → 元素」地补上，
//   否则用户导入了却看不到任何东西（数据与画面脱节）。
//
// 【执行顺序（不可颠倒，理由逐条）】
//   ① 读回 annotations（含刚导入的）→ 这是生成元素的**唯一数据源**
//   ② 算出已有元素 id 集合 → 用于**只补新增**，不重建已有元素（避免画面闪烁 + 丢选中态）
//   ③ recordToElement 逐条生成 + 过滤 null（坏元素在生成器里已被 validateElement 拦掉）
//   ④ setScene([...当前, ...新增]) → 整体替换画布
//   ⑤ rebuildIdMap → 让新元素立刻有编号映射（否则下次 runSync 会重复登记）
//
// 【为什么不走 syncScene / runSync】
//   runSync 的方向是「画布 → 库」，AI 导入的方向是「库 → 画布」，两者语义相反。
//   走 runSync 会先把画布里的新元素当「未登记」再登记一遍，产生重复记录。
//
// 【为什么 setScene 而非 updateScene】
//   这里是**追加**元素（画布内容会整体变化），且需要 initialScene 同步更新，
//   避免后续 watch(initialScene) 或回灌时把 AI 元素覆盖掉。
//   ⚠️ setScene 会触发一次 onChange 回抛 → 交给既有闸门③/防抖处理，无需特殊干预。
// ===== [SECTION:handleWbAiImported] =====
const handleWbAiImported = async () => {
  // 🔒 重入保护：并发进入时只登记「还需再跑一轮」，由正在跑的那次收尾时补跑。
  if (wbAiImportBusy) { wbAiImportPending = true; return; }
  wbAiImportBusy = true;
  try {
    if (!boardRef.value || !boardRef.value.setScene) return;

    // ① 读回最新记录（数据源）
    const records = await getRegisteredElements(safeFileId());
    if (!Array.isArray(records) || records.length === 0) return;

    // ② 当前画布已有元素（用于「只补新增」，不重建已有元素 → 不闪屏、不丢选中态）
    const api = boardRef.value.getApi ? boardRef.value.getApi() : null;
    const current = api && typeof api.getSceneElements === 'function'
      ? api.getSceneElements().filter(e => e && !e.isDeleted)
      : [];

    // ③ 只为「库里有、从未上过画布」的记录生成元素
    //   · 已有 wbElementId = 此前登记过（画布存在 → 无需处理；画布缺失 → 属恢复语义，
    //     交给回收站恢复路径处理，不在这里补，避免两条路径互相打架）
    //   · 无经纬度 = 无法定位，跳过
    const fresh = records.filter(r => {
      if (!r || !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng))) return false;
      return !r.wbElementId;
    });

    if (fresh.length === 0) {
      console.log('[WhiteboardTool] AI 导入：无新增记录需要补画布元素');
      return;
    }

    // ④ 生成元素（坏元素已被 recordToElement 内部拦掉）
    const made = [];
    for (const rec of fresh) {
      const el = recordToElement(rec, { bounds, canvas });
      if (el) made.push(el);
    }
    if (made.length === 0) {
      console.warn(`[WhiteboardTool] AI 导入：${fresh.length} 条记录均未能生成合法元素（坐标基准或字段问题）`);
      return;
    }

    const nextScene = [...current, ...made];
    boardRef.value.setScene(nextScene, initialAppState.value || {});
    initialScene.value = nextScene;          // 同步 ref，避免后续 watch/回灌覆盖
    stats.total = nextScene.length;
    canvasDirty = true;                      // 画布 ≠ 库（新元素尚未登记编号）→ 必须标脏

    // ⑤ 重建映射 + 刷新列表
    idMap = await rebuildIdMap(safeFileId());
    stats.registered = idMap.size;
    await refreshRegisteredList();
    await syncNow();                         // 立刻登记新元素（不等 800ms 防抖）

    console.log(`[WhiteboardTool] 🤖 AI 导入：已补 ${made.length} 个元素到画布` +
      (made.length < fresh.length ? `（${fresh.length - made.length} 条未生成，见上方告警）` : ''));
  } catch (e) {
    console.error('[WhiteboardTool] AI 导入后补画布失败:', e);
  } finally {
    wbAiImportBusy = false;
    // 期间有新导入事件积压 → 再补跑一轮（幂等：只补仍无 wbElementId 的记录）
    if (wbAiImportPending) {
      wbAiImportPending = false;
      handleWbAiImported();
    }
  }
};

// 🚨 T1 补丁：把刷新入口暴露到 window，供 RecycleBinModal 跨组件调用
//   理由：回收站弹窗由 GisApp 顶层渲染，拿不到白板实例引用（KeepAlive + 动态组件），
//        用轻量钩子比改造 GisApp 的 ref 传递链更安全（不触碰既有地图逻辑）。
// ===== [SECTION:registerRefreshHook] =====
const registerRefreshHook = () => {
  try {
    window.__wbRefreshHook = refreshDataFromDB;
  } catch (e) { /* 忽略 */ }
};

// ===== [SECTION:unregisterRefreshHook] =====
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

/* ==================== 移动端适配（2026-10-08 新增） ==================== */
/* 仅窄屏生效，桌面不受影响。 */
@media (max-width: 768px) {
  /* 顶部状态/按钮条：允许换行，按钮缩小 */
  .wb-status-bar { flex-wrap: wrap; row-gap: 6px; height: auto; padding: 6px 8px; }
  .wb-badge { font-size: 11px; }
  .wb-btn { font-size: 11px; padding: 4px 8px; }

  /* 右侧地理范围面板：改为覆盖式抽屉，避免挤压画布 */
  .wb-geo-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(300px, 86vw);
    z-index: 1200;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.15);
    padding: 10px;
  }

  /* 元素列表与文档预览：降低最大高度 */
  .wb-element-list { max-height: 40vh; }
  .wb-doc-body { max-height: 40vh; }

  /* 地理范围面板输入框：宽度自适应 */
  .wb-geo-panel input { width: 100%; max-width: 140px; }
}

@media (max-width: 480px) {
  .wb-status-bar { padding: 4px 6px; row-gap: 4px; }
  .wb-badge { font-size: 10px; }
  .wb-btn { font-size: 10px; padding: 3px 6px; }
  .wb-geo-panel { width: 92vw; }
}
</style>
