<template>
  <div class="app-container">
    <header class="title-bar">
      <div class="title">良件-空间信息共享与集成</div>
      <div class="window-controls">
        <button class="settings-btn" @click="isSettingsOpen = true" title="设置">⚙️ 设置</button>
        <button>—</button><button>□</button><button>×</button>
      </div>
    </header>

    <main class="content-area">
      <template v-if="!currentTool">
        <div class="group-selector">
          <button 
            v-for="group in groups" 
            :key="group.id"
            :class="{ active: currentGroupId === group.id }"
            @click="currentGroupId = group.id"
          >
            {{ group.name }}
          </button>
        </div>

        <div class="tool-grid">
          <div 
            v-for="tool in currentGroupTools" 
            :key="tool.id" 
            class="tool-card" 
            @click="openTool(tool)"
          >
            {{ tool.name }}
          </div>
        </div>

        <!-- ✨ 风景图轮播区域 -->
        <div class="slideshow-container">
          <template v-if="slideshowImages.length > 0">
            <transition-group name="fade" tag="div">
              <img 
                v-for="(img, index) in slideshowImages" 
                :key="img.id"
                :src="img.url" 
                v-show="currentImageIndex === index"
                class="slide-image"
                alt="轮播图"
              />
            </transition-group>
            <div class="indicators">
              <span 
                v-for="(img, index) in slideshowImages" 
                :key="'dot-' + index"
                :class="{ active: currentImageIndex === index }"
                @click="currentImageIndex = index"
                class="dot"
              ></span>
            </div>
          </template>
          <div v-else class="no-images">
            <p>🖼️ 暂未设置轮播图片</p>
            <p class="sub-hint">请点击右上角“⚙️ 设置”，上传您的图片</p>
          </div>
        </div>
      </template>
      
      <div v-else class="active-tool">
        <div class="active-tool-header">
          <span class="active-tool-name">{{ currentTool.name }}</span>
          <button class="back-btn" @click="currentTool = null">← 返回工具箱</button>
        </div>
        <div class="tool-content">
          <component :is="currentTool.component" />
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

          <!-- ✨ 轮播图管理 -->
          <div class="setting-item">
            <label>初始界面轮播图片</label>
            <div class="slideshow-actions">
              <button class="action-btn" @click="triggerImageUpload">📤 上传图片</button>
              <button class="action-btn secondary" @click="restoreDefaultImages" v-if="deletedDefaultIds.length > 0">🔄 恢复默认</button>
              <input 
                type="file" 
                ref="imageUploadInputRef" 
                accept="image/*" 
                multiple 
                style="display: none" 
                @change="handleUploadImages" 
              />
            </div>
            <div v-if="slideshowImages.length > 0" class="image-thumbnails">
              <div 
                v-for="img in slideshowImages" 
                :key="img.id" 
                class="thumbnail-item"
              >
                <img :src="img.url" :alt="img.name" />
                <button class="delete-thumb-btn" @click="removeImage(img)" title="删除">×</button>
                <span class="thumb-name">{{ img.name }}</span>
              </div>
            </div>
            <p v-else class="hint">暂无图片，点击上方“上传图片”添加。</p>
            <p class="hint">建议单张图片不要超过 5MB，支持多选批量上传。</p>
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
import { ref, shallowRef, markRaw, computed, reactive, onMounted, onUnmounted, watch } from 'vue';

import ChinaMapTool from './components/tools/geo/ChinaMapTool.vue';
import WorldMapTool from './components/tools/geo/WorldMapTool.vue';
import ChinaProvinceMapTool from './components/tools/geo/ChinaProvinceMapTool.vue';
import CustomCanvasTool from './components/tools/geo/CustomCanvasTool.vue';

// ✨ 引入 IndexedDB 存储工具
import { getAllImages, addImage, deleteImage, clearAllImages } from './utils/imageStore.js';

const currentTool = shallowRef(null);
const currentGroupId = ref('geo'); 

// ================= 轮播图数据管理 =================
// 默认图片（存放在 public/images/ 目录下）
const defaultImages = [
  { id: 'default-16',   name: '16.jpg',   url: '/images/16.jpg',   isDefault: true },
  { id: 'default-1451', name: '1451.jpg', url: '/images/1451.jpg', isDefault: true },
  { id: 'default-14',   name: '14.jpg',   url: '/images/14.jpg',   isDefault: true },
  { id: 'default-454',  name: '454.jpg',  url: '/images/454.jpg',  isDefault: true },
  { id: 'default-11',   name: '11.jpg',   url: '/images/11.jpg',   isDefault: true },
  { id: 'default-451',  name: '451.jpg',  url: '/images/451.jpg',  isDefault: true },
  { id: 'default-154',  name: '154.jpg',  url: '/images/154.jpg',  isDefault: true }
];

// 被用户删除的默认图片 id（记录到 localStorage）
const deletedDefaultIds = ref(JSON.parse(localStorage.getItem('deleted_default_ids') || '[]'));

// 用户上传的图片（从 IndexedDB 加载）
const userImages = ref([]);

// 合并的轮播图列表
const slideshowImages = computed(() => {
  const defaults = defaultImages
    .filter(img => !deletedDefaultIds.value.includes(img.id))
    .map(img => ({ ...img }));
  return [...defaults, ...userImages.value];
});

const currentImageIndex = ref(0);
let slideshowTimer = null;

// 从 IndexedDB 加载用户图片
const loadUserImages = async () => {
  const records = await getAllImages();
  // 清理旧的 Blob URL
  userImages.value.forEach(img => URL.revokeObjectURL(img.url));
  userImages.value = records.map(r => ({
    id: r.id,
    name: r.name,
    url: URL.createObjectURL(r.blob),
    isDefault: false
  }));
};

const startSlideshow = () => {
  stopSlideshow();
  slideshowTimer = setInterval(() => {
    if (slideshowImages.value.length > 0) {
      currentImageIndex.value = (currentImageIndex.value + 1) % slideshowImages.value.length;
    }
  }, 5000);
};

const stopSlideshow = () => {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
};

// 监听工具切换
watch(currentTool, (newTool) => {
  if (newTool) {
    stopSlideshow();
  } else {
    startSlideshow();
  }
});

// 监听图片数量变化，防止索引越界
watch(() => slideshowImages.value.length, (newLen) => {
  if (newLen === 0) {
    currentImageIndex.value = 0;
  } else if (currentImageIndex.value >= newLen) {
    currentImageIndex.value = newLen - 1;
  }
});

// ================= 上传/删除轮播图 =================
const imageUploadInputRef = ref(null);

const triggerImageUpload = () => {
  imageUploadInputRef.value.click();
};

const handleUploadImages = async (event) => {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  
  for (const file of files) {
    // 检查图片大小（建议不超过 10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert(`图片 ${file.name} 超过 10MB，已跳过。建议压缩后再上传。`);
      continue;
    }
    await addImage(file);
  }
  
  await loadUserImages();
  event.target.value = '';
};

const removeImage = async (img) => {
  if (img.isDefault) {
    // 默认图片：只记录“已删除”状态
    if (!deletedDefaultIds.value.includes(img.id)) {
      deletedDefaultIds.value.push(img.id);
      localStorage.setItem('deleted_default_ids', JSON.stringify(deletedDefaultIds.value));
    }
  } else {
    // 用户上传图片：从 IndexedDB 删除
    await deleteImage(img.id);
    URL.revokeObjectURL(img.url);
    await loadUserImages();
  }
};

const restoreDefaultImages = async () => {
  deletedDefaultIds.value = [];
  localStorage.removeItem('deleted_default_ids');
  await clearAllImages();
  await loadUserImages();
};

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

// ================= 生命周期 =================
onMounted(async () => {
  await loadUserImages();
  startSlideshow();
});

onUnmounted(() => {
  stopSlideshow();
  userImages.value.forEach(img => URL.revokeObjectURL(img.url));
});

// ================= 工具注册 =================
const groups = ref([
  {
    id: 'geo',
    name: '🗺️ 地理信息',
    tools: [
      { id: 'map', name: '世界卫星地图', component: markRaw(ChinaMapTool) },
      { id: 'map2', name: '世界卫星地图2', component: markRaw(WorldMapTool) },
      { id: 'map3', name: '中国省级行政', component: markRaw(ChinaProvinceMapTool) },
      { id: 'canvas', name: '自定义底图+自由标记', component: markRaw(CustomCanvasTool) },
      ...Array.from({ length: 2 }).map((_, i) => ({ id: `geo-ph-${i}`, name: '工具', component: null }))
    ]
  },
  {
    id: 'card',
    name: '🎴 卡牌游戏',
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
  if (tool.component) {
    currentTool.value = tool;
  }
};
</script>

<style scoped>
.app-container { display: flex; flex-direction: column; height: 100vh; background: #f0f0f0; font-family: sans-serif; margin: 0; }
.title-bar { display: flex; justify-content: space-between; padding: 10px 15px; background: #fff; border-bottom: 1px solid #ccc; font-size: 16px; }
.window-controls { display: flex; align-items: center; gap: 10px; }
.window-controls button { margin-left: 5px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 14px; padding: 2px 8px; border-radius: 3px; }
.window-controls button:hover { background: #f0f0f0; }
.settings-btn { background: #fff !important; border-color: #ccc !important; font-size: 13px !important; }
.settings-btn:hover { background: #e6f7ff !important; color: #1890ff !important; }

.content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

.group-selector { display: flex; background: #fff; border-bottom: 1px solid #ccc; padding: 0 10px; }
.group-selector button { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 14px; font-weight: bold; color: #666; border-bottom: 2px solid transparent; transition: 0.2s; }
.group-selector button:hover { background: #f5f5f5; }
.group-selector button.active { color: #1890ff; border-bottom-color: #1890ff; }

.tool-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; background: #ccc; padding: 1px; flex: 0 0 auto; }
.tool-card { background: #fff; height: 80px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; font-size: 14px; }
.tool-card:hover { background: #e6f7ff; }

/* 轮播图区域 */
.slideshow-container { flex: 1; position: relative; overflow: hidden; background: #1a1a1a; }
.slide-image { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.fade-enter-active, .fade-leave-active { transition: opacity 1s ease-in-out; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.indicators { position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 10; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255, 255, 255, 0.5); cursor: pointer; transition: 0.3s; }
.dot.active { background: #fff; transform: scale(1.2); }
.dot:hover { background: #fff; }
.no-images { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #fff; }
.no-images p { font-size: 18px; margin: 5px 0; }
.no-images .sub-hint { font-size: 13px; color: #aaa; }

.active-tool { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.active-tool-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 15px; background: #fff; border-bottom: 1px solid #ccc; }
.active-tool-name { font-weight: bold; font-size: 15px; color: #333; }
.back-btn { padding: 5px 10px; cursor: pointer; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; }
.back-btn:hover { background: #e0e0e0; }
.tool-content { flex: 1; position: relative; overflow: hidden; }

/* 设置弹窗样式 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; }
.settings-modal { background: #fff; width: 600px; max-height: 85vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: #f8f9fa; border-bottom: 1px solid #eee; }
.modal-header h3 { margin: 0; font-size: 16px; color: #333; }
.close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: #999; }
.close-btn:hover { color: #333; }
.settings-body { padding: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }

.setting-item { display: flex; flex-direction: column; gap: 6px; }
.setting-item label { font-weight: bold; font-size: 13px; color: #444; }
.setting-control { display: flex; align-items: center; gap: 10px; }
.path-display { flex: 1; padding: 6px 10px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action-btn { padding: 6px 12px; background: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.action-btn:hover { background: #40a9ff; }
.action-btn.secondary { background: #f0f0f0; color: #333; border: 1px solid #ccc; }
.action-btn.secondary:hover { background: #e0e0e0; }

/* ✨ 轮播图管理区 */
.slideshow-actions { display: flex; gap: 8px; margin-bottom: 8px; }
.image-thumbnails {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  margin-top: 5px;
  max-height: 200px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid #eee;
  border-radius: 4px;
}
.thumbnail-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.thumbnail-item img {
  width: 100%;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #ddd;
}
.delete-thumb-btn {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 18px;
  height: 18px;
  background: #ff4d4f;
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
}
.delete-thumb-btn:hover { background: #ff7875; }
.thumb-name {
  font-size: 9px;
  color: #888;
  margin-top: 3px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint { font-size: 11px; color: #999; margin: 0; }
.modal-footer { padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #eee; display: flex; justify-content: flex-end; }
.save-btn { padding: 8px 20px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
.save-btn:hover { background: #40a9ff; }
</style>