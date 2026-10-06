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
        <div>
          <b>📦 历史文件导入库</b>（{{ archivedFiles.length }} 个已归档）
          <button class="link-btn" :disabled="importing" @click="handleResetArchive">重置</button>
        </div>
        <div class="archive-list">{{ archivedFiles.join('、') }}</div>
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

// 🚨 一键导入全部：只处理「待导入」文件，完成后归档并腾空清单
const startImportAll = async () => {
  const targets = [...pendingFiles.value];
  if (!props.toolId || targets.length === 0) return;

  const ok = window.confirm(
    `即将依次导入 ${targets.length} 个文件。\n导入完成后，这些文件将移入「历史文件导入库」，待导入清单自动腾空。\n\n是否继续？`
  );
  if (!ok) return;

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
      succeeded.push(fname);   // 仅成功的才归档
      emit('imported', r);
    } catch (e) {
      failed.push(`${fname}: ${e.message || e}`);
    }
  }

  // 🚨 归档：把成功的文件记入历史库 → 待导入清单自动腾空
  let archived = false;
  if (succeeded.length > 0) {
    try {
      await markFilesImported(props.toolId, succeeded);
      await loadArchived();
      archived = true;
      emit('changed');
    } catch (e) {
      console.warn('[AiImportPanel] 归档失败:', e);
    }
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

onMounted(() => { refreshAll(); });
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
.archive-list { font-size: 10px; color: #555; max-height: 60px; overflow-y: auto; word-break: break-all; }
.archive-note { color: #1890ff; }
.cleanup-box { background: #fff7e6; border-color: #ffd591; }
.dup-line { color: #7c3aed; }
.batch-info { font-size: 10px; color: #1890ff; font-weight: bold; margin-bottom: 4px; }
.progress-bar { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
.progress-fill { height: 100%; background: #1890ff; transition: width 0.2s; }
.progress-text { font-size: 10px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
