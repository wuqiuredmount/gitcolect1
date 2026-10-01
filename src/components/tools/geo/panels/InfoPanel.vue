<template>
  <MapPanel :title="`📋 信息栏`" :initialBottom="350" :initialCollapsed="true">
    <div class="info-panel-container">
      <!-- 1. 顶部功能区 -->
      <div class="panel-toolbar">
        <button class="tool-btn" @click="toggleFormatModal">格式选择</button>
        <button class="tool-btn" :disabled="!canUndo" @click="handleUndo">撤销</button>
      </div>

      <!-- 2. 对象检索区 (占据顶部 2/5 空间) -->
      <div class="search-section">
        <div class="search-input-wrapper">
          <input 
            type="text" 
            v-model="keyword" 
            placeholder="输入关键词检索，如：朱" 
            class="search-input"
          />
        </div>
        <div class="search-results">
          <div v-if="searchResults.length > 0" class="result-list">
            <div 
              v-for="res in searchResults" 
              :key="res.id" 
              class="result-item"
              @click="handleResultClick(res.id)"
            >
              {{ res.name }}
            </div>
          </div>
          <div v-else class="empty-result">暂无关联对象</div>
        </div>
      </div>

      <!-- 3. 数据编辑区 (仅在选中对象时显示) -->
      <div v-if="selectedLayer" class="edit-section">
        <!-- 对象名称 -->
        <div class="field-group">
          <label>对象名称（必填）</label>
          <input 
            type="text" 
            v-model="localObjectName" 
            @change="updateLayerData('objectName', localObjectName)"
            placeholder="请输入对象名称" 
            class="field-input"
          />
        </div>

        <!-- 500 个信息字段 (用滚动条控制) -->
        <div class="fields-container">
          <div v-for="(field, index) in localFields" :key="index" class="info-field">
            <div class="field-label">
              <input 
                type="text" 
                v-model="field.label" 
                @focus="selectAll($event)"
                @change="updateField(index, 'label', field.label)"
                placeholder="信息的名称"
                class="field-input-small"
              />
            </div>
            <div class="field-value">
              <input 
                type="text" 
                v-model="field.value" 
                @focus="selectAll($event)"
                @change="updateField(index, 'value', field.value)"
                placeholder="信息内容"
                class="field-input-small"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-else class="no-selection">
        请在画布上点击选中一个图形，或通过上方检索结果选择
      </div>

      <!-- 4. 底部导出区 -->
      <div class="panel-footer">
        <button class="export-btn" @click="handleExport">导出 Excel</button>
      </div>
    </div>

    <!-- 格式选择弹窗 -->
    <div v-if="isFormatModalOpen" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>格式选择与管理</h3>
          <button @click="closeFormatModal">×</button>
        </div>
        <div class="modal-body">
          <div class="format-sidebar">
            <button class="new-format-btn" @click="createNewFormat">+ 新建格式</button>
            <div class="format-list">
              <div 
                v-for="fmt in allFormats" 
                :key="fmt.id" 
                :class="{ active: editingFormat?.id === fmt.id }"
                @click="editingFormat = fmt"
                class="format-item"
              >
                {{ fmt.name }}
              </div>
            </div>
          </div>
          <div class="format-editor" v-if="editingFormat">
            <div class="format-name-row">
              <label>格式名称</label>
              <input type="text" v-model="editingFormat.name" />
            </div>
            <div class="format-name-row">
              <label>覆盖对象名称 (选填)</label>
              <input type="text" v-model="editingFormat.objectName" placeholder="不填则保留原对象名称" />
            </div>
            <div class="format-fields-scroll">
              <div v-for="(f, idx) in editingFormat.fields" :key="idx" class="format-field-item">
                <span class="field-index">信息{{ idx + 1 }}</span>
                <input type="text" v-model="f.label" placeholder="信息的名称" />
                <input type="text" v-model="f.defaultValue" placeholder="预设内容" />
              </div>
            </div>
            <div class="format-actions">
              <button @click="saveFormat">保存格式</button>
              <button @click="applyFormatToLayer" :disabled="!selectedLayer">应用到当前图形</button>
            </div>
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
          <button @click="executeApplyFormat">确定</button>
        </div>
      </div>
    </div>
  </MapPanel>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import MapPanel from './MapPanel.vue';
import { exportToExcel } from '../../../../groups/geo/utils/excelExporter.js';

const props = defineProps({ 
  layers: { type: Array, default: () => [] } 
});

const emit = defineEmits(['locate', 'update-layer']);

// ================= 状态管理 =================
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

// ================= 初始化与数据监听 =================
const loadFormats = () => {
  const saved = localStorage.getItem('excalidraw_format_templates');
  if (saved) {
    try {
      allFormats.value = JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
  }
};
loadFormats();

watch(() => props.layers, (newLayers) => {
  if (selectedLayer.value && !newLayers.find(l => l.id === selectedLayer.value.id)) {
    selectedLayer.value = null;
  }
}, { deep: true });

const selectLayer = (layer) => {
  selectedLayer.value = layer;
  localObjectName.value = layer.objectName || '默认名称';
  if (layer.fields) {
    localFields.value = JSON.parse(JSON.stringify(layer.fields));
  } else {
    localFields.value = Array.from({ length: 500 }).map((_, i) => ({
      label: `信息的名称${i + 1}`,
      value: ''
    }));
  }
};

defineExpose({ selectLayer });

// ================= 字段与数据更新 =================
const updateLayerData = (key, value) => {
  if (!selectedLayer.value) return;
  pushHistory();
  const updatedLayer = { ...selectedLayer.value, [key]: value };
  selectedLayer.value = updatedLayer;
  emit('update-layer', updatedLayer);
};

const updateField = (index, key, value) => {
  if (!selectedLayer.value) return;
  pushHistory();
  localFields.value[index][key] = value;
  updateLayerData('fields', JSON.parse(JSON.stringify(localFields.value)));
};

const selectAll = (e) => {
  e.target.select();
};

// ================= 撤销功能 =================
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

// ================= 检索功能 =================
watch(keyword, (kw) => {
  if (!kw.trim()) {
    searchResults.value = [];
    return;
  }
  const query = kw.toLowerCase();
  searchResults.value = props.layers.filter(layer => {
    const name = layer.objectName || layer.title || '';
    const fieldsText = layer.fields ? Object.values(layer.fields).map(f => `${f.label} ${f.value}`).join(' ') : '';
    return `${name} ${fieldsText}`.toLowerCase().includes(query);
  }).map(layer => ({
    id: layer.id,
    name: layer.objectName || layer.title || '未命名图形'
  }));
});

const handleResultClick = (id) => {
  const layer = props.layers.find(l => l.id === id);
  if (layer) {
    emit('locate', layer);
    selectLayer(layer);
  }
};

// ================= 格式管理 =================
const toggleFormatModal = () => {
  if (!selectedLayer.value) {
    alert('请先在画布上选中一个图形！');
    return;
  }
  isFormatModalOpen.value = true;
};

const closeFormatModal = () => {
  isFormatModalOpen.value = false;
};

const createNewFormat = () => {
  const newFormat = {
    id: Date.now().toString(),
    name: '新格式',
    objectName: '',
    fields: Array.from({ length: 500 }).map(() => ({ label: '', defaultValue: '' }))
  };
  allFormats.value.push(newFormat);
  editingFormat.value = newFormat;
};

const saveFormat = () => {
  const updated = allFormats.value.map(f => f.id === editingFormat.value.id ? editingFormat.value : f);
  allFormats.value = updated;
  localStorage.setItem('excalidraw_format_templates', JSON.stringify(updated));
  alert('格式已保存');
};

const applyFormatToLayer = () => {
  if (!editingFormat.value || !selectedLayer.value) return;
  
  const hasOldData = localFields.value.some(f => (f.label && f.label !== `信息的名称1`) || f.value);
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
    return {
      label: fmtField.label || `信息的名称${i + 1}`,
      value: fmtField.defaultValue || ''
    };
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
};

// ================= 导出 Excel =================
const handleExport = () => {
  exportToExcel(props.layers);
};
</script>

<style scoped>
.info-panel-container {
  display: flex;
  flex-direction: column;
  width: 320px; 
  background: #fff;
  font-size: 10px;
}

.panel-toolbar {
  display: flex;
  gap: 5px;
  padding: 5px;
  border-bottom: 1px solid #eee;
}
.tool-btn {
  flex: 1;
  padding: 4px;
  font-size: 10px;
  cursor: pointer;
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 3px;
}
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.search-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 5px;
  border-bottom: 1px solid #eee;
}
.search-input {
  width: 100%;
  padding: 4px;
  font-size: 10px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 3px;
}
.search-results {
  flex: 1;
  overflow-y: auto;
  margin-top: 5px;
  border: 1px solid #eee;
  border-radius: 3px;
  max-height: 100px;
}
.result-item {
  padding: 4px 6px;
  cursor: pointer;
  border-bottom: 1px solid #f9f9f9;
}
.result-item:hover { background: #e6f7ff; }
.empty-result { text-align: center; color: #999; padding: 10px 0; }

.edit-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 5px;
  overflow: hidden;
}
.field-group {
  margin-bottom: 5px;
}
.field-group label {
  display: block;
  font-size: 9px;
  color: #666;
  margin-bottom: 2px;
}
.field-input {
  width: 100%;
  padding: 3px 5px;
  font-size: 10px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 3px;
}
.fields-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
  max-height: 250px; 
}
.info-field {
  margin-bottom: 5px;
  background: #fafafa;
  padding: 4px;
  border-radius: 3px;
}
.field-label, .field-value {
  margin-bottom: 2px;
}
.field-input-small {
  width: 100%;
  padding: 2px 4px;
  font-size: 9px;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 2px;
}
.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  text-align: center;
  padding: 20px;
}

.panel-footer {
  padding: 5px;
  border-top: 1px solid #eee;
}
.export-btn {
  width: 100%;
  padding: 6px;
  font-size: 10px;
  font-weight: bold;
  color: white;
  background: #1890ff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999;
}
.modal-content {
  width: 600px; height: 500px; background: #fff; border-radius: 5px;
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;
}
.modal-header h3 { margin: 0; font-size: 14px; }
.modal-header button { background: none; border: none; font-size: 18px; cursor: pointer; }
.modal-body { display: flex; flex: 1; overflow: hidden; }
.format-sidebar {
  width: 150px; border-right: 1px solid #eee; display: flex; flex-direction: column;
}
.new-format-btn {
  padding: 6px; font-size: 10px; cursor: pointer; border: none; background: #1890ff; color: #fff; margin: 5px;
  border-radius: 3px;
}
.format-list { flex: 1; overflow-y: auto; }
.format-item {
  padding: 6px 10px; font-size: 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0;
}
.format-item.active { background: #e6f7ff; color: #1890ff; }
.format-editor { flex: 1; padding: 10px; display: flex; flex-direction: column; overflow: hidden; }
.format-name-row { margin-bottom: 8px; display: flex; gap: 5px; align-items: center; }
.format-name-row label { font-size: 10px; width: 80px; }
.format-name-row input { flex: 1; padding: 4px; font-size: 10px; }
.format-fields-scroll { flex: 1; overflow-y: auto; border: 1px solid #eee; padding: 5px; margin-bottom: 8px; }
.format-field-item { display: flex; gap: 5px; margin-bottom: 5px; align-items: center; }
.field-index { font-size: 9px; width: 40px; color: #888; }
.format-field-item input { flex: 1; padding: 3px; font-size: 9px; }
.format-actions { display: flex; gap: 5px; }
.format-actions button { flex: 1; padding: 6px; font-size: 10px; cursor: pointer; }
.confirm-modal {
  background: #fff; padding: 20px; border-radius: 5px; width: 300px; text-align: center;
}
.confirm-modal h3 { margin-top: 0; font-size: 14px; }
.confirm-modal p { font-size: 12px; color: #666; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; }
.confirm-actions button { padding: 5px 15px; font-size: 12px; cursor: pointer; }
</style>