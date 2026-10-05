<template>
  <div v-if="visible" class="inventory-overlay" @click.self="handleClose">
    <div class="inventory-modal">
      <div v-if="isLoadingProject" class="loading-overlay">
        正在加载工程数据，请稍候...
      </div>

      <div class="inventory-header">
        <h3>📁 文件库存 - 信息分布共享与集成</h3>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div class="inventory-tabs">
        <button
          v-for="toolId in toolOrder"
          :key="toolId"
          class="tab-btn"
          :class="{ active: activeTab === toolId }"
          @click="activeTab = toolId"
        >
          {{ getShortToolName(toolId) }}
          <span v-if="toolId !== 'geo-eagle-eye'" class="tab-count">
            ({{ getProjectCountForTool(toolId) }})
          </span>
          <span v-else class="tab-live-badge">实时</span>
        </button>
      </div>

      <div v-if="showSwitchHint" class="switch-hint">
        <span>⚠️ 您正在查看「<b>{{ getToolName(activeTab) }}</b>」的库存，但当前编辑的是「<b>{{ currentToolName }}</b>」。</span>
        <button @click="handleSwitchToTabTool">切换到「{{ getToolName(activeTab) }}」</button>
      </div>

      <div class="inventory-body">
        <div v-if="activeTab === 'geo-eagle-eye'" class="eagle-eye-panel">
          <div class="ee-notice">
            ℹ️ 本工具数据<b>实时自动保存</b>，无需手动存档。
          </div>

          <div class="ee-stats">
            <div class="ee-stat-item">
              <span class="ee-stat-label">图形总数</span>
              <span class="ee-stat-value">{{ eagleEyeLayers.length }}</span>
            </div>
            <div class="ee-stat-item" v-for="(count, type) in eagleEyeTypeStats" :key="type">
              <span class="ee-stat-label">{{ typeLabel(type) }}</span>
              <span class="ee-stat-value">{{ count }}</span>
            </div>
          </div>

          <div class="ee-list">
            <div v-if="eagleEyeLayers.length === 0" class="empty-hint">暂无图形数据</div>
            <ul v-else class="ee-layer-list">
              <li v-for="layer in eagleEyeLayers" :key="layer.id">
                <span class="ee-layer-id">{{ layer.id }}</span>
                <span class="ee-layer-name">{{ layer.objectName || layer.title || '未命名' }}</span>
                <span class="ee-layer-type">{{ typeLabel(layer.type) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-else class="normal-panel">
          <div class="panel-actions">
            <button
              class="action-btn primary"
              :disabled="isCurrentToolMismatch"
              :title="isCurrentToolMismatch ? '当前工具与库存 Tab 不一致' : ''"
              @click="$emit('save-current-project')"
            >💾 保存当前工作区</button>
            <button class="action-btn" @click="$emit('import-project')">📥 导入本地工程文件</button>
          </div>

          <div class="project-list-box">
            <div v-if="activeProjects.length === 0" class="empty-hint">
              该工具暂无已保存的工程
            </div>
            <ul v-else class="project-list">
              <li v-for="proj in activeProjects" :key="proj.id">
                <div class="proj-info">
                  <span class="proj-name">{{ proj.name }}</span>
                  <!-- 🚨 新增：显示文件编号，区分同一工具下的不同文件 -->
                  <span class="proj-file-id">文件编号：{{ proj.fileId || '未知' }}</span>
                  <span class="proj-date">{{ new Date(proj.createdAt).toLocaleString() }}</span>
                  <span v-if="proj.localPath" class="proj-local">📁 {{ proj.localPath }}</span>
                </div>
                <div class="proj-actions">
                  <button class="small-btn open-btn" @click="$emit('open-project', proj)">打开</button>
                  <button class="small-btn export-data-btn" @click="$emit('export-excel-only', proj)">导出信息栏</button>
                  <button class="small-btn export-word-btn" @click="$emit('export-word-only', proj)">导出文档</button>
                  <button class="small-btn export-btn" @click="$emit('export-project', proj)">导出工程</button>
                  <button v-if="proj.localPath" class="small-btn local-btn" @click="$emit('open-local-folder', proj)">📂 打开本地文件夹</button>
                  <button class="small-btn delete-btn" @click="$emit('delete-project', proj.id)">删除</button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="inventory-footer">
        <button class="footer-btn" @click="handleClose">关闭库存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { TOOL_ORDER, TOOL_META } from '../../groups/geo/utils/toolRegistry';
import { getAllLayers } from '../../groups/geo/utils/annotationStore';

const props = defineProps({
  visible: { type: Boolean, default: false },
  projects: { type: Array, default: () => [] },
  currentToolId: { type: String, default: '' },
  isLoadingProject: { type: Boolean, default: false },
});

const emit = defineEmits([
  'close',
  'switch-tool',
  'save-current-project',
  'import-project',
  'open-project',
  'export-excel-only',
  'export-word-only',
  'export-project',
  'open-local-folder',
  'delete-project',
]);

const toolOrder = computed(() => {
  return [...TOOL_ORDER.filter(id => id !== 'geo-eagle-eye'), 'geo-eagle-eye'];
});

const activeTab = ref('');

watch(() => props.visible, (val) => {
  if (val) {
    if (props.currentToolId && toolOrder.value.includes(props.currentToolId)) {
      activeTab.value = props.currentToolId;
    } else {
      activeTab.value = toolOrder.value[0];
    }
    loadEagleEyeLayers();
  }
});

const getToolName = (toolId) => {
  return TOOL_META[toolId]?.name || toolId;
};

const SHORT_NAMES = {
  'geo-custom-canvas': '自定义',
  'geo-china-map': '中国卫星',
  'geo-world-map': '世界地图',
  'geo-china-standard-map': '中国标准',
  'geo-province-map': '省级',
  'geo-eagle-eye': '鹰眼',
};

const getShortToolName = (toolId) => SHORT_NAMES[toolId] || getToolName(toolId);

const activeProjects = computed(() => {
  if (activeTab.value === 'geo-eagle-eye') return [];
  return props.projects.filter(p => p.toolId === activeTab.value);
});

const getProjectCountForTool = (toolId) => {
  return props.projects.filter(p => p.toolId === toolId).length;
};

const isCurrentToolMismatch = computed(() => {
  return activeTab.value !== 'geo-eagle-eye' && activeTab.value !== props.currentToolId;
});

const showSwitchHint = computed(() => isCurrentToolMismatch.value);
const currentToolName = computed(() => getToolName(props.currentToolId));

const handleSwitchToTabTool = () => {
  emit('switch-tool', activeTab.value);
};

const eagleEyeLayers = ref([]);

const loadEagleEyeLayers = async () => {
  try {
    const list = await getAllLayers('geo-eagle-eye', 'legacy-file'); // 🚨 鹰眼依然是实时数据，传默认值
    eagleEyeLayers.value = list || [];
  } catch (e) {
    console.error('加载鹰眼数据失败:', e);
    eagleEyeLayers.value = [];
  }
};

const eagleEyeTypeStats = computed(() => {
  const stats = {};
  eagleEyeLayers.value.forEach(l => {
    stats[l.type] = (stats[l.type] || 0) + 1;
  });
  return stats;
});

const typeLabel = (type) => {
  const map = {
    polygon: '多边形', rectangle: '矩形', polyline: '折线',
    circle: '圆形', ellipse: '椭圆', marker: '标记点'
  };
  return map[type] || type;
};

const handleClose = () => {
  emit('close');
};
</script>

<style scoped>
.inventory-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; }
.inventory-modal { width: 1000px; max-width: 90vw; height: 75vh; max-height: 90vh; background: #fff; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; position: relative; box-shadow: 0 10px 40px rgba(0,0,0,0.25); }
.inventory-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid #eee; background: #f8f9fa; }
.inventory-header h3 { margin: 0; font-size: 15px; color: #333; }
.close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #888; }
.close-btn:hover { color: #e74c3c; }
.inventory-tabs { display: flex; padding: 0 20px; background: #fff; border-bottom: 1px solid #eee; overflow-x: auto; }
.tab-btn { padding: 10px 16px; border: none; background: transparent; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; color: #666; white-space: nowrap; transition: 0.2s; display: flex; align-items: center; gap: 4px; }
.tab-btn:hover { color: #1890ff; background: #f5f8ff; }
.tab-btn.active { color: #1890ff; border-bottom-color: #1890ff; font-weight: 600; }
.tab-count { font-size: 11px; color: #888; }
.tab-btn.active .tab-count { color: #1890ff; }
.tab-live-badge { font-size: 10px; background: #52c41a; color: #fff; padding: 1px 6px; border-radius: 8px; }
.switch-hint { padding: 10px 20px; background: #fffbe6; border-bottom: 1px solid #ffe58f; font-size: 12px; color: #874d00; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.switch-hint button { padding: 4px 12px; font-size: 12px; background: #1890ff; color: #fff; border: none; border-radius: 3px; cursor: pointer; white-space: nowrap; }
.switch-hint button:hover { background: #40a9ff; }
.inventory-body { flex: 1; overflow: hidden; padding: 15px 20px; display: flex; flex-direction: column; }
.normal-panel { display: flex; flex-direction: column; height: 100%; }
.panel-actions { display: flex; gap: 10px; margin-bottom: 15px; }
.action-btn { padding: 8px 16px; font-size: 13px; border: none; border-radius: 4px; cursor: pointer; transition: 0.2s; background: #0066cc; color: #fff; }
.action-btn:hover { background: #0052a3; }
.action-btn.primary { background: #52c41a; }
.action-btn.primary:hover { background: #73d13d; }
.action-btn:disabled { background: #d9d9d9; color: #999; cursor: not-allowed; }
.project-list-box { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; background: #f9fafb; overflow-y: auto; padding: 10px; }
.empty-hint { text-align: center; color: #999; padding: 30px; font-size: 13px; }
.project-list { list-style: none; padding: 0; margin: 0; }
.project-list li { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; background: #fff; border-radius: 4px; margin-bottom: 6px; }
.project-list li:last-child { margin-bottom: 0; border-bottom: none; }
.proj-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.proj-name { font-weight: bold; color: #1f2937; font-size: 13px; }
.proj-file-id { color: #1890ff; font-size: 11px; font-weight: 600; } /* 🚨 新增样式 */
.proj-date { color: #6b7280; font-size: 11px; }
.proj-local { color: #52c41a; font-size: 10px; }
.proj-actions { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.small-btn { padding: 3px 8px; font-size: 11px; border-radius: 3px; cursor: pointer; background: #fff; transition: 0.2s; }
.open-btn { border: 1px solid #1890ff; color: #1890ff; }
.open-btn:hover { background: #e6f7ff; }
.export-data-btn { border: 1px solid #52c41a; color: #52c41a; }
.export-data-btn:hover { background: #f6ffed; }
.export-word-btn { border: 1px solid #722ed1; color: #722ed1; }
.export-word-btn:hover { background: #f9f0ff; }
.export-btn { border: 1px solid #faad14; color: #faad14; }
.export-btn:hover { background: #fffbe6; }
.local-btn { border: 1px solid #722ed1; color: #722ed1; }
.local-btn:hover { background: #f9f0ff; }
.delete-btn { border: 1px solid #e74c3c; color: #e74c3c; }
.delete-btn:hover { background: #fee2e2; }
.eagle-eye-panel { display: flex; flex-direction: column; height: 100%; gap: 12px; }
.ee-notice { padding: 10px 15px; background: #e6f7ff; border-left: 4px solid #1890ff; border-radius: 4px; font-size: 13px; color: #0050b3; }
.ee-stats { display: flex; flex-wrap: wrap; gap: 12px; }
.ee-stat-item { display: flex; flex-direction: column; align-items: center; padding: 10px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; min-width: 80px; }
.ee-stat-label { font-size: 11px; color: #888; margin-bottom: 4px; }
.ee-stat-value { font-size: 20px; font-weight: bold; color: #1890ff; }
.ee-list { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; background: #f9fafb; overflow-y: auto; padding: 10px; }
.ee-layer-list { list-style: none; padding: 0; margin: 0; }
.ee-layer-list li { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #fff; border-radius: 4px; margin-bottom: 6px; font-size: 12px; }
.ee-layer-id { font-family: monospace; color: #722ed1; font-size: 11px; width: 80px; }
.ee-layer-name { flex: 1; color: #333; }
.ee-layer-type { color: #888; font-size: 11px; width: 60px; text-align: right; }
.inventory-footer { display: flex; justify-content: flex-end; padding: 12px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
.footer-btn { padding: 8px 20px; background: #0066cc; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
.footer-btn:hover { background: #0052a3; }
.loading-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.95); z-index: 100; display: flex; justify-content: center; align-items: center; font-size: 15px; font-weight: bold; color: #1890ff; }
</style>