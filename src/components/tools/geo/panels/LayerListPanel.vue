<template>
  <div class="layer-list-dropdown">
    <!-- 顶层操作栏 -->
    <div class="top-actions">
      <button class="dropdown-toggle-btn" @click="isExpanded = !isExpanded">
        图形列表（{{ layers.length }}）{{ isExpanded ? '▲' : '▼' }}
      </button>
      <!-- 🚨 核心修改：给齿轮按钮加上固定显示的文本 -->
      <button class="group-btn" @click="openEditGroupModal" title="编辑分组">
        <span class="btn-icon">⚙️</span>
        <span class="btn-text">探索和编辑分组</span>
      </button>
      <select v-model="activeGroupFilter" class="group-filter-select" title="查看分组">
        <option value="全部">全部</option>
        <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
      </select>
    </div>

    <!-- 展开的列表面板 -->
    <div v-show="isExpanded" class="dropdown-panel">
      <div class="panel-header-actions">
        <input type="text" v-model="searchQuery" placeholder="输入名称检索..." class="search-input" />
        <button class="fav-open-btn" @click="isFavModalOpen = true" title="打开收藏夹"> ★ 收藏夹 </button>
      </div>

      <!-- 图形列表区 -->
      <ul v-if="displayedLayers.length > 0" class="layer-list">
        <li v-for="item in displayedLayers" :key="item.id" @dblclick="locateItem(item)" title="双击定位">
          <div class="item-main">
            <span class="layer-title">{{ item.title || '未命名图形' }}</span>
            <!-- 分组选择按钮 -->
            <button class="group-tag-btn" @click.stop="openAssignGroup(item)">
              {{ item.group || '默认' }}
            </button>
            <span class="layer-type">{{ item.type }}</span>
          </div>
          <button
            class="star-btn"
            :class="{ 'active': isFavorite(item.id) }"
            @click.stop="toggleFavorite(item.id)"
            :title="isFavorite(item.id) ? '取消收藏' : '加入收藏'"
          >
            {{ isFavorite(item.id) ? '★' : '☆' }}
          </button>
        </li>
      </ul>
      <div v-else-if="layers.length === 0" class="empty-list">暂无图形</div>
      <div v-else class="empty-list">未找到匹配元素</div>

      <div v-if="filteredLayers.length > maxDisplayCount" class="performance-hint">
        已显示前 {{ maxDisplayCount }} 条结果，请利用搜索缩小范围。
      </div>
    </div>

    <!-- 分配分组小弹窗 -->
    <div v-if="isAssignGroupOpen" class="assign-modal-overlay" @click.self="isAssignGroupOpen = false">
      <div class="assign-modal">
        <h4>为“{{ selectedLayerForGroup?.title || '未命名图形' }}”选择分组</h4>
        <div class="assign-group-list">
          <button v-for="g in groups" :key="g" @click="assignGroupToLayer(g)" :class="{ active: (selectedLayerForGroup?.group || '默认') === g }">{{ g }}</button>
        </div>
        <div class="assign-actions">
          <button @click="isAssignGroupOpen = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 编辑分组弹窗 -->
    <div v-if="isEditGroupOpen" class="fav-modal-overlay" @click.self="isEditGroupOpen = false">
      <div class="fav-modal-content" style="width: 350px;">
        <div class="fav-modal-header">
          <h3> 编辑分组</h3>
          <button class="close-btn" @click="isEditGroupOpen = false">x</button>
        </div>
        <div class="fav-modal-body">
          <div class="group-edit-row">
            <input type="text" v-model="newGroupName" placeholder="输入新分组名称" @keyup.enter="addGroup" />
            <button @click="addGroup">添加</button>
          </div>
          <ul class="group-edit-list">
            <li v-for="(g, idx) in groups" :key="g">
              <span>{{ g }}</span>
              <button v-if="g != '默认'" @click="removeGroup(g)" class="del-btn">删除</button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 独立收藏夹弹窗 -->
    <div v-if="isFavModalOpen" class="fav-modal-overlay" @click.self="isFavModalOpen = false">
      <div class="fav-modal-content">
        <div class="fav-modal-header">
          <h3> 我的收藏夹</h3>
          <button class="close-btn" @click="isFavModalOpen = false">x</button>
        </div>
        <div class="fav-modal-body">
          <ul v-if="favoriteLayers.length > 0" class="fav-list">
            <li v-for="item in favoriteLayers" :key="item.id">
              <span class="fav-title">{{ item.title || '未命名图形' }} </span>
              <button class="go-here-btn" @click="goToFavorite(item)">去这里</button>
            </li>
          </ul>
          <div v-else class="fav-empty">
            <p>还没有收藏任何图形</p>
            <p class="hint">点击列表旁的☆按钮即可收藏</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  layers: { type: Array, default: () => [] },
  groups: { type: Array, default: () => ['默认'] } // 核心：接收父组件传来的分组数据
});
const emit = defineEmits(['locate', 'add-group', 'remove-group', 'update-layer-group']);

const searchQuery = ref('');
const isExpanded = ref(false);
const isFavModalOpen = ref(false);
const maxDisplayCount = 200;

// 收藏夹状态
const STORAGE_KEY = 'geo_favorite_layer_ids';
const favoriteIds = ref(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
watch(favoriteIds, (newVal) => localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal)), { deep: true });
const isFavorite = (id) => favoriteIds.value.includes(id);
const toggleFavorite = (id) => {
  const index = favoriteIds.value.indexOf(id);
  if (index !== -1) favoriteIds.value.splice(index, 1);
  else favoriteIds.value.push(id);
};

// 核心：直接使用父组件的分组列表进行过滤
const activeGroupFilter = ref('全部');
const isAssignGroupOpen = ref(false);
const selectedLayerForGroup = ref(null);
const isEditGroupOpen = ref(false);
const newGroupName = ref('');

const openEditGroupModal = () => { isEditGroupOpen.value = true; };

// 核心：通过 emit 触发父组件新建分组
const addGroup = () => {
  const name = newGroupName.value.trim();
  if (name) {
    emit('add-group', name);
    newGroupName.value = '';
  }
};

// 核心：通过 emit 触发父组件删除分组
const removeGroup = (name) => {
  emit('remove-group', name);
};

const openAssignGroup = (item) => {
  selectedLayerForGroup.value = item;
  isAssignGroupOpen.value = true;
};

// 核心：通过 emit 触发父组件更新图形分组
const assignGroupToLayer = (groupName) => {
  if (selectedLayerForGroup.value) {
    emit('update-layer-group', { id: selectedLayerForGroup.value.id, group: groupName });
    isAssignGroupOpen.value = false;
    selectedLayerForGroup.value = null;
  }
};

// 过滤逻辑
const filteredLayers = computed(() => {
  let list = props.layers;
  if (activeGroupFilter.value !== '全部') {
    list = list.filter(item => (item.group || '默认') === activeGroupFilter.value);
  }
  if (!searchQuery.value.trim()) return list;
  const query = searchQuery.value.trim().toLowerCase();
  return list.filter(item => item.title && item.title.toLowerCase().includes(query));
});

const displayedLayers = computed(() => filteredLayers.value.slice(0, maxDisplayCount));
const favoriteLayers = computed(() => props.layers.filter(layer => favoriteIds.value.includes(layer.id)));

const locateItem = (item) => {
  isExpanded.value = false;
  emit('locate', item);
};

const goToFavorite = (item) => {
  isFavModalOpen.value = false;
  emit('locate', item);
};
</script>

<style scoped>
.layer-list-dropdown { position: relative; display: inline-block; }

.top-actions { display: flex; align-items: center; gap: 5px; }

.dropdown-toggle-btn { padding: 4px 12px; font-size: 12px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; white-space: nowrap; transition: 0.2s; color: #333; height: 28px; box-sizing: border-box; }
.dropdown-toggle-btn:hover { background: #e6f7ff; border-color: #1890ff; color: #1890ff; }

/* 🚨 修改：包含图标和文字的分组按钮样式 */
.group-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 13px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  height: 28px;
  box-sizing: border-box;
  white-space: nowrap;
  transition: 0.2s;
  color: #333;
}
.group-btn:hover { background: #e6f7ff; border-color: #1890ff; }
.group-btn .btn-icon { font-size: 14px; }
.group-btn .btn-text { font-weight: 500; }

.group-filter-select { padding: 0 4px; font-size: 12px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; height: 28px; box-sizing: border-box; outline: none; color: #333; max-width: 80px; }

.dropdown-panel { position: absolute; top: 100%; left: 0; margin-top: 5px; width: 340px; max-height: 450px; background: #fff; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e5e7eb; display: flex; flex-direction: column; z-index: 1000; overflow: hidden; }
.panel-header-actions { display: flex; align-items: center; gap: 5px; padding: 8px 10px; border-bottom: 1px solid #eee; background: #f8f9fa; }
.search-input { flex: 1; padding: 4px 6px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; outline: none; box-sizing: border-box; }
.search-input:focus { border-color: #1890ff; }
.fav-open-btn { padding: 4px 8px; font-size: 11px; background: #fff; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; white-space: nowrap; }
.fav-open-btn:hover { background: #e6f7ff; border-color: #1890ff; color: #1890ff; }
.layer-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; max-height: 300px; }
.layer-list li { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 11px; transition: background 0.2s; }
.layer-list li:hover { background: #e6f7ff; }
.item-main { display: flex; flex: 1; align-items: center; overflow: hidden; }
.layer-title { flex: 1; font-weight: bold; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
.group-tag-btn { padding: 1px 6px; font-size: 9px; background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; border-radius: 10px; cursor: pointer; margin: 0 4px; white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
.group-tag-btn:hover { background: #bae0ff; }
.layer-type { width: 35px; color: #888; text-align: right; font-size: 9px; margin-right: 2px; }
.star-btn { background: none; border: none; cursor: pointer; font-size: 14px; color: #ccc; padding: 0 0 0 4px; line-height: 1; }
.star-btn.active { color: #fadb14; }
.star-btn:hover { color: #ffc107; }
.empty-list { padding: 20px; text-align: center; color: #999; font-size: 12px; }
.performance-hint { padding: 5px; text-align: center; color: #faad14; font-size: 10px; background: #fffbe6; }
.assign-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; z-index: 3000; }
.assign-modal { background: #fff; padding: 15px; border-radius: 6px; width: 250px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.assign-modal h4 { margin: 0 0 10px 0; font-size: 13px; color: #333; }
.assign-group-list { display: flex; flex-direction: column; gap: 5px; max-height: 200px; overflow-y: auto; margin-bottom: 10px; }
.assign-group-list button { padding: 6px; font-size: 12px; text-align: left; background: #f9fafb; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
.assign-group-list button.active { background: #e6f7ff; border-color: #1890ff; color: #1890ff; font-weight: bold; }
.assign-actions { text-align: right; }
.assign-actions button { padding: 4px 10px; font-size: 12px; background: #eee; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }
.group-edit-row { display: flex; gap: 5px; margin-bottom: 10px; }
.group-edit-row input { flex: 1; padding: 4px 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 3px; }
.group-edit-row button { padding: 4px 12px; font-size: 12px; background: #1890ff; color: #fff; border: none; border-radius: 3px; cursor: pointer; }
.group-edit-list { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
.group-edit-list li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
.del-btn { background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 11px; }
.fav-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 2000; }
.fav-modal-content { width: 300px; max-height: 500px; background: #fff; border-radius: 6px; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.2); overflow: hidden; }
.fav-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: #2c3e50; color: white; }
.fav-modal-header h3 { margin: 0; font-size: 14px; }
.fav-modal-header .close-btn { background: none; border: none; color: white; font-size: 16px; cursor: pointer; }
.fav-modal-body { flex: 1; overflow-y: auto; padding: 10px; }
.fav-list { list-style: none; padding: 0; margin: 0; }
.fav-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
.fav-title { flex: 1; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-here-btn { padding: 4px 10px; font-size: 11px; background: #1890ff; color: #fff; border: none; border-radius: 3px; cursor: pointer; }
.go-here-btn:hover { background: #40a9ff; }
.fav-empty { text-align: center; padding: 30px 10px; color: #999; font-size: 12px; }
.fav-empty .hint { font-size: 10px; color: #bbb; margin-top: 5px; }
</style>