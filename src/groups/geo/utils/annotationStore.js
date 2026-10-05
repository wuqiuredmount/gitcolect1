// src/groups/geo/utils/annotationStore.js
// 🚨 新增 fileId 隔离支持 + 兜底保护 + 旧数据兼容
import { TOOL_ORDER } from './toolRegistry';
import {
  getAllFromToolDB,
  replaceAllInToolDB
} from './toolDB';
import { ensureToolMigrated } from './migrationManager';

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

// 清空某工具某文件的所有图形
export const clearAllLayers = async (toolId, fileId) => {
  return saveAllLayers(toolId, fileId, []);
};