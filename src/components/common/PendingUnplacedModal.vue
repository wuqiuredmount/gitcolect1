<template>
  <div class="pending-overlay" v-if="visible" @click.self="$emit('close')">
    <div class="pending-modal">
      <!-- 头部 -->
      <div class="pd-header">
        <div class="pd-title">📥 待处理未放置信息库</div>
        <div class="pd-header-actions">
          <span class="pd-count">共 {{ items.length }} 条</span>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
      </div>

      <!-- 说明 -->
      <div class="pd-hint">
        以下信息因暂未取得可信的精确坐标而无法放置到地图上。补全坐标后即可转入对应分组导入。
      </div>

      <!-- 表格 -->
      <div class="pd-body">
        <table class="pending-table">
          <thead>
            <tr>
              <th style="width: 60px;">编号</th>
              <th style="width: 200px;">名称</th>
              <th style="width: 260px;">属地</th>
              <th style="width: 140px;">预分组</th>
              <th>未放置原因</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.name }}</td>
              <td>{{ item.region || '—' }}</td>
              <td>{{ item.group || '—' }}</td>
              <td class="reason-cell">{{ item.reason || '—' }}</td>
            </tr>
            <tr v-if="items.length === 0">
              <td colspan="5" class="empty-row">暂无待处理信息</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

defineEmits(['close']);

const items = ref([]);

const loadItems = async () => {
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}pending-unplaced/pending.json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    items.value = Array.isArray(data.items) ? data.items : [];
  } catch (e) {
    console.warn('[待处理库] 读取失败:', e);
    items.value = [];
  }
};

watch(() => props.visible, (val) => {
  if (val) loadItems();
});
</script>

<style scoped>
.pending-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; }
.pending-modal { width: 90vw; height: 80vh; max-width: 1100px; background: #fff; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
.pd-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #7c3aed; color: white; }
.pd-title { font-size: 16px; font-weight: bold; }
.pd-header-actions { display: flex; align-items: center; gap: 12px; }
.pd-count { font-size: 12px; opacity: 0.9; }
.close-btn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }
.pd-hint { padding: 10px 20px; background: #f5f3ff; color: #6d28d9; font-size: 12px; border-bottom: 1px solid #ede9fe; }
.pd-body { flex: 1; min-height: 0; overflow-y: auto; }
.pending-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pending-table th { background: #f8f9fa; padding: 10px; text-align: left; border-bottom: 2px solid #eee; position: sticky; top: 0; }
.pending-table td { padding: 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
.reason-cell { color: #6b7280; line-height: 1.5; }
.empty-row { text-align: center; color: #999; padding: 40px 0; }
</style>
