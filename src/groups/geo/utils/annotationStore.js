// src/groups/geo/utils/annotationStore.js
// 🚨 新增 fileId 隔离支持 + 兜底保护 + 旧数据兼容
import { TOOL_ORDER } from './toolRegistry';
import {
  getAllFromToolDB,
  replaceAllInToolDB,
  openToolDB
} from './toolDB';
import { ensureToolMigrated } from './migrationManager';
import {
  unregisterFingerprints,
  clearFingerprintsByFile,
  registerFingerprints
} from './fingerprintStore';
import { resolveFingerprint, isValidFingerprint } from './fingerprint';

// 保存某工具某文件的所有图形（原子替换）
export const saveAllLayers = async (toolId, fileId, layers) => {
  if (!Array.isArray(layers)) {
    console.error('[saveAllLayers] layers 必须是数组，当前为:', typeof layers);
    return;
  }
  if (!toolId) {
    console.error('[saveAllLayers] toolId 缺失，拒绝执行保存操作！');
    return;
  }
  
  // 🚨 核心修复：如果 fileId 丢失，使用兜底值，防止数据无法保存
  const safeFileId = fileId || 'legacy-file'; 
  if (!fileId) {
    console.warn('[saveAllLayers] fileId 缺失，已自动回退到 legacy-file，请检查前端传参。');
  }

  await ensureToolMigrated(toolId);

  // 1. 获取该工具下所有历史数据
  const allData = await getAllFromToolDB(toolId, 'annotations');
  
  // 2. 剔除当前文件的历史数据，保留其他文件的数据（使用 safeFileId 过滤）
  const otherFilesData = allData.filter(item => item.fileId !== safeFileId);
  
  // 3. 剥离 layerRef + JSON 深度净化，并给当前图层打上 fileId 标签
  const purified = layers.map(layer => {
    const { layerRef, ...rest } = layer;
    return JSON.parse(JSON.stringify({ ...rest, fileId: safeFileId, toolId }));
  });

  // 4. 合并并写回
  await replaceAllInToolDB(toolId, 'annotations', [...otherFilesData, ...purified]);

  // 5. 🚨 同步维护指纹索引：仅当出现「真正的删除」时才处理，避免普通保存产生额外开销
  try {
    const oldCurrent = allData.filter(item => item.fileId === safeFileId);
    if (purified.length === 0 && oldCurrent.length > 0) {
      // 场景 A：清空该文件全部数据 → 清除对应全部指纹
      await clearFingerprintsByFile(toolId, safeFileId);
    } else if (oldCurrent.length > purified.length) {
      // 场景 B：数量减少 → 差集找出被移除的图层，注销其指纹
      const newIds = new Set(purified.map(l => l.id));
      const removed = oldCurrent.filter(l => l.id && !newIds.has(l.id));
      if (removed.length > 0) await unregisterFingerprints(toolId, removed);
    }
  } catch (e) {
    console.warn('[saveAllLayers] 指纹索引同步失败（不影响数据保存）:', e);
  }
};

// 读取某工具某文件的所有图形
export const getAllLayers = async (toolId, fileId = null) => {
  if (!toolId) {
    // 不带 toolId：遍历所有工具返回（用于信息数据库全量拉取）
    const all = [];
    for (const tid of TOOL_ORDER) {
      await ensureToolMigrated(tid);
      const list = await getAllFromToolDB(tid, 'annotations');
      all.push(...list.map(l => ({ ...l, toolId: tid })));
    }
    return all;
  }

  await ensureToolMigrated(toolId);
  const list = await getAllFromToolDB(toolId, 'annotations');
  
  // 🚨 核心修复：严格按 fileId 隔离
  if (fileId) {
    // 如果正在加载 'legacy-file'（旧数据兼容区），则同时加载没有 fileId 的旧数据
    if (fileId === 'legacy-file') {
      return list.filter(l => l.fileId === fileId || !l.fileId);
    }
    // 如果是任何一个新文件，绝对不加载没有 fileId 的旧数据！
    return list.filter(l => l.fileId === fileId);
  }
  
  return list; // 不传 fileId 时返回全部（用于信息数据库）
};

// 清空某工具某文件的所有图形（同时清除该文件的全部指纹）
export const clearAllLayers = async (toolId, fileId) => {
  const safeFileId = fileId || 'legacy-file';
  await saveAllLayers(toolId, safeFileId, []);
  try {
    await clearFingerprintsByFile(toolId, safeFileId);
  } catch (e) {
    console.warn('[clearAllLayers] 指纹清理失败:', e);
  }
};

// 🚨 新增：增量追加图层（单事务，不读旧数据、不清空），用于 AI 批量导入
// 前提：调用方必须已通过 reserveSequence 预留了不冲突的 id
export const appendLayers = async (toolId, fileId, layers) => {
  if (!Array.isArray(layers) || layers.length === 0) return;
  if (!toolId) {
    console.error('[appendLayers] toolId 缺失，拒绝执行');
    return;
  }

  const safeFileId = fileId || 'legacy-file';
  await ensureToolMigrated(toolId);

  const db = await openToolDB(toolId);
  await new Promise((resolve, reject) => {
    const tx = db.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    layers.forEach(layer => {
      if (!layer || !layer.id) return;
      const { layerRef, ...rest } = layer;
      store.put(JSON.parse(JSON.stringify({ ...rest, fileId: safeFileId, toolId })));
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 🚨 自动补登指纹：覆盖「AI导入」「回收站恢复」等所有追加路径
  //    未登记的图层会被补上身份证，避免恢复后再次被判定为新数据重复导入
  try {
    const entries = [];
    layers.forEach(layer => {
      if (!layer || !layer.id) return;
      const fp = resolveFingerprint(layer);
      if (isValidFingerprint(fp)) {
        entries.push({ fp, annotationId: layer.id, fileId: safeFileId, group: layer.group });
      }
    });
    if (entries.length) await registerFingerprints(toolId, entries);
  } catch (e) {
    console.warn('[appendLayers] 指纹补登失败（不影响数据写入）:', e);
  }
};