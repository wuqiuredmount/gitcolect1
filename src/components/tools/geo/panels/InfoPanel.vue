<template>
  <!-- 🚨 核心修复：去掉 title 前面的冒号，直接使用字符串 -->
  <MapPanel title="信息栏" :initialBottom="260" :initialCollapsed="true" :panel-id="'info-' + toolId">
    <div class="info-panel-container">
      <div class="panel-toolbar">
        <button class="tool-btn" @click="toggleFormatModal">格式选择</button>
        <button class="tool-btn" :disabled="!canUndo" @click="handleUndo">撤销</button>
      </div>

      <div class="search-section">
        <div class="search-input-wrapper">
          <input type="text" v-model="keyword" placeholder="输入关键词检索，如：朱" class="search-input" />
        </div>
        <div class="search-results">
          <div v-if="searchResults.length > 0" class="result-list">
            <div v-for="res in searchResults" :key="res.id" class="result-item" @click="handleResultClick(res.id)">{{ res.name }}</div>
          </div>
          <div v-else class="empty-result">暂无关联对象</div>
        </div>
      </div>

      <div v-if="selectedLayer" class="edit-section">
        <div class="field-group">
          <label>对象名称（必填）</label>
          <!-- 🚨 修复：@change → @input -->
          <input 
            type="text" 
            v-model="localObjectName" 
            @input="handleObjectNameInput" 
            placeholder="默认名称" 
            class="field-input" 
          />
        </div>
        
        <div class="fields-container">
          <div v-for="(field, index) in localFields" :key="index" class="info-field">
            <div class="field-label">
              <!-- 🚨 修复：@change → @input -->
              <input 
                type="text" 
                v-model="field.label" 
                @focus="selectAll($event)" 
                @input="handleFieldInput(index, 'label', field.label)" 
                :placeholder="`信息的名称${index + 1}`" 
                class="field-input-small" 
              />
            </div>
            <div class="field-value">
              <!-- 🚨 修复：@change → @input -->
              <input 
                type="text" 
                v-model="field.value" 
                @focus="selectAll($event)" 
                @input="handleFieldInput(index, 'value', field.value)" 
                :placeholder="`信息内容${index + 1}`" 
                class="field-input-small" 
              />
            </div>
          </div>
        </div>
      </div>
      <div v-else class="no-selection">请在画布上点击选中一个图形，或通过上方检索结果选择</div>
      <div class="panel-footer">
        <button class="export-btn" @click="handleExport">导出 Excel</button>
      </div>
    </div>
    
    <!-- 🚨 重构：格式选择弹窗 -->
    <div v-if="isFormatModalOpen" class="modal-overlay">
      <div class="format-modal">
        <div class="format-header">
          <h3>格式选择与管理</h3>
          <button class="close-btn" @click="closeFormatModal">×</button>
        </div>
        
        <div class="format-body">
          <!-- 左侧：格式列表 -->
          <div class="format-sidebar">
            <button class="new-format-btn" @click="createNewFormat">+ 新建格式</button>
            <div class="format-list">
              <div v-for="fmt in allFormats" :key="fmt.id" :class="{ active: editingFormat?.id === fmt.id }" @click="editingFormat = fmt" class="format-item">{{ fmt.name || '未命名格式' }}</div>
            </div>
          </div>

          <!-- 中间：编辑区 -->
          <div class="format-main" v-if="editingFormat">
            <div class="format-info-row">
              <label>格式名称</label>
              <input type="text" v-model="editingFormat.name" placeholder="给这个格式起个名字" />
            </div>
            <div class="format-info-row">
              <label>覆盖对象名称</label>
              <input type="text" v-model="editingFormat.objectName" placeholder="选填，留空则不覆盖图形名称" />
            </div>
            <div class="fields-scroll">
              <div v-for="(f, idx) in editingFormat.fields" :key="idx" class="format-field-item">
                <span class="field-index">信息{{ idx + 1 }}</span>
                <input type="text" v-model="f.label" placeholder="信息的名称" />
                <input type="text" v-model="f.defaultValue" placeholder="预设内容" />
              </div>
            </div>
          </div>

          <!-- 右侧：操作区 -->
          <div class="format-actions-sidebar" v-if="editingFormat">
            <button class="primary-btn" @click="saveFormat">保存格式</button>
            <button class="success-btn" @click="applyFormatToLayer" :disabled="!selectedLayer">应用到当前图形</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 覆盖警告弹窗 -->
    <div v-if="isConfirmOpen" class="modal-overlay">
      <div class="confirm-modal">
        <h3>覆盖警告</h3>
        <p>此操作将覆盖当前图形已有的信息（包括默认内容），是否继续？</p>
        <div class="confirm-actions">
          <button @click="isConfirmOpen = false">取消</button>
          <button class="primary-btn" @click="executeApplyFormat">确定</button>
        </div>
      </div>
    </div>
  </MapPanel>
</template>

<script setup>
// 🚨 修复：加入 onBeforeUnmount
import { ref, watch, onBeforeUnmount } from 'vue';
import MapPanel from './MapPanel.vue';
import { exportToExcel } from '../../../../groups/geo/utils/exporter.js';

const props = defineProps({
  layers: { type: Array, default: () => [] },
  toolId: { type: String, default: 'default' }
});

const emit = defineEmits(['locate', 'update-layer']);
const selectedLayer = ref(null);
const localObjectName = ref('');
const localFields = ref([]);
const keyword = ref('');
const searchResults = ref([]);
const isFormatModalOpen = ref(false);
const allFormats = ref([]);
const editingFormat = ref(null);
const isConfirmOpen = ref(false);
const pendingFormat = ref(null);
const historyRef = ref([]);
const canUndo = ref(false);

// 🚨 新增：防抖定时器（防止每次按键都触发 IndexedDB 写入）
let debounceTimer = null;
const DEBOUNCE_DELAY = 300;

const loadFormats = () => {
  const saved = localStorage.getItem('excalidraw_format_templates');
  if (saved) {
    try { 
      allFormats.value = JSON.parse(saved); 
      if (allFormats.value.length > 0) {
        editingFormat.value = allFormats.value[0];
      }
    } catch (e) { console.error(e); }
  } else {
    // 如果没有格式，自动生成一个默认的，避免弹窗空白
    createNewFormat();
  }
};
loadFormats();

const selectLayer = (layer) => {
  selectedLayer.value = layer;
  localObjectName.value = (layer.objectName === '默认名称' || !layer.objectName) ? '' : layer.objectName; 

  if (layer.fields && layer.fields.length > 0) {
    localFields.value = JSON.parse(JSON.stringify(layer.fields)).map((f, i) => {
      const defaultLabel = `信息的名称${i + 1}`;
      return {
        label: (f.label === defaultLabel || !f.label) ? '' : f.label,
        value: f.value || ''
      };
    });
  } else {
    localFields.value = Array.from({ length: 500 }).map(() => ({ label: '', value: '' }));
  }
};

watch(() => props.layers, (newLayers) => {
  if (selectedLayer.value && !newLayers.find(l => l.id === selectedLayer.value.id)) {
    selectedLayer.value = null;
  }
}, { deep: true });

defineExpose({ selectLayer });

const updateLayerData = (key, value) => {
  if (!selectedLayer.value) return;
  pushHistory();
  const updatedLayer = { ...selectedLayer.value, [key]: value };
  selectedLayer.value = updatedLayer;
  emit('update-layer', { ...updatedLayer, toolId: props.toolId });
};

const updateField = (index, key, value) => {
  if (!selectedLayer.value) return;
  pushHistory();
  localFields.value[index][key] = value;
  updateLayerData('fields', JSON.parse(JSON.stringify(localFields.value)));
};

// 🚨 新增：对象名称输入防抖处理器
const handleObjectNameInput = () => {
  if (!selectedLayer.value) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updateLayerData('objectName', localObjectName.value);
  }, DEBOUNCE_DELAY);
};

// 🚨 新增：字段输入防抖处理器
const handleFieldInput = (index, key, value) => {
  if (!selectedLayer.value) return;
  // 立即更新本地字段，保证 UI 响应
  localFields.value[index][key] = value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updateField(index, key, value);
  }, DEBOUNCE_DELAY);
};

// 🚨 新增：组件卸载前强制刷出未提交的修改
onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (selectedLayer.value) {
      updateLayerData('objectName', localObjectName.value);
      updateLayerData('fields', JSON.parse(JSON.stringify(localFields.value)));
    }
  }
});

const selectAll = (e) => { e.target.select(); };

const pushHistory = () => {
  if (!selectedLayer.value) return;
  historyRef.value.push({
    layerId: selectedLayer.value.id,
    objectName: localObjectName.value,
    fields: JSON.parse(JSON.stringify(localFields.value))
  });
  if (historyRef.value.length > 50) historyRef.value.shift();
  canUndo.value = true;
};

const handleUndo = () => {
  if (historyRef.value.length === 0) return;
  const snapshot = historyRef.value.pop();
  if (snapshot.layerId === selectedLayer.value.id) {
    localObjectName.value = snapshot.objectName;
    localFields.value = snapshot.fields;
    updateLayerData('objectName', snapshot.objectName);
    updateLayerData('fields', snapshot.fields);
  }
  canUndo.value = historyRef.value.length > 0;
};

const handleExport = () => {
  if (!props.layers || props.layers.length === 0) {
    alert('当前没有任何图形数据！');
    return;
  }
  
  // 🚨 核心修改：让用户选择导出范围
  const exportAll = window.confirm(
    '点击"确定"：导出所有图形（包括未录入信息的图形）\n' +
    '点击"取消"：仅导出在信息栏录入了数据的图形'
  );
  
  // 调用新的导出函数，传入用户选择的结果
  exportToExcel(props.layers, exportAll);
};

const toggleFormatModal = () => {
  if (!selectedLayer.value) { alert('请先在画布上选中一个图形!'); return; }
  isFormatModalOpen.value = true;
  if (!editingFormat.value && allFormats.value.length > 0) {
    editingFormat.value = allFormats.value[0];
  }
};

const closeFormatModal = () => { isFormatModalOpen.value = false; };

// 🚨 修复 TDZ：改为函数声明（会被提升），以便 loadFormats() 在下方定义前调用
function createNewFormat() {
  const newFormat = { 
    id: Date.now().toString(), 
    name: '新格式', 
    objectName: '', 
    fields: Array.from({ length: 500 }).map(() => ({ label: '', defaultValue: '' })) 
  };
  allFormats.value.push(newFormat);
  editingFormat.value = newFormat;
}

const saveFormat = () => {
  if (!editingFormat.value) return;
  const updated = allFormats.value.map(f => f.id === editingFormat.value.id ? editingFormat.value : f);
  allFormats.value = updated;
  localStorage.setItem('excalidraw_format_templates', JSON.stringify(updated));
  alert('格式已保存');
};

const applyFormatToLayer = () => {
  if (!editingFormat.value || !selectedLayer.value) return;
  const hasOldData = localFields.value.some(f => (f.label && f.label !== `信息的名称${1}`) || f.value);
  if (hasOldData) {
    pendingFormat.value = editingFormat.value;
    isConfirmOpen.value = true;
  } else {
    executeApplyFormat();
  }
};

const executeApplyFormat = () => {
  const fmt = pendingFormat.value || editingFormat.value;
  pushHistory();
  const newFields = Array.from({ length: 500 }).map((_, i) => {
    const fmtField = fmt.fields[i] || { label: '', defaultValue: '' };
    return { label: fmtField.label || '', value: fmtField.defaultValue || '' };
  });
  localFields.value = newFields;
  const newObjectName = fmt.objectName?.trim() ? fmt.objectName : localObjectName.value;
  localObjectName.value = newObjectName;
  updateLayerData('fields', newFields);
  updateLayerData('objectName', newObjectName);
  updateLayerData('formatName', fmt.name);
  isConfirmOpen.value = false;
  pendingFormat.value = null;
  isFormatModalOpen.value = false;
  alert(`格式“${fmt.name}”已应用到当前图形`);
};
</script>

<style scoped>
.info-panel-container { display: flex; flex-direction: column; width: 320px; background: #fff; font-size: 10px; max-height: 480px; }
.panel-toolbar { display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid #eee; }
.tool-btn { flex: 1; padding: 4px; font-size: 10px; cursor: pointer; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.search-section { flex: 1; display: flex; flex-direction: column; padding: 5px; border-bottom: 1px solid #eee; }
.search-input { width: 100%; padding: 4px; font-size: 10px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 3px; }
.search-results { flex: 1; overflow-y: auto; margin-top: 5px; border: 1px solid #eee; border-radius: 3px; max-height: 80px; }
.result-item { padding: 4px 6px; cursor: pointer; border-bottom: 1px solid #f9f9f9; }
.result-item:hover { background: #e6f7ff; }
.empty-result { text-align: center; color: #999; padding: 10px 0; }

.edit-section { flex: 1; display: flex; flex-direction: column; padding: 5px; overflow: hidden; }
.field-group { margin-bottom: 5px; }
.field-group label { display: block; font-size: 9px; color: #666; margin-bottom: 2px; }
.field-input { width: 100%; padding: 3px 5px; font-size: 10px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 3px; }

.fields-container { flex: 1; overflow-y: auto; padding-right: 2px; max-height: 250px; border: 1px solid #eee; border-radius: 3px; padding: 5px; }
.info-field { margin-bottom: 8px; background: #fafafa; padding: 5px; border-radius: 3px; }
.field-label, .field-value { margin-bottom: 3px; }
.field-input-small { width: 100%; padding: 3px 5px; font-size: 9px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 2px; }
.field-input-small::placeholder { color: #bbb; }

.no-selection { flex: 1; display: flex; align-items: center; justify-content: center; color: #999; text-align: center; padding: 20px; }
.panel-footer { padding: 5px; border-top: 1px solid #eee; }
.export-btn { width: 100%; padding: 6px; font-size: 10px; font-weight: bold; color: white; background: #1890ff; border: none; border-radius: 3px; cursor: pointer; }

/* 🚨 弹窗相关样式全面重构 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; }
.format-modal { width: 850px; height: 600px; background: #fff; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
.format-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid #eee; background: #f8f9fa; }
.format-header h3 { margin: 0; font-size: 14px; color: #333; }
.close-btn { background: none; border: none; font-size: 24px; line-height: 1; cursor: pointer; color: #999; }
.close-btn:hover { color: #e74c3c; }

.format-body { display: flex; flex: 1; overflow: hidden; }

/* 左侧列表 */
.format-sidebar { width: 160px; border-right: 1px solid #eee; display: flex; flex-direction: column; background: #fafafa; }
.new-format-btn { padding: 8px; margin: 10px; font-size: 12px; font-weight: bold; cursor: pointer; border: none; background: #1890ff; color: #fff; border-radius: 4px; }
.new-format-btn:hover { background: #40a9ff; }
.format-list { flex: 1; overflow-y: auto; padding: 0 10px 10px; }
.format-item { padding: 8px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; margin-bottom: 4px; color: #555; }
.format-item:hover { background: #e6f7ff; }
.format-item.active { background: #1890ff; color: #fff; }

/* 中间主编辑区 */
.format-main { flex: 1; display: flex; flex-direction: column; padding: 15px 20px; overflow: hidden; }
.format-info-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.format-info-row label { width: 80px; font-size: 12px; color: #333; text-align: right; }
.format-info-row input { flex: 1; padding: 6px 10px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; outline: none; }
.format-info-row input:focus { border-color: #1890ff; }

.fields-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; border: 1px solid #eee; border-radius: 4px; padding: 10px; background: #fafafa; }
.format-field-item { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.field-index { width: 50px; font-size: 11px; color: #888; text-align: right; }
.format-field-item input { flex: 1; padding: 5px 8px; font-size: 11px; border: 1px solid #ddd; border-radius: 3px; min-width: 0; }
.format-field-item input:focus { border-color: #1890ff; }

/* 右侧操作区 */
.format-actions-sidebar { width: 140px; border-left: 1px solid #eee; display: flex; flex-direction: column; gap: 10px; padding: 20px 15px; background: #fafafa; justify-content: flex-start; }
.primary-btn, .success-btn { padding: 10px; font-size: 12px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; transition: 0.2s; }
.primary-btn { background: #1890ff; color: #fff; }
.primary-btn:hover { background: #40a9ff; }
.success-btn { background: #52c41a; color: #fff; }
.success-btn:hover { background: #73d13d; }
.success-btn:disabled { background: #ccc; cursor: not-allowed; }

/* 确认弹窗 */
.confirm-modal { background: #fff; padding: 25px; border-radius: 8px; width: 320px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
.confirm-modal h3 { margin-top: 0; font-size: 16px; color: #333; }
.confirm-modal p { font-size: 13px; color: #666; margin: 15px 0; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.confirm-actions button { padding: 6px 15px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #fff; }
.confirm-actions button.primary-btn { background: #1890ff; color: #fff; border-color: #1890ff; }
</style>