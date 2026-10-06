<template>
  <div class="layer-list-dropdown">
    <!-- 顶层操作栏 -->
    <div class="top-actions">
      <button class="dropdown-toggle-btn" @click="isExpanded = !isExpanded">
        图形列表（{{ layers.length }}）{{ isExpanded ? '▲' : '▼' }}
      </button>
      <button class="group-btn" @click="openEditGroupModal" title="编辑分组">
        <span class="btn-icon">⚙️</span>
        <span class="btn-text">探索和编辑分组</span>
      </button>
      <select v-model="activeGroupFilter" class="group-filter-select" title="查看分组">
        <option value="全部">全部（{{ layers.length }}）</option>
        <option v-if="enableHotspot" value="热点信息">🔥 热点信息（{{ hotspotIds.length }}）</option>
        <option v-for="g in allGroups" :key="g" :value="g">{{ g }}（{{ countByGroup(g) }}）</option>
      </select>
      <button v-if="enableHotspot" class="group-btn" @click="$emit('refresh-hotspot')" title="重新随机选取热点信息">🔥 刷新热点</button>
    </div>

    <!-- 展开的列表面板 -->
    <div v-show="isExpanded" class="dropdown-panel">
      <div class="panel-header-actions">
        <input type="text" v-model="searchQuery" placeholder="输入名称检索..." class="search-input" />
        <button class="fav-open-btn" @click="isFavModalOpen = true" title="打开收藏夹"> ★ 收藏夹 </button>
      </div>

      <div class="window-hint">当前显示 {{ displayedLayers.length }} 个 · 每 30 秒自动轮换</div>

      <ul v-if="displayedLayers.length > 0" class="layer-list">
        <li v-for="item in displayedLayers" :key="item.id" @dblclick="locateItem(item)" title="双击定位">
          <div class="item-main">
            <span class="layer-title">{{ item.title || '未命名图形' }}</span>
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
          <button v-for="g in allGroups" :key="g" @click="assignGroupToLayer(g)" :class="{ active: (selectedLayerForGroup?.group || '默认') === g }">{{ g }}（{{ countByGroup(g) }}）</button>
        </div>
        <div class="assign-actions">
          <button @click="isAssignGroupOpen = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 🚨 编辑分组弹窗（放大 + 可展开查看元素 + 删除 + AI权限） -->
    <div v-if="isEditGroupOpen" class="fav-modal-overlay" @click.self="isEditGroupOpen = false">
      <div class="fav-modal-content group-editor">
        <div class="fav-modal-header">
          <h3>⚙️ 编辑分组（共 {{ allGroups.length }} 组 / {{ layers.length }} 个元素）</h3>
          <button class="close-btn" @click="isEditGroupOpen = false">x</button>
        </div>

        <div class="group-editor-body">
          <!-- 左：分组列表 -->
          <div class="group-col">
            <div class="group-edit-row">
              <input type="text" v-model="newGroupName" placeholder="输入新分组名称" @keyup.enter="addGroup" />
              <button @click="addGroup">添加</button>
            </div>

            <ul class="group-edit-list">
              <li
                v-for="g in allGroups"
                :key="g"
                :class="{ active: expandedGroup === g }"
                @click="toggleExpand(g)"
              >
                <span class="g-name">
                  <span class="arrow">{{ expandedGroup === g ? '▼' : '▶' }}</span>
                  {{ g }}
                </span>
                <span class="g-count">{{ countByGroup(g) }}</span>
                <span class="g-actions">
                  <button
                    class="ai-perm-btn"
                    :class="{ on: isAiAllowed(g) }"
                    :title="isAiAllowed(g) ? 'AI 已获删除权限，点击撤销' : '授予 AI 删除权限'"
                    @click.stop="toggleAiPermission(g)"
                  >🤖{{ isAiAllowed(g) ? '✓' : '' }}</button>
                  <button v-if="!isPresetGroup(g)" @click.stop="removeGroup(g)" class="del-btn" title="删除分组">删除</button>
                </span>
              </li>
            </ul>
          </div>

          <!-- 右：元素列表 -->
          <div class="member-col">
            <div v-if="!expandedGroup" class="member-empty">点击左侧分组查看其内部元素</div>
            <template v-else>
              <div class="member-head">
                <span>「{{ expandedGroup }}」共 {{ groupMembers.length }} 个元素</span>
                <span v-if="isAiAllowed(expandedGroup)" class="ai-tag">🤖 AI 可删除</span>
              </div>
              <ul v-if="groupMembers.length > 0" class="member-list">
                <li v-for="m in groupMembers" :key="m.id">
                  <span class="m-name" @click="locateItem(m)" title="点击定位">{{ m.title || '未命名图形' }}</span>
                  <span class="m-id">{{ m.id }}</span>
                  <button class="m-del" @click="deleteMember(m)" title="移入回收站">🗑️</button>
                </li>
              </ul>
              <div v-else class="member-empty">该分组暂无元素</div>
            </template>
          </div>
        </div>

        <div class="group-editor-foot">
          <span class="foot-hint">🤖 按钮 = 授予该分组「AI 删除权限」，授权后 AI 指令可删除该组元素</span>
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
  groups: { type: Array, default: () => ['默认'] },
  // 🚨 热点信息：与收藏夹同为「叠加型」虚拟分组，按 id 集合显示
  hotspotIds: { type: Array, default: () => [] },
  enableHotspot: { type: Boolean, default: false },
  // 🚨 地图当前实际显示的图形 id 集合（显示窗口，上限 60）
  displayIds: { type: Array, default: () => [] }
});
const emit = defineEmits(['locate', 'add-group', 'remove-group', 'update-layer-group', 'delete-layer', 'filter-group', 'refresh-hotspot']);

const PRESET_GROUPS = ['默认', '5A级景区', '中国4A级景区'];
const isPresetGroup = (name) => PRESET_GROUPS.includes(name);

// 🚨 热点信息分组名（叠加型虚拟分组，与收藏夹同类）
const HOTSPOT_GROUP = '热点信息';

const searchQuery = ref('');
const isExpanded = ref(false);
const isFavModalOpen = ref(false);
const maxDisplayCount = 10000;

// 收藏夹
const STORAGE_KEY = 'geo_favorite_layer_ids';
const favoriteIds = ref(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
watch(favoriteIds, (newVal) => localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal)), { deep: true });
const isFavorite = (id) => favoriteIds.value.includes(id);
const toggleFavorite = (id) => {
  const index = favoriteIds.value.indexOf(id);
  if (index !== -1) favoriteIds.value.splice(index, 1);
  else favoriteIds.value.push(id);
};

const activeGroupFilter = ref('全部');
// 🚨 分组筛选变更时通知地图，只显示该分组的图形
watch(activeGroupFilter, (val) => { emit('filter-group', val); });

// 🚨 鹰眼平台打开后热点生成完成时，下拉自动切到「热点信息」，保持 UI 与实际显示一致
watch(() => props.hotspotIds, (ids) => {
  if (props.enableHotspot && Array.isArray(ids) && ids.length > 0 && activeGroupFilter.value === '全部') {
    activeGroupFilter.value = HOTSPOT_GROUP;
  }
}, { immediate: true });
const isAssignGroupOpen = ref(false);
const selectedLayerForGroup = ref(null);
const isEditGroupOpen = ref(false);
const newGroupName = ref('');
const expandedGroup = ref('');

// 🚨 AI 删除权限白名单（localStorage 持久化）
const AI_PERM_KEY = 'geo_group_ai_delete_perms';
const aiPermGroups = ref(JSON.parse(localStorage.getItem(AI_PERM_KEY) || '[]'));
watch(aiPermGroups, (v) => localStorage.setItem(AI_PERM_KEY, JSON.stringify(v)), { deep: true });
const isAiAllowed = (g) => aiPermGroups.value.includes(g);
const toggleAiPermission = (g) => {
  const i = aiPermGroups.value.indexOf(g);
  if (i !== -1) aiPermGroups.value.splice(i, 1);
  else aiPermGroups.value.push(g);
};

const allGroups = computed(() => {
  const parentGroups = Array.isArray(props.groups) ? props.groups : [];
  const set = new Set([...PRESET_GROUPS, ...parentGroups.filter(Boolean)]);
  return Array.from(set);
});

// 🚨 统计某分组的元素数量
const countByGroup = (g) => props.layers.filter(l => (l.group || '默认') === g).length;

// 🚨 当前展开分组的元素
const groupMembers = computed(() => {
  if (!expandedGroup.value) return [];
  return props.layers.filter(l => (l.group || '默认') === expandedGroup.value);
});

const toggleExpand = (g) => {
  expandedGroup.value = (expandedGroup.value === g) ? '' : g;
};

const openEditGroupModal = () => { isEditGroupOpen.value = true; };

const addGroup = () => {
  const name = newGroupName.value.trim();
  if (name) {
    emit('add-group', name);
    newGroupName.value = '';
  }
};

const removeGroup = (name) => {
  emit('remove-group', name);
  if (expandedGroup.value === name) expandedGroup.value = '';
};

const openAssignGroup = (item) => {
  selectedLayerForGroup.value = item;
  isAssignGroupOpen.value = true;
};

const assignGroupToLayer = (groupName) => {
  if (selectedLayerForGroup.value) {
    emit('update-layer-group', { id: selectedLayerForGroup.value.id, group: groupName });
    isAssignGroupOpen.value = false;
    selectedLayerForGroup.value = null;
  }
};

// 🚨 删除分组内单个元素（移入回收站）
const deleteMember = (m) => {
  const name = m.title || m.id;
  if (!window.confirm(`确定要删除「${name}」吗？\n该元素将移入回收站，可恢复。`)) return;
  emit('delete-layer', m);
};

const filteredLayers = computed(() => {
  let list = props.layers;
  // 🚨 与地图保持严格一致：只显示显示窗口内的图形（上限 60，30 秒轮换）
  if (Array.isArray(props.displayIds) && props.displayIds.length > 0) {
    const idSet = new Set(props.displayIds);
    list = list.filter(item => idSet.has(item.id));
  } else if (activeGroupFilter.value === HOTSPOT_GROUP) {
    const idSet = new Set(props.hotspotIds || []);
    list = list.filter(item => idSet.has(item.id));
  } else if (activeGroupFilter.value !== '全部') {
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

.group-btn { display: flex; align-items: center; gap: 6px; padding: 0 12px; font-size: 13px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; height: 28px; box-sizing: border-box; white-space: nowrap; transition: 0.2s; color: #333; }
.group-btn:hover { background: #e6f7ff; border-color: #1890ff; }
.group-btn .btn-icon { font-size: 14px; }
.group-btn .btn-text { font-weight: 500; }

.group-filter-select { padding: 0 4px; font-size: 12px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; height: 28px; box-sizing: border-box; outline: none; color: #333; max-width: 150px; }

.dropdown-panel { position: absolute; top: 100%; left: 0; margin-top: 5px; width: 400px; max-height: min(80vh, 820px); background: #fff; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e5e7eb; display: flex; flex-direction: column; z-index: 1000; overflow: hidden; }
.panel-header-actions { display: flex; align-items: center; gap: 5px; padding: 8px 10px; border-bottom: 1px solid #eee; background: #f8f9fa; }
.search-input { flex: 1; padding: 4px 6px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; outline: none; box-sizing: border-box; }
.search-input:focus { border-color: #1890ff; }
.fav-open-btn { padding: 4px 8px; font-size: 11px; background: #fff; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; white-space: nowrap; }
.fav-open-btn:hover { background: #e6f7ff; border-color: #1890ff; color: #1890ff; }
.layer-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; max-height: none; min-height: 0; }
.layer-list li { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 11px; transition: background 0.2s; }
.layer-list li:hover { background: #e6f7ff; }
.item-main { display: flex; flex: 1; align-items: center; overflow: hidden; }
.layer-title { flex: 1; font-weight: bold; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.group-tag-btn { padding: 1px 6px; font-size: 9px; background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; border-radius: 10px; cursor: pointer; margin: 0 4px; white-space: nowrap; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.group-tag-btn:hover { background: #bae0ff; }
.layer-type { width: 35px; color: #888; text-align: right; font-size: 9px; margin-right: 2px; }
.star-btn { background: none; border: none; cursor: pointer; font-size: 14px; color: #ccc; padding: 0 0 0 4px; line-height: 1; }
.star-btn.active { color: #fadb14; }
.star-btn:hover { color: #ffc107; }
.empty-list { padding: 20px; text-align: center; color: #999; font-size: 12px; }
.window-hint {
  font-size: 10px;
  color: #1890ff;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  padding: 4px 8px;
  margin: 6px 0;
  text-align: center;
}
.performance-hint { padding: 5px; text-align: center; color: #faad14; font-size: 10px; background: #fffbe6; }

/* 分配分组 */
.assign-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; z-index: 3000; }
.assign-modal { background: #fff; padding: 15px; border-radius: 6px; width: 250px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.assign-modal h4 { margin: 0 0 10px 0; font-size: 13px; color: #333; }
.assign-group-list { display: flex; flex-direction: column; gap: 5px; max-height: 200px; overflow-y: auto; margin-bottom: 10px; }
.assign-group-list button { padding: 6px; font-size: 12px; text-align: left; background: #f9fafb; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
.assign-group-list button.active { background: #e6f7ff; border-color: #1890ff; color: #1890ff; font-weight: bold; }
.assign-actions { text-align: right; }
.assign-actions button { padding: 4px 10px; font-size: 12px; background: #eee; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }

/* 🚨 分组编辑器（放大） */
.fav-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 2000; }
.fav-modal-content { width: 300px; max-height: 500px; background: #fff; border-radius: 6px; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.2); overflow: hidden; }
.fav-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: #2c3e50; color: white; }
.fav-modal-header h3 { margin: 0; font-size: 14px; }
.fav-modal-header .close-btn { background: none; border: none; color: white; font-size: 16px; cursor: pointer; }
.fav-modal-body { flex: 1; overflow-y: auto; padding: 10px; }

.group-editor { width: 860px; max-width: 92vw; height: 620px; max-height: 88vh; }
.group-editor-body { flex: 1; display: flex; min-height: 0; }
.group-col { width: 320px; border-right: 1px solid #eee; display: flex; flex-direction: column; padding: 10px; min-height: 0; }
.member-col { flex: 1; display: flex; flex-direction: column; padding: 10px; min-height: 0; }

.group-edit-row { display: flex; gap: 5px; margin-bottom: 10px; }
.group-edit-row input { flex: 1; padding: 4px 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 3px; }
.group-edit-row button { padding: 4px 12px; font-size: 12px; background: #1890ff; color: #fff; border: none; border-radius: 3px; cursor: pointer; }

.group-edit-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; min-height: 0; }
.group-edit-list li { display: flex; align-items: center; justify-content: space-between; padding: 8px 6px; border-bottom: 1px solid #f0f0f0; font-size: 12px; cursor: pointer; border-radius: 3px; }
.group-edit-list li:hover { background: #f5f7fa; }
.group-edit-list li.active { background: #e6f7ff; }
.g-name { flex: 1; display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-name .arrow { font-size: 9px; color: #999; }
.g-count { background: #f0f0f0; color: #666; border-radius: 9px; padding: 1px 8px; font-size: 11px; margin: 0 6px; }
.g-actions { display: flex; align-items: center; gap: 4px; }
.ai-perm-btn { border: 1px solid #d8b4fe; background: #fff; color: #7c3aed; border-radius: 3px; cursor: pointer; font-size: 11px; padding: 1px 5px; }
.ai-perm-btn.on { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.del-btn { background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 11px; }

.member-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: bold; color: #333; padding-bottom: 8px; border-bottom: 1px solid #eee; margin-bottom: 6px; }
.ai-tag { font-size: 10px; color: #7c3aed; font-weight: normal; }
.member-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; min-height: 0; }
.member-list li { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid #f5f5f5; font-size: 12px; }
.member-list li:hover { background: #f9fafb; }
.m-name { flex: 1; cursor: pointer; color: #1890ff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-name:hover { text-decoration: underline; }
.m-id { color: #aaa; font-size: 10px; font-family: monospace; }
.m-del { background: none; border: none; cursor: pointer; font-size: 13px; }
.member-empty { color: #999; font-size: 12px; text-align: center; padding: 40px 0; }
.group-editor-foot { padding: 8px 15px; background: #faf5ff; border-top: 1px solid #e9d5ff; }
.foot-hint { font-size: 11px; color: #7c3aed; }

/* 收藏夹 */
.fav-list { list-style: none; padding: 0; margin: 0; }
.fav-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
.fav-title { flex: 1; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-here-btn { padding: 4px 10px; font-size: 11px; background: #1890ff; color: #fff; border: none; border-radius: 3px; cursor: pointer; }
.go-here-btn:hover { background: #40a9ff; }
.fav-empty { text-align: center; padding: 30px 10px; color: #999; font-size: 12px; }
.fav-empty .hint { font-size: 10px; color: #bbb; margin-top: 5px; }
</style>
