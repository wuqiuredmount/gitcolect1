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

const loadItems = async () => {
  message.value = '';
  const all = [];
  for (const toolId of TOOL_ORDER) {
    try {
      const list = await getAllRecycled(toolId);
      all.push(...list);
    } catch (e) {
      console.warn('[回收站] 读取工具失败:', toolId, e);
    }
  }
  all.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  items.value = all;
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
    // 3. 从回收站移除
    await purgeFromRecycleBin(item.toolId, item.fileId, item.annotationId);
    message.value = `已恢复：${getItemName(item)}`;
    await loadItems();
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
    await loadItems();
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
    await loadItems();
  } catch (e) {
    message.value = '清空失败：' + (e.message || e);
  }
};

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
