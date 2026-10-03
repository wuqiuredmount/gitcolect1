<template>
  <div class="app-container">
    <!-- 顶部标题栏 -->
    <header class="title-bar">
      <div class="title">良件-空间信息共享与集成</div>
      <div class="window-controls">
        <button class="settings-btn" @click="isSettingsOpen = true" title="设置">⚙️ 设置</button>
        <button>—</button><button>□</button><button>×</button>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="content-area">
      <!-- 左侧：垂直工具栏 -->
      <aside class="sidebar">
        <!-- 组切换器 -->
        <div class="group-selector">
          <button 
            v-for="group in groups" 
            :key="group.id"
            :class="{ active: currentGroupId === group.id }"
            @click="currentGroupId = group.id; currentTool = null;"
          >
            {{ group.name }}
          </button>
        </div>
        
        <!-- 工具列表 -->
        <div class="tool-list">
          <div 
            v-for="tool in currentGroupTools" 
            :key="tool.id" 
            class="tool-item" 
            :class="{ active: currentTool?.id === tool.id }"
            @click="openTool(tool)"
          >
            {{ tool.name }}
          </div>
        </div>
      </aside>

      <!-- 右侧：主视图 -->
      <div class="main-view">
        
        <!-- 关于我们模块 -->
        <div v-if="!currentTool" class="about-section">
          <div class="about-btn-wrapper">
            <button class="about-btn" @click="isAboutOpen = !isAboutOpen">
              关于我们
              <span class="triangle-icon" :class="{ open: isAboutOpen }"></span>
            </button>
          </div>
          <transition name="fade">
            <div v-if="isAboutOpen" class="about-content-box">
              <p>这是“良件-空间信息共享与集成软件”。我们想要使基于空间分布的信息能在一个共享和能互动的平台上流通，促进社会经济信息开放，服务美好社区打造和区域经济发展，服务个人和企业客户获取有价值的基于空间位置分布的信息。您发布的信息直接能够上传，但是我们会定期审核，不良信息和垃圾信息会被定期清理。我们发布的信息具有标准的格式，请您识别我司发布的信息和其他个体发布的信息。</p>
            </div>
          </transition>
        </div>

        <!-- 选择了工具时，动态加载对应的组件 -->
        <div v-if="currentTool" class="active-tool">
          <div class="active-tool-header">
            <span class="active-tool-name">{{ currentTool.name }}</span>
            <button class="back-btn" @click="currentTool = null">← 关闭工具</button>
          </div>
          <div class="tool-content">
            <component :is="currentTool.component" />
          </div>
        </div>
        
        <!-- 未选择工具时，显示欢迎/占位界面 -->
        <div v-else class="welcome-screen">
          <div class="welcome-icon">🧰</div>
          <p>请从左侧选择工具</p>
        </div>
      </div>
    </main>

    <!-- 设置弹窗 -->
    <div v-if="isSettingsOpen" class="modal-overlay">
      <div class="settings-modal">
        <div class="modal-header">
          <h3>⚙️ 系统设置</h3>
          <button class="close-btn" @click="isSettingsOpen = false">×</button>
        </div>
        
        <div class="settings-body">
          <!-- 文件保存位置 -->
          <div class="setting-item">
            <label>文件保存位置</label>
            <div class="setting-control">
              <span class="path-display">{{ settings.saveDirName || '未设置（默认浏览器下载路径）' }}</span>
              <button class="action-btn" @click="selectDirectory('save')">选择文件夹</button>
            </div>
            <p class="hint">设置后，“保存底图”、“导出 Excel”等操作将直接保存到该文件夹。</p>
          </div>

          <!-- 文件提取位置 -->
          <div class="setting-item">
            <label>默认文件提取位置</label>
            <div class="setting-control">
              <span class="path-display">{{ settings.loadDirName || '未设置（默认浏览器上传路径）' }}</span>
              <button class="action-btn" @click="selectDirectory('load')">选择文件夹</button>
            </div>
            <p class="hint">设置后，“打开底图”、“加载标注”等操作将默认从这个文件夹开始选择。</p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="save-btn" @click="isSettingsOpen = false">完成设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, markRaw, computed, reactive } from 'vue';

import ChinaMapTool from './components/tools/geo/ChinaMapTool.vue';
import WorldMapTool from './components/tools/geo/WorldMapTool.vue';
import ChinaProvinceMapTool from './components/tools/geo/ChinaProvinceMapTool.vue';
import CustomCanvasTool from './components/tools/geo/CustomCanvasTool.vue';
import ChinaStandardMapTool from './components/tools/geo/ChinaStandardMapTool.vue';

const currentTool = shallowRef(null);
const currentGroupId = ref('geo'); 
const isAboutOpen = ref(false);

// ================= 设置状态与逻辑 =================
const isSettingsOpen = ref(false);
const settings = reactive({ saveDirHandle: null, loadDirHandle: null, saveDirName: '', loadDirName: '' });

const initSettings = () => {
  settings.saveDirName = localStorage.getItem('app_save_dir_name') || '';
  settings.loadDirName = localStorage.getItem('app_load_dir_name') || '';
};
initSettings();

const selectDirectory = async (type) => {
  if (!window.showDirectoryPicker) {
    alert('您的浏览器不支持自动保存文件夹功能。建议使用最新版 Chrome 或 Edge 浏览器，或者将软件打包成 Electron 桌面版。');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    if (type === 'save') {
      settings.saveDirHandle = handle;
      settings.saveDirName = handle.name;
      localStorage.setItem('app_save_dir_name', handle.name);
    } else {
      settings.loadDirHandle = handle;
      settings.loadDirName = handle.name;
      localStorage.setItem('app_load_dir_name', handle.name);
    }
    alert(`成功选择文件夹：${handle.name}`);
  } catch (error) {
    if (error.name !== 'AbortError') console.error('选择文件夹失败:', error);
  }
};

defineExpose({ settings });

// ================= 工具注册 =================
const groups = ref([
  {
    id: 'geo',
    // ✨ 核心修改：将“地理信息”改为“信息分布共享与集成”
    name: '🗺️ 信息分布共享与集成', 
    tools: [
      { id: 'canvas', name: '1. 自定义地图+自由标记的信息分布空间', component: markRaw(CustomCanvasTool) },
      { id: 'map', name: '2. 中国卫星地图信息分布空间', component: markRaw(ChinaMapTool) },
      { id: 'map2', name: '3. 世界卫星地图信息分布空间', component: markRaw(WorldMapTool) },
      { id: 'map4', name: '4. 中国标准地图信息分布空间', component: markRaw(ChinaStandardMapTool) },
      { id: 'map3', name: '5. 中国省级行政区信息分布空间', component: markRaw(ChinaProvinceMapTool) },
      { id: 'geo-ph', name: '工具', component: null }
    ]
  },
  {
    id: 'card',
    name: '🧰 第二个工具组',
    tools: [
      ...Array.from({ length: 6 }).map((_, i) => ({ id: `card-ph-${i}`, name: '工具', component: null }))
    ]
  }
]);

const currentGroupTools = computed(() => {
  const group = groups.value.find(g => g.id === currentGroupId.value);
  return group ? group.tools : [];
});

const openTool = (tool) => {
  if (tool.component) currentTool.value = tool;
};
</script>

<style scoped>
/* ==========================================================
   🌞 现代明亮专业风格（高对比度、清晰易读）
   ========================================================== */

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f0f2f5;
  color: #1f2937;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  margin: 0;
  overflow: hidden;
}

/* ================= 顶部标题栏 ================= */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 50px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  z-index: 100;
}
.title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}
.window-controls { display: flex; align-items: center; gap: 8px; }
.window-controls button {
  background: transparent;
  border: 1px solid transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 12px;
  border-radius: 4px;
  transition: all 0.2s ease;
}
.window-controls button:hover {
  background: #f3f4f6;
  color: #1f2937;
}
.settings-btn {
  border: 1px solid #e5e7eb !important;
  color: #1f2937 !important;
  font-size: 13px !important;
}
.settings-btn:hover {
  background: #f9fafb !important;
  border-color: #d1d5db !important;
}

/* ================= 主内容区（左右分栏） ================= */
.content-area { flex: 1; display: flex; flex-direction: row; overflow: hidden; }

/* ================= 左侧垂直工具栏 ================= */
.sidebar {
  width: 240px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.group-selector {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #e5e7eb;
  padding: 8px;
  gap: 4px;
}
.group-selector button {
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  border-radius: 6px;
  transition: all 0.2s ease;
  text-align: left;
}
.group-selector button:hover { background: #f3f4f6; color: #1f2937; }
.group-selector button.active {
  color: #0066cc;
  background: #f0f7ff;
  font-weight: 600;
}

/* 工具列表（可滚动） */
.tool-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-item {
  padding: 12px 15px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
}
.tool-item:hover {
  background: #f0f7ff;
  color: #0066cc;
}
.tool-item.active {
  background: #e6f7ff;
  color: #0066cc;
  border-color: #bae0ff;
}

/* ================= 右侧主视图 ================= */
.main-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fafafa;
  position: relative;
}

/* 关于我们模块样式 */
.about-section {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.about-btn-wrapper {
  pointer-events: auto;
}

.about-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-left: none;
  color: #1f2937;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 0 0 8px 0;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.about-btn:hover {
  background: #f0f7ff;
  color: #0066cc;
}

/* 指向右侧的红色等边三角形图标 */
.triangle-icon {
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 8px solid #ff0000;
  transition: transform 0.3s ease, border-left-color 0.2s ease;
}

.about-btn:hover .triangle-icon {
  border-left-color: #cc0000;
}

.triangle-icon.open {
  transform: rotate(90deg);
}

.about-content-box {
  pointer-events: auto;
  width: 650px;
  max-width: 80%;
  margin: 10px;
  padding: 20px 25px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  color: #1f2937;
  font-size: 14px;
  line-height: 1.8;
  text-align: justify;
}

.about-content-box p {
  margin: 0;
}

/* 淡入淡出动画 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.welcome-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}
.welcome-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}
.welcome-screen p {
  font-size: 16px;
}

/* ================= 激活工具时的布局 ================= */
.active-tool { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
.active-tool-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; height: 50px;
  background: #ffffff; border-bottom: 1px solid #e5e7eb;
}
.active-tool-name { font-weight: 600; font-size: 15px; color: #1f2937; }
.back-btn {
  padding: 6px 15px; cursor: pointer; background: transparent;
  border: 1px solid #e5e7eb; color: #6b7280;
  border-radius: 4px; font-size: 13px; transition: all 0.2s ease;
}
.back-btn:hover { border-color: #0066cc; color: #0066cc; background: #f0f7ff; }
.tool-content { flex: 1; position: relative; overflow: hidden; }

/* ================= 设置弹窗 ================= */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex; justify-content: center; align-items: center; z-index: 9999;
}
.settings-modal {
  background: #ffffff !important;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  width: 600px; max-height: 85vh; border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 15px 20px; border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}
.modal-header h3 { margin: 0; font-size: 15px; color: #1f2937; font-weight: 600; }
.close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: #9ca3af; transition: 0.2s; }
.close-btn:hover { color: #4b5563; }

.settings-body { padding: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
.setting-item { display: flex; flex-direction: column; gap: 6px; }
.setting-item label { font-weight: 600; font-size: 13px; color: #1f2937; }
.setting-control { display: flex; align-items: center; gap: 10px; }
.path-display {
  flex: 1; padding: 8px 12px; background: #f3f4f6;
  border: 1px solid #e5e7eb; border-radius: 4px;
  font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ✨ 修复按钮可见性 */
.action-btn {
  padding: 8px 16px; background: #0066cc !important; color: #ffffff !important;
  border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500;
  transition: all 0.2s ease;
}
.action-btn:hover { background: #0052a3 !important; }

.hint { font-size: 11px; color: #9ca3af; margin: 0; }
.modal-footer {
  padding: 15px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb;
  display: flex; justify-content: flex-end;
}
.save-btn {
  padding: 8px 20px; background: #0066cc !important; color: #ffffff !important; border: none;
  border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;
  transition: all 0.2s ease;
}
.save-btn:hover { background: #0052a3 !important; }
</style>