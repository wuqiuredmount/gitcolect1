<template>
  <MapPanel title="🤖 AI批量导入" :initialBottom="430" :initialCollapsed="true">
    <div class="ai-import-body">
      <div class="import-row">
        <label>数据文件：</label>
        <select v-model="selectedFile" @change="onFileChange" :disabled="importing">
          <option value="">-- 请选择 --</option>
          <option v-for="f in pendingFiles" :key="f" :value="f">{{ f }}</option>
        </select>
      </div>

      <div class="import-row">
        <button class="action-btn" @click="refreshAll" :disabled="importing">🔄 刷新列表</button>
        <button class="action-btn primary" :disabled="!canImport" @click="startImport">
          {{ importing ? '导入中...' : '▶ 导入选中' }}
        </button>
      </div>

      <div class="import-row">
        <button class="action-btn success" :disabled="importing || pendingFiles.length === 0" @click="startImportAll">
          ⚡ 一键导入全部（{{ pendingFiles.length }} 个待导入）
        </button>
      </div>

      <div class="import-row">
        <button class="action-btn warn" :disabled="importing" @click="handleCleanup">
          🧹 清理重复数据
        </button>
      </div>

      <div v-if="archivedFiles.length > 0" class="archive-box">
        <div class="archive-header">
          <b>📦 历史文件导入库</b>（{{ archivedFiles.length }} 个已归档）
          <button class="link-btn" :disabled="importing" @click="handleResetArchive">重置</button>
        </div>
        <!-- 🆕 按自然排序 + 序号分行显示：
             为什么不用 join('、')：文件数量多时会挤成一行，无法快速定位，也看不出顺序。
             序号用 1 起始的自然数，与「按序导入」的语义一致。 -->
        <ol class="archive-list">
          <li v-for="(fname, idx) in sortedArchivedFiles" :key="fname" class="archive-item">
            <span class="archive-index">{{ idx + 1 }}.</span>
            <span class="archive-name">{{ fname }}</span>
          </li>
        </ol>
      </div>

      <div v-if="preview" class="preview-box">
        <div><b>批次：</b>{{ preview.batchName || '(未命名)' }}</div>
        <div><b>分组：</b>{{ preview.group || 'AI导入' }}</div>
        <div><b>条数：</b>{{ (preview.items && preview.items.length) || 0 }}</div>
      </div>

      <div v-if="importing && progress.total > 0" class="progress-box">
        <div v-if="batchInfo" class="batch-info">{{ batchInfo }}</div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (progress.done / progress.total * 100) + '%' }"></div>
        </div>
        <div class="progress-text">{{ progress.done }} / {{ progress.total }} — {{ progress.current }}</div>
      </div>

      <div v-if="result" class="result-box">
        <div>✅ 成功导入 {{ result.imported }} 条（分组：{{ result.group }}）</div>
        <div v-if="result.duplicated > 0" class="dup-line">🔒 已存在跳过 {{ result.duplicated }} 条（身份证去重）</div>
        <div v-if="result.skipped > 0">⚠️ 跳过 {{ result.skipped }} 条</div>
      </div>

      <div v-if="allResult" class="result-box">
        <div><b>📊 全部导入完成</b></div>
        <div>共处理 {{ allResult.totalFiles }} 个文件，新增 {{ allResult.totalImported }} 条</div>
        <div v-if="allResult.totalDuplicated > 0" class="dup-line">🔒 已存在跳过 {{ allResult.totalDuplicated }} 条</div>
        <div v-if="allResult.archived" class="archive-note">📦 已移入历史文件导入库，待导入清单已腾空</div>
      </div>

      <div v-if="cleanupResult" class="cleanup-box">
        <div><b>🧹 清理完成</b></div>
        <div>移入回收站 {{ cleanupResult.removed }} 条重复数据</div>
        <div>当前保留 {{ cleanupResult.kept }} 条</div>
      </div>

      <div v-if="error" class="error-box">❌ {{ error }}</div>
    </div>
  </MapPanel>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import MapPanel from './MapPanel.vue';
import { importAiBatch } from '../../../../groups/geo/utils/aiImporter.js';
import { getImportedFiles, markFilesImported, resetImportedFiles } from '../../../../groups/geo/utils/importHistory.js';
import { getAllLayers } from '../../../../groups/geo/utils/annotationStore.js';
import { resetFingerprintBackfillFlag } from '../../../../groups/geo/utils/fingerprintStore.js';
import { cleanupDuplicates } from '../../../../groups/geo/utils/dedup.js';

const props = defineProps({
  toolId: { type: String, required: true },
  fileId: { type: String, default: 'legacy-file' }
});

const emit = defineEmits(['imported', 'changed']);

const BASE = '/ai-import';
const availableFiles = ref([]);      // manifest 全量
const archivedFiles = ref([]);       // 已归档（已导入）
const selectedFile = ref('');
const preview = ref(null);
const importing = ref(false);
const progress = ref({ done: 0, total: 0, current: '' });
const batchInfo = ref('');
const result = ref(null);
const allResult = ref(null);
const cleanupResult = ref(null);
const error = ref('');

// 🚨 待导入 = 全量 - 已归档
const pendingFiles = computed(() => {
  const archived = new Set(archivedFiles.value);
  return availableFiles.value.filter(f => !archived.has(f));
});

// 🆕 自然排序：让 batch-2 排在 batch-10 之前（字典序会反）
//   例：['x-batch-10','x-batch-2'] 字典序是 10 在前；自然排序是 2 在前。
//   用 localeCompare 的 numeric:true 选项，无需引第三方库。
const naturalCompare = (a, b) =>
  String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

// 🆕 已归档文件：按自然排序
const sortedArchivedFiles = computed(() =>
  [...archivedFiles.value].sort(naturalCompare)
);

// 🆕 待导入文件：按自然排序（用于「一键导入全部」的顺序）
const sortedPendingFiles = computed(() =>
  [...pendingFiles.value].sort(naturalCompare)
);

const canImport = computed(() => !!preview.value && !importing.value);

const loadManifest = async () => {
  error.value = '';
  try {
    const res = await fetch(`${BASE}/manifest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('manifest.json 不存在');
    const data = await res.json();
    availableFiles.value = Array.isArray(data) ? data : (data.files || []);
  } catch (e) {
    availableFiles.value = [];
    error.value = '未能读取 manifest.json，请确认 public/ai-import/ 下存在该文件';
  }
};

const loadArchived = async () => {
  try {
    archivedFiles.value = await getImportedFiles(props.toolId);
  } catch (e) {
    archivedFiles.value = [];
  }
};

const refreshAll = async () => {
  await loadManifest();
  await loadArchived();
};

const onFileChange = async () => {
  preview.value = null;
  result.value = null;
  allResult.value = null;
  cleanupResult.value = null;
  error.value = '';
  progress.value = { done: 0, total: 0, current: '' };
  if (!selectedFile.value) return;
  try {
    const res = await fetch(`${BASE}/${selectedFile.value}?t=${Date.now()}`);
    if (!res.ok) throw new Error('文件不存在或无法读取');
    preview.value = await res.json();
  } catch (e) {
    error.value = '读取失败：' + e.message;
  }
};

// 导入单个批次对象
const runImport = async (batchData) => {
  return await importAiBatch({
    toolId: props.toolId,
    fileId: props.fileId,
    batchData,
    onProgress: (done, total, name) => {
      progress.value = { done, total, current: name };
    }
  });
};

const startImport = async () => {
  if (!preview.value || !props.toolId) return;
  importing.value = true;
  error.value = '';
  result.value = null;
  allResult.value = null;
  cleanupResult.value = null;
  batchInfo.value = preview.value.batchName || selectedFile.value;
  progress.value = { done: 0, total: (preview.value.items && preview.value.items.length) || 0, current: '' };

  try {
    const r = await runImport(preview.value);
    result.value = r;
    emit('imported', r);
    emit('changed');
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    importing.value = false;
  }
};

// ==================== 渐进导入核心（2026-10-08 新增） ====================
// 需求：打开工具时，若「待导入清单」有数据，自动渐进导入全部，防止卡顿。
// 设计：
//   1. 逐文件串行，每个文件后显式让出主线程（yieldToMain），界面保持可交互。
//   2. runImportAllFiles 为无确认的核心逻辑，「手动」「自动」共用。
//   3. maybeAutoImportAll 带「每工具每会话仅一次」守卫，防重复触发。

// 🚨 让出主线程：setTimeout(0) 把后续逻辑排到下一个宏任务，
//    浏览器得以在间隙处理渲染与用户输入，从而避免卡顿。
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

// 🚨 自动导入守卫：记录本页面会话内已自动导入过的工具。
//    用模块级 Set（而非 sessionStorage）——刷新页面后重置，失败可自动重试；
//    同一会话内切换工具 / 组件重挂载则不会重复跑。
const autoImportDone = new Set();

// 🚨 一键导入全部（核心，无确认弹窗）：只处理「待导入」文件，完成后归档并腾空清单
// 🆕 按「自然排序后的序号」依次导入（避免 batch-10 排在 batch-2 之前）。
//   逐文件串行 + 指纹去重（importAiBatch 内部已做）⇒ 重复数据自动跳过。
const runImportAllFiles = async () => {
  const targets = [...sortedPendingFiles.value];
  if (!props.toolId || targets.length === 0) return;
  // 🚨 函数级重入保护：两个并发调用会在「指纹查询 → 指纹登记」之间产生竞态窗口，
  //   双方都查不到对方尚未登记的指纹 ⇒ 同批数据被插入两次。
  if (importing.value) return;

  importing.value = true;
  error.value = '';
  result.value = null;
  allResult.value = null;
  cleanupResult.value = null;

  let totalImported = 0;
  let totalDuplicated = 0;
  let filesDone = 0;
  const succeeded = [];
  const failed = [];

  // 🚨 认领策略（2026-10-08 二次修正）：改为「逐文件认领」。
  //
  //   历史演进：
  //     ① 最初：全部导入完成后才写归档 ⇒ 中途刷新时归档为空 ⇒ 下次全量重跑
  //        ⇒ 曾出现数据翻倍（5A 源 366 条，页面显示 732）。
  //     ② 上一次修复：循环前「预认领全部」⇒ 防住了重复，但引入新缺陷 ——
  //        认领已落盘而循环中途被打断（刷新 / 关闭 / HMR）时，未导入的文件
  //        因已被认领而永久留在「已归档」里，pendingFiles 为空 ⇒ **永不补跑**
  //        （实测：4173 归档 27 个文件，实际只导入 26 个，永久缺 20 条）。
  //     ③ 现在：**每个文件导入成功后立即认领该文件**。
  //        · 中途打断 ⇒ 未完成的文件未归档 ⇒ 下次启动自动补跑 ✅
  //        · 重复风险 ⇒ 由 importAiBatch 的指纹去重（findExistingFingerprints）兜底，
  //          已存在的条目会被计入 duplicated 跳过，不会产生重复数据 ✅
  //        · 失败项本就未归档，无需再「回滚」✅

  for (const fname of targets) {
    try {
      batchInfo.value = `[${filesDone + 1}/${targets.length}] ${fname}`;
      const res = await fetch(`${BASE}/${fname}?t=${Date.now()}`);
      if (!res.ok) throw new Error('文件读取失败');
      const data = await res.json();
      progress.value = { done: 0, total: (data.items && data.items.length) || 0, current: '准备中...' };

      const r = await runImport(data);
      totalImported += r.imported;
      totalDuplicated += (r.duplicated || 0);
      filesDone++;
      succeeded.push(fname);
      // 🚨 逐文件认领：导入成功即归档该文件，确保中断后剩余文件能被补跑。
      await markFilesImported(props.toolId, [fname]);
      emit('imported', r);
    } catch (e) {
      failed.push(`${fname}: ${e.message || e}`);
    }
    // 🚨 每个文件后让出主线程，防止连续导入造成界面卡顿
    await yieldToMain();
  }

  // 🚨 收尾：逐文件认领后，失败项**本就未被归档**，无需回滚。
  //   （原「回滚」逻辑随预认领一起退役，避免多余的读-清-写往返。）
  let archived = false;
  try {
    await loadArchived();
    archived = true;
    emit('changed');
  } catch (e) {
    console.warn('[AiImportPanel] 归档收尾失败:', e);
  }

  allResult.value = {
    totalFiles: targets.length,
    totalImported,
    totalDuplicated,
    archived,
    failed
  };
  if (failed.length) error.value = '部分文件失败：' + failed.join('；');
  importing.value = false;
};

// 🚨 一键导入全部（手动）：带二次确认，随后走同一套渐进逻辑
const startImportAll = async () => {
  const targets = [...sortedPendingFiles.value];
  if (!props.toolId || targets.length === 0) return;

  const ok = window.confirm(
    `即将依次导入 ${targets.length} 个文件。\n导入完成后，这些文件将移入「历史文件导入库」，待导入清单自动腾空。\n\n是否继续？`
  );
  if (!ok) return;

  await runImportAllFiles();
};

// 🚨 数据丢失自愈（2026-10-08 新增）：
//   现象：归档记录说「N 个文件已导入」，但数据库里几乎没有对应数据
//        （如热更新后 IndexedDB 被重置、5A 数据丢失）。
//        此时 pendingFiles 为空（都被归档挡住），用户无法恢复数据。
//   做法：对比「已归档文件数」与「数据库实际记录数」。若归档远大于数据，
//        判定为「归档孤儿」→ 清空归档 + 重置指纹回填标志，让文件回到待导入清单。
//   安全边界：仅在「数据库记录极少（< 归档文件数 × 5）」时才触发，
//        正常场景（每文件数十条）绝不会误判。
const healOrphanArchive = async () => {
  if (!props.toolId) return false;
  const archivedCount = archivedFiles.value.length;
  if (archivedCount === 0) return false;

  let layerCount = 0;
  try {
    const layers = await getAllLayers(props.toolId, null);
    layerCount = Array.isArray(layers) ? layers.length : 0;
  } catch (e) {
    console.warn('[AiImportPanel] 读取数据失败，跳过错配检查:', e);
    return false;
  }

  // 正常情况：每个文件至少含数条数据，总量应远大于文件数。
  // 若数据量 < 归档文件数 × 5，判定为归档孤儿。
  const threshold = archivedCount * 5;
  if (layerCount >= threshold) return false;

  console.warn(
    `[AiImportPanel] 检测到归档孤儿：归档 ${archivedCount} 个文件，` +
    `但数据库仅 ${layerCount} 条（阈值 ${threshold}）→ 重置归档以恢复导入能力`
  );
  try {
    await resetImportedFiles(props.toolId);
    await resetFingerprintBackfillFlag(props.toolId);
    await loadArchived();
    return true;
  } catch (e) {
    console.warn('[AiImportPanel] 归档自愈失败:', e);
    return false;
  }
};

// 🚨 自动导入（打开工具时触发）：无确认、渐进、每工具每会话仅一次
const maybeAutoImportAll = async () => {
  if (importing.value) return;                    // 已有导入在跑
  if (!props.toolId) return;                      // 无工具 id
  if (autoImportDone.has(props.toolId)) return;   // 本会话已自动导入过

  // 🚨 先做数据丢失自愈：若归档与数据严重不符，重置归档使文件回到待导入清单
  await healOrphanArchive();

  if (pendingFiles.value.length === 0) return;    // 无待导入数据

  autoImportDone.add(props.toolId);
  console.log(`[AiImportPanel] 检测到 ${pendingFiles.value.length} 个待导入文件，开始自动渐进导入…`);
  await runImportAllFiles();
  console.log('[AiImportPanel] 自动导入结束。');
};

// 🚨 清理重复数据
const handleCleanup = async () => {
  if (!props.toolId) return;
  const ok = window.confirm(
    '即将扫描全部图形，把「重复数据」移入回收站（软删除，可恢复）。\n每组重复只保留最早的一条。\n\n是否继续？'
  );
  if (!ok) return;

  importing.value = true;
  error.value = '';
  result.value = null;
  allResult.value = null;
  cleanupResult.value = null;
  batchInfo.value = '正在清理重复数据...';
  progress.value = { done: 0, total: 0, current: '' };

  try {
    const r = await cleanupDuplicates(props.toolId, {
      onProgress: (done, total, name) => {
        progress.value = { done, total, current: name };
      }
    });
    cleanupResult.value = r;
    emit('changed');
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    importing.value = false;
    batchInfo.value = '';
  }
};

// 🚨 重置归档（需要重新导入历史文件时使用）
const handleResetArchive = async () => {
  const ok = window.confirm('确定要清空「历史文件导入库」记录吗？\n清空后所有文件会重新出现在待导入清单中。');
  if (!ok) return;
  await resetImportedFiles(props.toolId);
  await loadArchived();
};

onMounted(async () => {
  await refreshAll();
  // 🚨 自动渐进导入（2026-10-08）：
  //   先 await refreshAll() 拿到 manifest 与归档记录，再异步触发导入。
  //   runImportAllFiles 内部逐文件 await + yieldToMain，首屏与交互不受阻塞。
  //   不 await 此调用，避免阻塞面板挂载完成。
  maybeAutoImportAll();
});
</script>

<style scoped>
.ai-import-body { display: flex; flex-direction: column; gap: 8px; width: 300px; font-size: 11px; }
.import-row { display: flex; align-items: center; gap: 6px; }
.import-row label { font-size: 11px; color: #555; white-space: nowrap; }
.import-row select { flex: 1; font-size: 11px; padding: 3px; border: 1px solid #ccc; border-radius: 3px; }
.action-btn { padding: 4px 10px; font-size: 11px; border: 1px solid #ccc; background: #f0f0f0; border-radius: 3px; cursor: pointer; }
.action-btn:hover { background: #e6f7ff; border-color: #1890ff; }
.action-btn.primary { background: #1890ff; color: #fff; border-color: #1890ff; }
.action-btn.primary:hover { background: #40a9ff; }
.action-btn.success { background: #52c41a; color: #fff; border-color: #52c41a; width: 100%; font-weight: bold; }
.action-btn.success:hover { background: #73d13d; }
.action-btn.warn { background: #fa8c16; color: #fff; border-color: #fa8c16; width: 100%; }
.action-btn.warn:hover { background: #ffa940; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link-btn { background: none; border: none; color: #1890ff; cursor: pointer; font-size: 10px; text-decoration: underline; margin-left: 6px; }
.preview-box, .result-box, .error-box, .progress-box, .archive-box, .cleanup-box { padding: 6px 8px; border-radius: 3px; background: #f9fafb; border: 1px solid #eee; font-size: 11px; line-height: 1.6; }
.result-box { background: #f6ffed; border-color: #b7eb8f; }
.error-box { background: #fff2f0; border-color: #ffccc7; color: #cf1322; }
.archive-box { background: #f0f5ff; border-color: #adc6ff; }
.archive-header { display: flex; align-items: center; gap: 4px; }
.archive-list {
  margin: 4px 0 0 0;
  padding: 0;
  list-style: none;
  font-size: 10px;
  color: #555;
  max-height: 120px;
  overflow-y: auto;
}
.archive-item {
  display: flex;
  gap: 6px;
  padding: 1px 0;
  line-height: 1.5;
}
.archive-item:hover { background: #e6f0ff; }
.archive-index {
  color: #888;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.archive-name { word-break: break-all; }
.archive-note { color: #1890ff; }
.cleanup-box { background: #fff7e6; border-color: #ffd591; }
.dup-line { color: #7c3aed; }
.batch-info { font-size: 10px; color: #1890ff; font-weight: bold; margin-bottom: 4px; }
.progress-bar { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
.progress-fill { height: 100%; background: #1890ff; transition: width 0.2s; }
.progress-text { font-size: 10px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
