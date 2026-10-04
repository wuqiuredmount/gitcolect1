<template>
  <!-- 🚨 核心新增：1秒启动界面 -->
  <div v-if="isLoading" class="splash-screen">
    <img src="/splash.jpg" alt="Loading..." />
  </div>

  <!-- 以下是您原有的完整代码，原封不动 -->
  <div class="app-container">
    <!-- 顶部标题栏 -->
    <header class="title-bar">
      <div class="title"> 良件-空间信息共享与集成 </div>
      <div class="window-controls">
        <button class="save-action-btn" @click="handleSaveCurrentProject" title="保存当前工程到文件库存"> 💾 保存</button>
        <button class="inventory-btn" @click="isInventoryOpen = true" title="文件库存"> 📁 文件库存</button>
        <button class="settings-btn" @click="isSettingsOpen = true" title="设置"> ⚙️ 设置</button>
        <button></button><button></button><button></button>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="content-area">
      <aside class="sidebar">
        <div class="group-selector">
          <button v-for="group in groups" :key="group.id" :class="{ active: currentGroupId === group.id }" @click="currentGroupId = group.id; currentTool = null;">
            {{ group.name }}
          </button>
        </div>
        <div class="tool-list">
          <div v-for="tool in currentGroupTools" :key="tool.id" class="tool-item" :class="{ active: currentTool?.id === tool.id }" @click="openTool(tool)">
            {{ tool.name }}
          </div>
        </div>
      </aside>

      <div class="main-view">
        <div v-if="!currentTool" class="about-section">
          <div class="about-btn-wrapper">
            <button class="about-btn" @click="isAboutOpen = !isAboutOpen">
              关于我们 <span class="triangle-icon" :class="{ open: isAboutOpen }"></span>
            </button>
          </div>
          <transition name="fade">
            <div v-if="isAboutOpen" class="about-content-box">
              <p>这是“良件-空间信息共享与集成软件”。我们想要使基于空间分布的信息能在一个共享和能互动的平台上流通，促进社会经济信息开放，服务美好社区打造和区域经济发展，服务个人和企业客户获取有价值的基于空间位置分布的信息。您发布的信息直接能够上传，但是我们会定期审核，不良信息和垃圾信息会被定期清理。我们发布的信息具有标准的格式，请您识别我司发布的信息和其他个体发布的信息。</p>
              <p style="margin-top: 12px;">我们的软件结构是“工具组”“工具”和“小工具”，在设置中，你能决定“小工具”的开关。</p>
            </div>
          </transition>
        </div>

        <div v-if="currentTool" class="active-tool">
          <div class="active-tool-header" id="tool-header">
            <span class="active-tool-name">{{ currentTool.name }}</span>
            <div id="tool-header-slot" class="header-slot"></div>
            <button class="back-btn" @click="currentTool = null"> - 关闭工具</button>
          </div>
          <div class="tool-content" v-if="isHeaderReady">
            <component :is="currentTool.component" ref="toolContentRef" />
          </div>
        </div>

        <div v-else class="welcome-screen">
          <div class="welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1890ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 64px; height: 64px;">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </div>
          <p>请从左侧选择工具</p>
        </div>
      </div>
    </main>

    <!-- 设置弹窗 -->
    <div v-if="isSettingsOpen" class="modal-overlay">
      <div class="settings-modal">
        <div class="modal-header">
          <h3>系统设置</h3>
          <button class="close-btn" @click="isSettingsOpen = false">x</button>
        </div>
        <div class="settings-body">
          <!-- 文件保存位置 -->
          <div class="setting-item">
            <label>默认文件保存位置</label>
            <div class="setting-control">
              <span class="path-display">{{ settings.saveDirName || '未设置（默认浏览器下载路径）' }}</span>
              <button class="action-btn" @click="selectDirectory('save')">选择文件夹</button>
            </div>
            <p class="hint">设置后，“保存工程”、“保存底图”等操作将默认保存到该文件夹。</p>
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

          <!-- 小工具开关器配置区 -->
          <div class="setting-item widget-settings-section">
            <label>小工具开关器</label>
            <p class="hint">为每个地图工具独立配置需要显示的辅助小工具，修改后切换或刷新工具即可看到效果。</p>
            
            <div class="widgets-config-container">
              <div v-for="tool in validTools" :key="tool.id" class="tool-config-block">
                <div class="tool-config-title">{{ tool.name }}</div>
                <div class="widget-switches-grid">
                  <label v-for="widget in ALL_WIDGETS" :key="widget.key" class="widget-switch-label">
                    <input type="checkbox" v-model="globalToolSettings[tool.id][widget.key]" />
                    <span>{{ widget.name }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- 新放置图形默认样式配置区 -->
          <div class="setting-item widget-settings-section">
            <label>新放置图形默认样式</label>
            <p class="hint">修改这里的配置，将会影响未来新绘制的图形的初始样式。已存在的图形不受影响。</p>
            
            <div class="default-styles-container">
              <div class="style-config-card" v-for="(style, type) in globalDefaultStyles" :key="type">
                <div class="style-config-title">{{ typeMap[type] || type }}</div>
                <div class="style-config-body">
                  <div class="config-row">
                    <span>边框/线条颜色</span>
                    <input type="color" v-model="style.color" />
                  </div>
                  <div class="config-row" v-if="type !== 'polyline' && type !== 'marker'">
                    <span>填充颜色</span>
                    <input type="color" v-model="style.fillColor" />
                  </div>
                  <div class="config-row" v-if="type !== 'polyline' && type !== 'marker'">
                    <span>填充透明度</span>
                    <input type="range" min="0" max="1" step="0.05" v-model.number="style.fillOpacity" />
                  </div>
                  <div class="config-row" v-if="type !== 'marker'">
                    <span>线宽</span>
                    <input type="range" min="1" max="200" step="1" v-model.number="style.weight" />
                  </div>
                  
                  <template v-if="type === 'marker'">
                    <div class="config-row">
                      <span>图标大小</span>
                      <input type="range" min="16" max="64" step="4" v-model.number="style.iconSize" />
                    </div>
                    <div class="config-row">
                      <span>图标透明度</span>
                      <input type="range" min="0.1" max="1" step="0.1" v-model.number="style.fillOpacity" />
                    </div>
                    <div class="config-row" style="margin-top: 6px;">
                      <span>预设图标样式</span>
                    </div>
                    <div class="default-icon-grid">
                      <div 
                        v-for="icon in MARKER_ICONS" 
                        :key="icon.id" 
                        class="default-icon-item" 
                        :class="{ active: style.iconType === icon.id }"
                        @click="style.iconType = icon.id"
                        :title="icon.name"
                      >
                        <div v-html="getIconPreview(icon.svg)" style="width: 20px; height: 20px;"></div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="save-btn" @click="isSettingsOpen = false">完成设置</button>
        </div>
      </div>
    </div>

    <!-- 文件库存弹窗 -->
    <div v-if="isInventoryOpen" class="modal-overlay">
      <div class="settings-modal inventory-modal">
        <div class="modal-header">
          <h3>📁 文件库存 - 信息分布共享与集成</h3>
          <button class="close-btn" @click="isInventoryOpen = false">x</button>
        </div>
        <div class="settings-body">
          <div class="inventory-actions" style="display: flex; gap: 10px; margin-bottom: 15px;">
            <button class="action-btn" style="background: #52c41a !important;" @click="handleSaveCurrentProject">💾 保存当前工作区</button>
            <button class="action-btn" @click="triggerProjectImport">📥 导入本地工程文件</button>
            <input type="file" ref="projectInputRef" accept=".geo,.json" style="display:none;" @change="handleProjectImport" />
          </div>

          <div class="project-list-container" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb;">
            <h4 style="margin-top: 0; font-size: 13px; color: #374151;">已保存的工程</h4>
            <div v-if="projectList.length === 0" class="empty-project" style="text-align: center; color: #999; padding: 20px; font-size: 12px;">库存为空</div>
            <ul v-else class="project-list" style="list-style: none; padding: 0; margin: 0;">
              <li v-for="proj in projectList" :key="proj.id" class="project-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; font-size: 12px;">
                <div class="proj-info" style="display: flex; flex-direction: column; gap: 2px;">
                  <span class="proj-name" style="font-weight: bold; color: #1f2937;">{{ proj.name }}</span>
                  <span class="proj-date" style="color: #6b7280; font-size: 10px;">{{ new Date(proj.createdAt).toLocaleString() }}</span>
                  <span class="proj-tool" style="color: #1890ff; font-size: 10px;">关联工具: {{ getToolNameById(proj.toolId) }}</span>
                  <span v-if="proj.localPath" style="color: #52c41a; font-size: 10px;">📁 已保存到本地: {{ proj.localPath }}</span>
                </div>
                <div class="proj-actions" style="display: flex; gap: 5px;">
                  <button @click="openProject(proj)" class="small-btn open-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #1890ff; background: #fff; color: #1890ff; border-radius: 3px; cursor: pointer;">打开</button>
                  <button @click="exportExcelOnly(proj)" class="small-btn export-data-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #52c41a; background: #fff; color: #52c41a; border-radius: 3px; cursor: pointer;">导出信息栏</button>
                  <button @click="exportWordOnly(proj)" class="small-btn export-word-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #722ed1; background: #fff; color: #722ed1; border-radius: 3px; cursor: pointer;">导出文档</button>
                  <button @click="exportProject(proj)" class="small-btn export-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #faad14; background: #fff; color: #faad14; border-radius: 3px; cursor: pointer;">导出工程</button>
                  <button v-if="proj.localPath" @click="openLocalFolder(proj)" class="small-btn local-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #722ed1; background: #fff; color: #722ed1; border-radius: 3px; cursor: pointer;">📂 打开本地文件夹</button>
                  <button @click="deleteProject(proj.id)" class="small-btn delete-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #e74c3c; background: #fff; color: #e74c3c; border-radius: 3px; cursor: pointer;">删除</button>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div class="modal-footer">
          <button class="save-btn" @click="isInventoryOpen = false">关闭库存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, markRaw, computed, reactive, watch, nextTick, onMounted } from 'vue';
import ChinaMapTool from './components/tools/geo/ChinaMapTool.vue';
import WorldMapTool from './components/tools/geo/WorldMapTool.vue';
import ChinaProvinceMapTool from './components/tools/geo/ChinaProvinceMapTool.vue';
import CustomCanvasTool from './components/tools/geo/CustomCanvasTool.vue';
import ChinaStandardMapTool from './components/tools/geo/ChinaStandardMapTool.vue';
import EagleEyeMapTool from './components/tools/geo/EagleEyeMapTool.vue';
import InfiniteCanvasTool from './components/tools/geo/InfiniteCanvasTool.vue';

import { globalToolSettings, ALL_WIDGETS, initToolSettings, globalDefaultStyles } from './groups/geo/utils/toolSettings';
import { MARKER_ICONS } from './groups/geo/utils/markerIcons';
import { getAllProjects, deleteProjectFromInventory, saveProjectToInventory } from './groups/geo/utils/projectStore';
import { parseProjectFile, downloadProjectFile } from './groups/geo/utils/projectManager';
import { exportToExcel } from './groups/geo/utils/excelExporter';

const currentTool = shallowRef(null);
const currentGroupId = ref('geo');
const isAboutOpen = ref(false);
const isSettingsOpen = ref(false);
const isInventoryOpen = ref(false);
const isHeaderReady = ref(false);

// 🚨 核心新增：启动界面状态
const isLoading = ref(true);
onMounted(() => {
  setTimeout(() => {
    isLoading.value = false;
  }, 1000); // 1秒后关闭启动界面
});

const toolContentRef = ref(null);
const projectInputRef = ref(null);
const projectList = ref([]);

const settings = reactive({ saveDirHandle: null, loadDirHandle: null, saveDirName: '', loadDirName: '' });

const typeMap = {
  polygon: '多边形',
  rectangle: '矩形',
  polyline: '折线',
  circle: '圆形',
  ellipse: '椭圆',
  marker: '标记点'
};

const getIconPreview = (svgStr) => {
  return svgStr.replace(/#COLOR#/g, '#1890ff');
};

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
    alert(`成功选择文件夹: ${handle.name}`);
  } catch (error) {
    if (error.name !== 'AbortError') console.error('选择文件夹失败:', error);
  }
};

const groups = ref([
  {
    id: 'geo',
    name: '🗺️ 信息分布共享与集成',
    tools: [
      { id: 'geo-eagle-eye', name: '1. 鹰眼公共平台', component: markRaw(EagleEyeMapTool) },
      { id: 'geo-custom-canvas', name: '2. 自定义地图+自由标记的信息分布空间', component: markRaw(CustomCanvasTool) },
      { id: 'geo-china-map', name: '3. 中国卫星地图信息分布空间', component: markRaw(ChinaMapTool) },
      { id: 'geo-world-map', name: '4. 世界卫星地图信息分布空间', component: markRaw(WorldMapTool) },
      { id: 'geo-china-standard-map', name: '5. 中国标准地图信息分布空间', component: markRaw(ChinaStandardMapTool) },
      { id: 'geo-province-map', name: '6. 中国省级行政区信息分布空间', component: markRaw(ChinaProvinceMapTool) },
      { id: 'geo-infinite-canvas', name: '7. 无限白色画布', component: markRaw(InfiniteCanvasTool) }
    ]
  },
  {
    id: 'card',
    name: '🗂️ 第二个工具组',
    tools: [
      ...Array.from({ length: 6 }).map((_, i) => ({ id: `card-ph-${i}`, name: '工具', component: null }))
    ]
  }
]);

groups.value.forEach(group => {
  group.tools.forEach(tool => {
    if (tool.component) {
      initToolSettings(tool.id, {});
    }
  });
});

const validTools = computed(() => {
  const tools = [];
  groups.value.forEach(group => {
    group.tools.forEach(tool => {
      if (tool.component) tools.push(tool);
    });
  });
  return tools;
});

const currentGroupTools = computed(() => {
  const group = groups.value.find(g => g.id === currentGroupId.value);
  return group ? group.tools : [];
});

const openTool = (tool) => {
  if (tool.component) currentTool.value = tool;
};

watch(currentTool, async (val) => {
  if (val) {
    isHeaderReady.value = false;
    await nextTick(); 
    setTimeout(() => {
      isHeaderReady.value = true;
    }, 0);
  }
}, { flush: 'post' });

const getToolNameById = (toolId) => {
  let name = '未知工具';
  groups.value.forEach(group => {
    group.tools.forEach(tool => {
      if (tool.id === toolId) name = tool.name;
    });
  });
  return name;
};

// ==================== 文件库存逻辑 ====================

const getActiveMapTool = () => {
  if (toolContentRef.value && toolContentRef.value.getProjectData) {
    return toolContentRef.value;
  }
  return null;
};

const loadProjectList = async () => {
  const toolId = currentTool.value ? currentTool.value.id : 'geo-eagle-eye';
  const allProjects = await getAllProjects(toolId);
  projectList.value = allProjects.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
};

watch(isInventoryOpen, (val) => {
  if (val) loadProjectList();
});

const handleSaveCurrentProject = async () => {
  const mapToolInstance = getActiveMapTool();
  if (!mapToolInstance || !mapToolInstance.saveProjectToInventory) {
    alert('请先打开“信息分布共享与集成”组内的任意一个工具，并且确保地图已加载！');
    return;
  }
  
  const projectName = prompt('请输入工程名称：', `工程_${new Date().toLocaleDateString()}`);
  if (projectName === null || projectName.trim() === '') return;

  try {
    const savedProject = await mapToolInstance.saveProjectToInventory(projectName.trim());
    
    if (settings.saveDirHandle) {
      try {
        const fileName = `${projectName.trim()}.geo`;
        const fileHandle = await settings.saveDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(savedProject, null, 2));
        await writable.close();
        
        savedProject.localPath = `${settings.saveDirName}/${fileName}`;
        await saveProjectToInventory(savedProject);
      } catch (localErr) {
        console.warn('保存到本地文件失败:', localErr);
      }
    }

    alert(`工程“${projectName}”已成功保存到文件库存！`);
    if (isInventoryOpen.value) loadProjectList();
  } catch (e) {
    alert('保存失败：' + e.message);
  }
};

const openLocalFolder = (proj) => {
  if (window.electron && window.electron.openPath) {
    window.electron.openPath(proj.localPath);
  } else {
    alert(`浏览器环境无法直接打开本地文件夹。\n文件已保存至：\n${proj.localPath}\n请手动打开该目录。`);
  }
};

const triggerProjectImport = () => projectInputRef.value.click();

const handleProjectImport = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = parseProjectFile(e.target.result);
      const mapToolInstance = getActiveMapTool();
      
      if (mapToolInstance && mapToolInstance.loadProjectData) {
        await mapToolInstance.loadProjectData(data);
        await saveProjectToInventory(data);
        loadProjectList();
        alert('工程导入成功！');
      } else {
        alert('请先在左侧打开“信息分布共享与集成”组内的任意一个工具，再导入工程文件！');
      }
    } catch (err) {
      alert(err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

const openProject = async (proj) => {
  let targetTool = null;
  groups.value.forEach(group => {
    group.tools.forEach(tool => {
      if (tool.id === proj.toolId) targetTool = tool;
    });
  });

  if (!targetTool) {
    alert(`未找到该工程对应的工具：${proj.toolId}，无法加载。`);
    return;
  }

  if (currentTool.value?.id !== targetTool.id) {
    currentTool.value = targetTool;
    isInventoryOpen.value = false;
    
    const waitForMapReady = () => {
      return new Promise(resolve => {
        const check = () => {
          const instance = getActiveMapTool();
          if (instance && instance.loadProjectData) {
            resolve(instance);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    };

    try {
      const mapToolInstance = await waitForMapReady();
      await mapToolInstance.loadProjectData(proj);
      alert('工程加载成功！');
    } catch (e) {
      alert('工程加载失败：' + e.message);
    }
  } else {
    const mapToolInstance = getActiveMapTool();
    if (mapToolInstance && mapToolInstance.loadProjectData) {
      try {
        await mapToolInstance.loadProjectData(proj);
        isInventoryOpen.value = false;
        alert('工程加载成功！');
      } catch (e) {
        alert('工程加载失败：' + e.message);
      }
    } else {
      alert('地图组件未就绪，请稍后重试。');
    }
  }
};

const exportProject = (proj) => {
  downloadProjectFile(proj, proj.name);
};

const deleteProject = async (id) => {
  if (confirm('确定删除该工程吗？')) {
    await deleteProjectFromInventory(id);
    loadProjectList();
  }
};

const exportExcelOnly = (proj) => {
  if (!proj.layers || proj.layers.length === 0) {
    alert('该工程没有图形数据！');
    return;
  }
  exportToExcel(proj.layers);
};

const exportWordOnly = (proj) => {
  if (!proj.layers || proj.layers.length === 0) {
    alert('该工程没有图形数据！');
    return;
  }
  let hasWord = false;
  proj.layers.forEach((layer, index) => {
    if (layer.docHtml && layer.docHtml.trim() !== '') {
      hasWord = true;
      const docName = layer.title || `图形${index + 1}`;
      const titleHtml = `<p style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">文档名称: ${docName}</p>`;
      const fullHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>${docName}</title></head><body>${titleHtml}${layer.docHtml}</body></html>`;
      const blob = new Blob([fullHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docName}.doc`;
      link.click();
      URL.revokeObjectURL(url);
    }
  });
  if (!hasWord) alert('该工程没有富文本编辑器数据！');
};
</script>

<style scoped>
/* 🚨 核心新增：启动界面样式 */
.splash-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
}
.splash-screen img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* 以下是原有的所有样式，保持原样 */
.app-container { display: flex; flex-direction: column; height: 100vh; background-color: #f0f2f5; color: #1f2937; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; margin: 0; overflow: hidden; }
.title-bar { display: flex; justify-content: space-between; align-items: center; padding: 0 20px; height: 50px; background: #ffffff; border-bottom: 1px solid #e5e7eb; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); z-index: 100; }
.title { font-size: 15px; font-weight: 600; color: #1f2937; }
.window-controls { display: flex; align-items: center; gap: 8px; }
.window-controls button { background: transparent; border: 1px solid transparent; color: #6b7280; cursor: pointer; font-size: 14px; padding: 4px 12px; border-radius: 4px; transition: all 0.2s ease; }
.window-controls button:hover { background: #f3f4f6; color: #1f2937; }
.settings-btn { border: 1px solid #e5e7eb !important; color: #1f2937 !important; font-size: 13px !important; }
.settings-btn:hover { background: #f9fafb !important; border-color: #d1d5db !important; }
.inventory-btn { border: 1px solid #e5e7eb !important; color: #1f2937 !important; font-size: 13px !important; }
.inventory-btn:hover { background: #f9fafb !important; border-color: #d1d5db !important; }
.save-action-btn { border: 1px solid #52c41a !important; color: #52c41a !important; font-size: 13px !important; background: #f6ffed !important; }
.save-action-btn:hover { background: #d9f7be !important; }
.content-area { flex: 1; display: flex; flex-direction: row; overflow: hidden; }
.sidebar { width: 240px; background: #ffffff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; overflow: hidden; }
.group-selector { display: flex; flex-direction: column; border-bottom: 1px solid #e5e7eb; padding: 8px; gap: 4px; }
.group-selector button { padding: 10px 12px; border: none; background: transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #6b7280; border-radius: 6px; transition: all 0.2s ease; text-align: left; }
.group-selector button:hover { background: #f3f4f6; color: #1f2937; }
.group-selector button.active { color: #0066cc; background: #f0f7ff; font-weight: 600; }
.tool-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.tool-item { padding: 12px 15px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; color: #1f2937; transition: all 0.2s ease; border: 1px solid transparent; display: flex; align-items: center; }
.tool-item:hover { background: #f0f7ff; color: #0066cc; }
.tool-item.active { background: #e6f7ff; color: #0066cc; border-color: #bae0ff; }
.main-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fafafa; position: relative; }
.about-section { position: absolute; top: 0; left: 0; z-index: 10; display: flex; flex-direction: column; pointer-events: none; }
.about-btn-wrapper { pointer-events: auto; }
.about-btn { display: flex; align-items: center; gap: 8px; background: #ffffff; border: 1px solid #e5e7eb; border-left: none; color: #1f2937; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 0 0 8px 0; transition: all 0.2s ease; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
.about-btn:hover { background: #f0f7ff; color: #0066cc; }
.triangle-icon { width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 8px solid #ff0000; transition: transform 0.3s ease, border-left-color 0.2s ease; }
.about-btn:hover .triangle-icon { border-left-color: #cc0000; }
.triangle-icon.open { transform: rotate(90deg); }
.about-content-box { pointer-events: auto; width: 650px; max-width: 80%; margin: 10px; padding: 20px 25px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); color: #1f2937; font-size: 14px; line-height: 1.8; text-align: justify; }
.about-content-box p { margin: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-10px); }
.welcome-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #6b7280; }
.welcome-icon { margin-bottom: 16px; display: flex; align-items: center; justify-content: center; }
.welcome-screen p { font-size: 16px; }
.active-tool { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
.active-tool-header { display: flex; align-items: center; justify-content: space-between; padding: 0 20px; height: 50px; background: #ffffff; border-bottom: 1px solid #e5e7eb; position: relative; }
.active-tool-name { font-size: 15px; font-weight: 600; color: #1f2937; white-space: nowrap; margin-right: 15px; }
.header-slot { flex: 1; display: flex; align-items: center; }
.back-btn { background: #fff; border: 1px solid #e5e7eb; color: #4b5563; cursor: pointer; font-size: 13px; padding: 4px 12px; border-radius: 4px; transition: 0.2s; white-space: nowrap; margin-left: 15px; }
.back-btn:hover { background: #f3f4f6; color: #1f2937; }
.tool-content { flex: 1; position: relative; overflow: hidden; }

/* 弹窗样式 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; }
.settings-modal { width: 750px; max-height: 90vh; background: #fff; border-radius: 5px; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; font-size: 14px; }
.close-btn { background: none; border: none; font-size: 18px; cursor: pointer; }
.settings-body { padding: 15px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
.setting-item { display: flex; flex-direction: column; gap: 5px; }
.setting-item label { font-size: 13px; font-weight: 600; color: #333; }
.setting-control { display: flex; align-items: center; gap: 10px; }
.path-display { flex: 1; padding: 8px 12px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action-btn { padding: 8px 16px; background: #0066cc !important; color: #ffffff !important; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease; }
.action-btn:hover { background: #0052a3 !important; }
.hint { font-size: 11px; color: #9ca3af; margin: 0; }
.modal-footer { padding: 15px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; }
.save-btn { padding: 8px 20px; background: #0066cc !important; color: #ffffff !important; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; }
.save-btn:hover { background: #0052a3 !important; }

.widget-settings-section { display: flex; flex-direction: column; }
.widgets-config-container { max-height: 250px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb; margin-top: 8px; }
.tool-config-block { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #e5e7eb; }
.tool-config-block:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
.tool-config-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.widget-switches-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.widget-switch-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4b5563; cursor: pointer; }
.widget-switch-label input[type="checkbox"] { cursor: pointer; accent-color: #1890ff; }

.default-styles-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
  background: #f9fafb;
}
.style-config-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px;
}
.style-config-card:last-child {
  grid-column: span 3;
}
.style-config-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
  text-align: center;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 4px;
}
.style-config-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #555;
}
.config-row input[type="color"] {
  width: 20px;
  height: 14px;
  padding: 0;
  border: 1px solid #ccc;
  border-radius: 2px;
  cursor: pointer;
}
.config-row input[type="range"] {
  width: 60px;
}

.default-icon-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
  margin-top: 4px;
  border-top: 1px dashed #eee;
  padding-top: 8px;
}
.default-icon-item {
  width: 32px;
  height: 32px;
  border: 1px solid #ddd;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #fff;
  transition: all 0.2s;
}
.default-icon-item:hover { border-color: #1890ff; background: #e6f7ff; }
.default-icon-item.active { border-color: #1890ff; background: #bae0ff; box-shadow: 0 0 0 1px #1890ff; }
</style>