<template>
  <div v-if="visible" class="recycle-overlay" @click.self="$emit('close')">
    <div class="recycle-modal">
      <div class="rc-header">
        <div class="rc-title">🗑️ 信息回收站</div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="rc-toolbar">
        <span>共 {{ items.length }} 条已删除数据</span>
        <div class="rc-actions">
          <button class="rc-btn" @click="loadItems">🔄 刷新</button>
          <button class="rc-btn ai" @click="toggleAiPanel">🤖 AI指令</button>
          <button class="rc-btn danger" :disabled="items.length === 0" @click="handleClearAll">🗑️ 清空回收站</button>
        </div>
      </div>

      <!-- 🤖 AI 指令执行区 -->
      <div v-if="showAiPanel" class="rc-ai-panel">
        <div class="rc-ai-row">
          <label>指令文件：</label>
          <select v-model="selectedCmd" :disabled="executing">
            <option value="">-- 请选择 --</option>
            <option v-for="f in cmdFiles" :key="f" :value="f">{{ f }}</option>
          </select>
          <button class="rc-btn" @click="loadCmdList" :disabled="executing">🔄</button>
          <button class="rc-btn ai" :disabled="!selectedCmd || executing" @click="executeCmd">▶ 执行</button>
        </div>
        <div v-if="cmdPreview" class="rc-ai-preview">
          <div><b>指令类型：</b>{{ cmdPreview.command }}</div>
          <div v-if="cmdPreview.toolId"><b>工具：</b>{{ getToolName(cmdPreview.toolId) }}</div>
          <div v-if="cmdPreview.target"><b>目标：</b>{{ describeTarget(cmdPreview.target) }}</div>
          <div v-if="cmdPreview.reason" class="rc-ai-reason">💡 {{ cmdPreview.reason }}</div>
        </div>
        <div v-if="cmdResult" class="rc-ai-result">{{ cmdResult }}</div>
        <div v-if="cmdError" class="rc-ai-error">❌ {{ cmdError }}</div>
      </div>

      <div class="rc-body">
        <table class="rc-table">
          <thead>
            <tr>
              <th style="width: 50px;">序号</th>
              <th style="width: 110px;">统一编码</th>
              <th>对象名称</th>
              <th style="width: 90px;">所属工具</th>
              <th style="width: 150px;">删除时间</th>
              <th style="width: 160px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in items" :key="item.id">
              <td>{{ index + 1 }}</td>
              <td>{{ item.annotationId }}</td>
              <td>{{ getItemName(item) }}</td>
              <td>{{ getToolName(item.toolId) }}</td>
              <td>{{ formatTime(item.deletedAt) }}</td>
              <td>
                <button class="rc-small-btn recover" @click="handleRecover(item)">恢复</button>
                <button class="rc-small-btn purge" @click="handlePurge(item)">彻底删除</button>
              </td>
            </tr>
            <tr v-if="items.length === 0">
              <td colspan="6" class="rc-empty">回收站为空</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="message" class="rc-message">{{ message }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { getAllRecycled, purgeFromRecycleBin, clearRecycleBin } from '../../groups/geo/utils/recycleStore.js';
import { appendLayers } from '../../groups/geo/utils/annotationStore.js';
import { saveDocument } from '../../groups/geo/utils/documentStore.js';
import { executeDataCommand } from '../../groups/geo/utils/aiDataCommand.js';
import { TOOL_META, TOOL_ORDER } from '../../groups/geo/utils/toolRegistry.js';
// 🖊️ 白板：恢复时同步还原画布元素（T1 修复）
import { restoreElementsToBoard } from '../../groups/whiteboard/utils/elementSync.js';
import { getAllBoards, WB_LEGACY_BOARD_ID, getBoard, saveBoard } from '../../groups/whiteboard/utils/boardStore.js';
import { getBounds, getCanvas } from '../../groups/whiteboard/utils/boardSettings.js';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'changed']);

const items = ref([]);
const message = ref('');

// 🤖 AI 指令执行区状态
const CMD_BASE = '/ai-import/commands';
const showAiPanel = ref(false);
const cmdFiles = ref([]);
const selectedCmd = ref('');
const cmdPreview = ref(null);
const cmdResult = ref('');
const cmdError = ref('');
const executing = ref(false);

const describeTarget = (t) => {
  const parts = [];
  if (Array.isArray(t.ids) && t.ids.length) parts.push(`ID: ${t.ids.join(', ')}`);
  if (t.nameKeyword) parts.push(`名称含「${t.nameKeyword}」`);
  if (t.fileId) parts.push(`文件: ${t.fileId}`);
  return parts.length ? parts.join(' / ') : '未指定';
};

const toggleAiPanel = () => {
  showAiPanel.value = !showAiPanel.value;
  if (showAiPanel.value && cmdFiles.value.length === 0) loadCmdList();
};

const loadCmdList = async () => {
  cmdError.value = '';
  try {
    const res = await fetch(`${CMD_BASE}/manifest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('命令清单不存在');
    const data = await res.json();
    cmdFiles.value = Array.isArray(data) ? data : (data.files || []);
  } catch (e) {
    cmdFiles.value = [];
    cmdError.value = '未找到命令清单（public/ai-import/commands/manifest.json）';
  }
};

const executeCmd = async () => {
  if (!selectedCmd.value) return;
  executing.value = true;
  cmdError.value = '';
  cmdResult.value = '';
  try {
    const res = await fetch(`${CMD_BASE}/${selectedCmd.value}?t=${Date.now()}`);
    if (!res.ok) throw new Error('指令文件读取失败');
    const command = await res.json();
    cmdPreview.value = command;

    const label = command.command === 'delete' ? '删除'
      : command.command === 'restore' ? '恢复'
      : command.command === 'purge' ? '彻底删除'
      : '读取';
    if (!confirm(`即将执行 AI 指令：${label}\n工具：${command.toolId ? getToolName(command.toolId) : '全部'}\n目标：${describeTarget(command.target || {})}\n\n是否继续？`)) {
      executing.value = false;
      return;
    }

    const r = await executeDataCommand(command);
    if (command.command === 'list-recycle') {
      cmdResult.value = `回收站共 ${r.affected} 条：\n` + (r.items || []).map(i => `  ${i.id} | ${i.name} | ${i.toolName}`).join('\n');
    } else if (command.command === 'list-perms') {
      cmdResult.value = (r.message || '') + (r.groups && r.groups.length ? `\n已授权分组：${r.groups.join('、')}` : '');
    } else {
      let txt = `✅ 执行完成，影响 ${r.affected} 条` + (r.names && r.names.length ? `\n${r.names.join('、')}` : '');
      // 🔒 权限拦截回报
      if (r.deniedCount > 0) {
        txt += `\n\n🔒 权限拦截：${r.deniedCount} 条未授权，已跳过`;
        if (r.deniedGroups && r.deniedGroups.length) txt += `\n未授权分组：${r.deniedGroups.join('、')}`;
        txt += `\n（如需允许 AI 删除，请在「探索和编辑分组」中开启对应分组的 🤖 按钮）`;
      }
      cmdResult.value = txt;
    }
    await loadItems();
    emit('changed');
  } catch (e) {
    cmdError.value = e.message || String(e);
  } finally {
    executing.value = false;
  }
};

const getItemName = (item) => {
  const layer = item.layer || {};
  return layer.objectName || layer.title || '未命名';
};

const getToolName = (toolId) => {
  return TOOL_META[toolId]?.name || toolId;
};

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch (e) {
    return iso;
  }
};

// 🚀 性能优化（方案 2）：7 个工具库来自**不同的 IndexedDB 库**，
//   彼此无锁竞争 → 可安全并发。旧版逐个 await 串行，开窗要等 7 轮事件循环往返。
//   ⚠️ 逐库 catch 兜底：任一库损坏/被占用都不能炸掉整个列表（退化为空数组）。
const loadItems = async () => {
  message.value = '';
  const lists = await Promise.all(
    TOOL_ORDER.map(toolId =>
      getAllRecycled(toolId).catch(e => {
        console.warn('[回收站] 读取工具失败:', toolId, e);
        return [];
      })
    )
  );
  const all = lists.flat();
  all.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  items.value = all;
};

// 🚀 性能优化（方案 3）：缓存局部更新。
//   旧版每次「恢复 / 彻底删除」后都调 loadItems()（= 7 库全量重查），只为从列表里去掉 1 行；
//   连续操作 N 条就是 7N 次库遍历，这才是卡顿主因。
//   现在改为纯内存过滤，操作后零库开销。
//   ⚠️ 直接修改数组元素（splice）而非重建数组，避免 Vue 丢失列表项身份导致整表重渲染。
const removeItemLocally = (item) => {
  const i = items.value.indexOf(item);
  if (i !== -1) items.value.splice(i, 1);
};

// 取当前白板编号（白板工具为单白板场景，与 WhiteboardTool 的 ensureDefaultBoard 同源）
const pickBoardId = async () => {
  try {
    const boards = await getAllBoards();
    return (boards[0] && boards[0].boardId) || WB_LEGACY_BOARD_ID;
  } catch (e) {
    return WB_LEGACY_BOARD_ID;
  }
};

// 取当前换算基准（bounds / canvas），用于 wbElementRaw 缺失时的近似重建
// 🚀 性能优化（方案 4）：bounds 与 canvas 来自同一白板设置表、互不依赖 → 合并并发读取，
//   把两次串行数据库往返压成一次。仅白板元素恢复时才会走到（地图元素直接 return null）。
const getRegisteredElementsWithBoard = async () => {
  let restored = null;
  try {
    const [bounds, canvas] = await Promise.all([getBounds(), getCanvas()]);
    restored = { bounds, canvas };
  } catch (e) {
    restored = null;
  }
  return { restored };
};

// 通知白板组件重建 idMap（若当前正打开白板）。GisApp 会把白板实例挂在 #wb-refresh-hook
const notifyWhiteboardRefresh = async () => {
  try {
    const hook = window.__wbRefreshHook;
    if (typeof hook === 'function') await hook();
  } catch (e) {
    console.warn('[回收站] 通知白板刷新失败:', e);
  }
};

// 🚨 T1+T2【核心修复】恢复时同步还原白板画布元素
// 背景：白板元素被删除时只是打 isDeleted 标记、物理上仍在 scene 数组里，
//   旧版恢复流程只把记录搬回 annotations/documents，**没碰 scene**，
//   导致下次 syncScene 又把它判定为「已删除」→ 二次进回收站（隐性循环）。
// 现在：恢复后按 wbElementId 擦除 scene 中的 isDeleted 标记（有 wbElementRaw 则精确补回），
//   再重建 element↔annotation 映射，使白板侧刷新后不会重复登记、也不会重复删除。
const restoreWhiteboardScene = async (item) => {
  const layer = item.layer || {};
  const elementId = layer.wbElementId;
  if (!elementId) return null; // 地图元素没有 wbElementId，直接跳过
  try {
    const boardId = await pickBoardId();
    const { restored } = await getRegisteredElementsWithBoard();
    const result = await restoreElementsToBoard(boardId, [elementId], {
      rawMap: item.wbElementRaw ? new Map([[elementId, item.wbElementRaw]]) : new Map(),
      bounds: restored?.bounds || null,
      canvas: restored?.canvas || null
    });
    // 🛡️【缺陷 1 · 第 1 步 E1（2026-10-07）】恢复流程的执行顺序调整
    //
    // 【背景】`restoreElementsToBoard` 内部原本有一句**裸写**：
    //     if (revived>0 || rebuilt>0) await saveBoard({...scene})
    //   它**不传 baseUpdatedAt** → 绕过 boardStore 的乐观并发控制（CAS）。
    //   由此产生一条**不可逆 + 静默**的数据丢失路径（详见 elementSync.js 内注释）：
    //     恢复算出的新 scene **没有落库**（走 missing 分支时）→ 库没变 →
    //     白板侧 onBeforeUnmount 的乐观写**基线匹配 → 写入成功** →
    //     旧快照带着 isDeleted=true 覆盖回去 → 元素永久消失，而 UI 显示「恢复成功」。
    //
    // 【E1 解法】裸写删除后，本函数必须**自己负责把 result.scene 落库**。
    //   ⇒ 调整顺序：**先写库（第 3 步）→ 再通知白板刷新画布（第 4 步）**。
    //   这样白板侧的 `refreshDataFromDB` 读到的就是**已含恢复元素的新 scene**：
    //     · 不再依赖「白板正开着」—— 白板没开时，库也已经是正确状态 ✅
    //     · 白板开着时，refreshDataFromDB 的 `persistBoardAuthoritative` 会再写一次
    //       （内容相同，幂等；但会推进 updatedAt，这是权威写的预期行为）✅
    //     · 不存在「库变了但白板侧基线没变」的时间窗 ⇒ 上述丢失链被切断 ✅
    //
    // ⚠️ 顺序不能反：若先 notify 后写库，白板会把**旧 scene** 灌进画布，
    //   且其内部权威写会用旧 scene 覆盖库 → 恢复的元素被抹掉。
    let persisted = null;
    try {
      persisted = await persistRestoredScene(boardId, result.scene);
    } catch (e) {
      console.warn('[回收站] 恢复场景落库失败（元素已回到 annotations，画布可能未更新）:', e);
    }
    // 让白板组件重建 idMap，避免下一次 onChange 把恢复的元素当成新元素重复登记
    await notifyWhiteboardRefresh();
    // 把落库结果附在返回值上，供 handleRecover 给出更准确的提示
    return { ...result, _persisted: persisted };
  } catch (e) {
    console.warn('[回收站] 白板场景还原失败（记录已恢复，画布需手动同步）:', e);
    return null;
  }
};

/**
 * 🛡️【缺陷 1 · 第 1 步 E1】把恢复后的 scene 以**权威写**落库
 *
 * 与 `WhiteboardTool.persistBoardAuthoritative` 同语义：**不传 baseUpdatedAt**
 * ⇒ 强制生效（恢复是权威动作，用户的恢复意图优先于一切）。
 *
 * ⚠️ 为什么不只传 scene：`boardStore.saveBoard` 对 `appState` 是
 *   `board.appState || {}`，**没有 existing 兜底** ⇒ 只传 scene 会把 appState 清成 `{}`。
 *   ⇒ 必须先 `getBoard()` 取完整记录再覆写。
 *
 * @param {string} boardId
 * @param {Array} scene - restoreElementsToBoard 算出的新场景
 * @returns {Promise<{saved:boolean, reason?:string}|null>}
 */
const persistRestoredScene = async (boardId, scene) => {
  if (!boardId || !Array.isArray(scene)) return null;
  const current = await getBoard(boardId);
  if (!current) return null;
  return await saveBoard({
    boardId,
    fileId: current.fileId,
    name: current.name,
    bounds: current.bounds,
    canvas: current.canvas,
    scene,
    appState: current.appState || {}
  });   // ⚠️ 不传 baseUpdatedAt = 权威写，强制生效
};

const handleRecover = async (item) => {
  try {
    if (!item.layer || !item.layer.id) {
      message.value = '该记录缺少图形数据，无法恢复';
      return;
    }
    // 1. 把图形搬回 annotations
    await appendLayers(item.toolId, item.fileId, [item.layer]);
    // 2. 把富文本搬回 documents
    if (item.docHtml) {
      await saveDocument(item.toolId, item.fileId, item.annotationId, item.docHtml);
    }
    // 3. 🖊️ 白板元素：同步把画布元素还原（擦除 isDeleted / 用 wbElementRaw 精确补回）
    //    ⚠️【E1】本步内部已负责把恢复后的 scene **落库**（权威写），
    //      返回的 `_persisted` 反映落库结果 ⇒ 下面的提示据此区分「真还原」与「落库失败」。
    const wbResult = await restoreWhiteboardScene(item);
    // 4. 从回收站移除
    await purgeFromRecycleBin(item.toolId, item.fileId, item.annotationId);
    let tip = `已恢复：${getItemName(item)}`;
    if (wbResult) {
      if (wbResult.revived > 0) tip += '（画布已精确还原）';
      else if (wbResult.rebuilt > 0) tip += '（画布已重建）';
      else if (wbResult.missing && wbResult.missing.length) tip += '（⚠️ 画布元素缺失，请回到白板检查）';
      // 🛡️【E1】落库失败必须明确告知 —— 否则用户会以为恢复已完全生效
      if (wbResult._persisted && wbResult._persisted.saved === false) {
        tip += '（⚠️ 场景落库未成功，请回到白板点「立即同步」）';
      }
    }
    message.value = tip;
    removeItemLocally(item);   // 🚀 方案 3：只从列表移除该行，不再全量 loadItems()
    emit('changed');
  } catch (e) {
    message.value = '恢复失败：' + (e.message || e);
  }
};

const handlePurge = async (item) => {
  if (!confirm(`确定要彻底删除「${getItemName(item)}」吗？此操作不可恢复！`)) return;
  try {
    await purgeFromRecycleBin(item.toolId, item.fileId, item.annotationId);
    message.value = '已彻底删除';
    removeItemLocally(item);   // 🚀 方案 3：局部移除
    emit('changed');
  } catch (e) {
    message.value = '删除失败：' + (e.message || e);
  }
};

const handleClearAll = async () => {
  if (!confirm('确定要清空回收站吗？所有已删除数据将永久丢失，不可恢复！')) return;
  try {
    for (const toolId of TOOL_ORDER) {
      await clearRecycleBin(toolId);
    }
    message.value = '回收站已清空';
    items.value = [];          // 🚀 方案 3：清空是全局操作，直接清空缓存
    emit('changed');
  } catch (e) {
    message.value = '清空失败：' + (e.message || e);
  }
};

// 🚨 开窗时机（关键，勿删）：方案 3 落地后，「每次操作后重载」这个隐式新鲜度保证已移除，
//   因此**必须在弹窗打开时无条件全量 loadItems()** —— 否则若回收站被其他入口写入
//   （如删除操作、AI 指令执行），上次关闭时的旧列表会在本次开窗被直接显示。
//   ⚠️ 这里**不能** emit('changed')：GisApp 把该事件接到 loadAllLayersFromDB()，
//      而它是「7 库 × N 图层 + 每图层一次 getDocument」的 N+1 全量重查，
//      开窗就触发会直接抵消本次性能优化的收益。仅用户实际增删后才通知。
watch(() => props.visible, (val) => {
  if (val) loadItems();
});
</script>

<style scoped>
.recycle-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; justify-content: center; align-items: center; }
.recycle-modal { width: 90vw; height: 75vh; max-width: 1000px; background: #fff; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
.rc-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #7c3aed; color: white; }
.rc-title { font-size: 16px; font-weight: bold; }
.close-btn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }
.rc-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px; background: #f8f9fa; border-bottom: 1px solid #eee; font-size: 12px; color: #666; }
.rc-actions { display: flex; gap: 10px; }
.rc-btn { padding: 4px 12px; font-size: 12px; cursor: pointer; background: #fff; border: 1px solid #1890ff; color: #1890ff; border-radius: 4px; transition: 0.2s; }
.rc-btn:hover { background: #e6f7ff; }
.rc-btn.danger { border-color: #e74c3c; color: #e74c3c; }
.rc-btn.danger:hover { background: #fee2e2; }
.rc-btn.ai { border-color: #7c3aed; color: #7c3aed; }
.rc-btn.ai:hover { background: #f3e8ff; }
.rc-ai-panel { padding: 10px 20px; background: #faf5ff; border-bottom: 1px solid #e9d5ff; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.rc-ai-row { display: flex; align-items: center; gap: 8px; }
.rc-ai-row label { font-size: 12px; color: #555; white-space: nowrap; }
.rc-ai-row select { flex: 1; font-size: 12px; padding: 4px; border: 1px solid #d8b4fe; border-radius: 3px; }
.rc-ai-preview { padding: 8px; background: #fff; border: 1px solid #e9d5ff; border-radius: 4px; line-height: 1.6; }
.rc-ai-reason { color: #7c3aed; margin-top: 4px; }
.rc-ai-result { padding: 8px; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 4px; white-space: pre-wrap; font-family: monospace; font-size: 11px; max-height: 120px; overflow-y: auto; }
.rc-ai-error { padding: 8px; background: #fff2f0; border: 1px solid #ffccc7; color: #cf1322; border-radius: 4px; }
.rc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 20px; }
.rc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rc-table th { background: #f8f9fa; padding: 10px; text-align: left; border-bottom: 2px solid #eee; position: sticky; top: 0; }
.rc-table td { padding: 10px; border-bottom: 1px solid #f0f0f0; }
.rc-table tbody tr:hover { background: #f9fafb; }
.rc-empty { text-align: center; color: #999; padding: 40px 0; }
.rc-small-btn { padding: 3px 10px; font-size: 11px; border-radius: 3px; cursor: pointer; margin-right: 5px; transition: 0.2s; }
.rc-small-btn.recover { border: 1px solid #52c41a; color: #52c41a; background: #fff; }
.rc-small-btn.recover:hover { background: #f6ffed; }
.rc-small-btn.purge { border: 1px solid #e74c3c; color: #e74c3c; background: #fff; }
.rc-small-btn.purge:hover { background: #fee2e2; }
.rc-message { padding: 8px 20px; background: #e6f7ff; border-top: 1px solid #91d5ff; font-size: 12px; color: #0050b3; }
</style>
