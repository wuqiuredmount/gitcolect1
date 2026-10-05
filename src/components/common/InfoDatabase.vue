<template>
  <!-- 弹窗遮罩 -->
  <div class="database-overlay" v-if="visible" @click.self="$emit('close')">
    <div class="database-modal">
      
      <!-- 头部 -->
      <div class="db-header">
        <div class="db-title">📊 信息数据库 - 全局数据总仓库</div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 主体 -->
      <div class="db-body">
        
        <!-- 1. 左侧：树形目录 -->
        <div class="db-sidebar">
          <div class="sidebar-title">数据分类</div>
          <div class="tree-node" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
            <span>📁 全部数据</span>
            <span class="count">({{ allLayers.length }})</span>
          </div>
          <div 
            v-for="tool in tools" 
            :key="tool.id" 
            class="tree-node" 
            :class="{ active: activeFilter === tool.id }"
            @click="activeFilter = tool.id"
          >
            <span>🔧 {{ tool.name }}</span>
            <span class="count">({{ allLayers.filter(l => l.toolId === tool.id).length }})</span>
          </div>
        </div>

        <!-- 2. 中间：数据列表 -->
        <div class="db-main">
          <div class="table-toolbar">
            <span>共 {{ filteredDataList.length }} 条数据</span>
            <div class="export-actions">
              <button class="export-btn" @click="handleExportExcel">📊 导出Excel</button>
              <button class="export-btn" @click="handleExportWord">📄 导出Word</button>
            </div>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 60px;">序号</th>
                <th style="width: 100px;">统一编码</th>
                <th style="width: 200px;">对象名称（文档名称）</th>
                <th style="width: 100px;">图形类型</th>
                <th style="width: 80px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in filteredDataList" :key="item.id" @click="selectItem(item)" :class="{ active: selectedItem?.id === item.id }">
                <td>{{ index + 1 }}</td>
                <td>{{ item.id }}</td>
                <td>{{ item.objectName || item.title || '未命名' }}</td>
                <td>{{ typeMap[item.type] || item.type }}</td>
                <td>
                  <button class="del-btn" @click.stop="handleDelete(item)">删除</button>
                </td>
              </tr>
              <tr v-if="filteredDataList.length === 0">
                <td colspan="5" class="empty-row">暂无数据，请在画布上绘制图形</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 3. 右侧：详情面板 -->
        <div class="db-detail" v-if="selectedItem">
          <div class="detail-header">
            <span>数据详情（编码：{{ selectedItem.id }}）</span>
          </div>
          <div class="detail-tabs">
            <div class="tab" :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">信息栏</div>
            <div class="tab" :class="{ active: activeTab === 'doc' }" @click="activeTab = 'doc'">富文本</div>
            <div class="tab" :class="{ active: activeTab === 'attr' }" @click="activeTab = 'attr'">图形属性</div>
          </div>
          <div class="detail-content">
            <!-- Tab 1: 信息栏 -->
            <div v-show="activeTab === 'info'" class="tab-pane">
              <div class="field-item">
                <label>对象名称：</label>
                <input type="text" v-model="selectedItem.objectName" @change="updateData" placeholder="请输入对象名称" />
              </div>
              <div class="field-item" v-for="(field, idx) in selectedItem.fields" :key="idx" v-show="field.label || field.value">
                <label>{{ field.label || `信息${idx + 1}` }}：</label>
                <input type="text" v-model="field.value" @change="updateData" />
              </div>
            </div>
            <!-- Tab 2: 富文本 -->
            <div v-show="activeTab === 'doc'" class="tab-pane">
              <div class="field-item">
                <label>文档内容（预览，编辑请回到画布）：</label>
                <div class="doc-preview" v-html="selectedItem.docHtml || '暂无内容'"></div>
              </div>
            </div>
            <!-- Tab 3: 图形属性 -->
            <div v-show="activeTab === 'attr'" class="tab-pane">
              <div class="field-item"><label>类型：</label> <span>{{ selectedItem.type }}</span></div>
              <div class="field-item"><label>纬度：</label> <span>{{ selectedItem.lat }}</span></div>
              <div class="field-item"><label>经度：</label> <span>{{ selectedItem.lng }}</span></div>
              <div class="field-item"><label>分组：</label> <span>{{ selectedItem.group }}</span></div>
            </div>
          </div>
        </div>
        <div class="db-detail empty" v-else>
          <div class="no-selection">请在左侧列表中选择一条数据查看详情</div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
// 🚨 引入我们刚写的导出工具
import { exportToExcel, exportToWord } from '../../groups/geo/utils/exporter'; 

const props = defineProps({
  visible: { type: Boolean, default: false },
  tools: { type: Array, default: () => [] }, 
  allLayers: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'update-layer', 'delete-layer']);

const activeFilter = ref('all');
const filteredDataList = computed(() => {
  if (activeFilter.value === 'all') return props.allLayers;
  return props.allLayers.filter(l => l.toolId === activeFilter.value);
});

const selectedItem = ref(null);
const activeTab = ref('info');

const typeMap = {
  polygon: '多边形', rectangle: '矩形', polyline: '折线',
  circle: '圆形', ellipse: '椭圆', marker: '标记点'
};

const selectItem = (item) => {
  selectedItem.value = JSON.parse(JSON.stringify(item)); 
  activeTab.value = 'info';
};

const updateData = () => {
  if (selectedItem.value) {
    emit('update-layer', { ...selectedItem.value });
  }
};

const handleDelete = (item) => {
  if (confirm(`⚠️ 确定要删除数据（编码：${item.id}）吗？\n此操作将同步删除地图上的图形及对应的富文本文档，且不可逆！`)) {
    emit('delete-layer', item);
    if (selectedItem.value?.id === item.id) selectedItem.value = null;
  }
};

// 🚨 导出 Excel
const handleExportExcel = () => {
  // 导出当前筛选后的数据
  exportToExcel(filteredDataList.value, true);
};

// 🚨 导出 Word
const handleExportWord = () => {
  // 导出当前筛选后的数据（包含文字和图片）
  exportToWord(filteredDataList.value);
};

// 当弹窗打开时，重置选中状态
watch(() => props.visible, (val) => {
  if (val) { selectedItem.value = null; activeFilter.value = 'all'; }
});
</script>

<style scoped>
/* 弹窗基本样式 */
.database-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; }
.database-modal { width: 90vw; height: 80vh; max-width: 1300px; background: #fff; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
.db-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #2c3e50; color: white; }
.db-title { font-size: 16px; font-weight: bold; }
.close-btn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }

/* 主体布局 */
.db-body { display: flex; flex: 1; overflow: hidden; }

/* 左侧目录 */
.db-sidebar { width: 220px; border-right: 1px solid #eee; background: #f8f9fa; display: flex; flex-direction: column; padding: 10px 0; }
.sidebar-title { padding: 0 15px 10px; font-size: 12px; color: #888; font-weight: bold; }
.tree-node { padding: 8px 15px; cursor: pointer; font-size: 13px; display: flex; justify-content: space-between; }
.tree-node:hover { background: #e9ecef; }
.tree-node.active { background: #e6f7ff; color: #1890ff; border-right: 3px solid #1890ff; }
.tree-node .count { font-size: 11px; color: #999; }

/* 中间表格 */
.db-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.table-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 15px; background: #f8f9fa; border-bottom: 1px solid #eee; font-size: 12px; color: #666; }
.export-actions { display: flex; gap: 10px; }
.export-btn { padding: 4px 12px; font-size: 12px; cursor: pointer; background: #fff; border: 1px solid #1890ff; color: #1890ff; border-radius: 4px; transition: 0.2s; }
.export-btn:hover { background: #e6f7ff; }
.export-btn:active { background: #bae0ff; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th { background: #f8f9fa; padding: 10px; text-align: left; border-bottom: 2px solid #eee; position: sticky; top: 0; }
.data-table td { padding: 10px; border-bottom: 1px solid #f0f0f0; }
.data-table tbody tr { cursor: pointer; transition: background 0.2s; }
.data-table tbody tr:hover { background: #f9fafb; }
.data-table tbody tr.active { background: #e6f7ff; }
.del-btn { background: none; border: 1px solid #e74c3c; color: #e74c3c; border-radius: 3px; cursor: pointer; padding: 2px 8px; font-size: 11px; }
.del-btn:hover { background: #fee2e2; }
.empty-row { text-align: center; color: #999; padding: 40px 0; }

/* 右侧详情 */
.db-detail { width: 320px; border-left: 1px solid #eee; background: #fff; display: flex; flex-direction: column; overflow: hidden; }
.db-detail.empty { justify-content: center; align-items: center; color: #999; font-size: 12px; }
.detail-header { padding: 12px 15px; font-size: 13px; font-weight: bold; border-bottom: 1px solid #eee; background: #fafafa; }
.detail-tabs { display: flex; border-bottom: 1px solid #eee; background: #f9fafb; }
.tab { flex: 1; text-align: center; padding: 10px 0; font-size: 12px; cursor: pointer; color: #666; border-bottom: 2px solid transparent; }
.tab:hover { color: #1890ff; }
.tab.active { color: #1890ff; border-bottom-color: #1890ff; font-weight: bold; }
.detail-content { flex: 1; padding: 15px; overflow-y: auto; }
.field-item { margin-bottom: 12px; }
.field-item label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; }
.field-item input { width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
.field-item input:focus { border-color: #1890ff; outline: none; }
.doc-preview { border: 1px solid #eee; padding: 10px; border-radius: 4px; min-height: 100px; background: #fafafa; font-size: 12px; }
</style>