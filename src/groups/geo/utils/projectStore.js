// src/groups/geo/utils/projectStore.js
// 🚨 支持 fileId 隔离
import { TOOL_ORDER, formatProjectId } from './toolRegistry';
import {
  getFromToolDB,
  getAllFromToolDB,
  putToToolDB,
  deleteFromToolDB
} from './toolDB';
import { ensureToolMigrated } from './migrationManager';

export const saveProjectToInventory = async (projectData) => {
  const toolId = projectData.toolId;
  const fileId = projectData.fileId; // 🚨 必须包含 fileId
  
  if (!toolId || !fileId) {
    throw new Error('[saveProjectToInventory] 缺少 toolId 或 fileId，无法保存工程');
  }

  await ensureToolMigrated(toolId);

  // 🚨 传入 fileId 生成唯一的工程 ID
  const projId = projectData.projId || formatProjectId(toolId, fileId);
  const record = {
    projId,
    fileId, // 🚨 存入数据库，供库存界面识别
    toolId,
    name: projectData.name || `工程_${Date.now()}`,
    createdAt: projectData.createdAt || new Date().toISOString(),
    baseLayer: projectData.baseLayer || {},
    mapState: projectData.mapState || {},
    layers: projectData.layers || [],
    groups: projectData.groups || []
  };

  await putToToolDB(toolId, 'projects', record);

  // 返回兼容旧字段名（旧代码读 proj.id）
  return { ...record, id: projId, toolId };
};

export const getAllProjects = async (toolId) => {
  if (toolId) {
    await ensureToolMigrated(toolId);
    const list = await getAllFromToolDB(toolId, 'projects');
    return list.map(p => ({ ...p, id: p.projId, toolId }));
  }

  // 不带 toolId：遍历所有工具返回
  const all = [];
  for (const tid of TOOL_ORDER) {
    await ensureToolMigrated(tid);
    const list = await getAllFromToolDB(tid, 'projects');
    all.push(...list.map(p => ({ ...p, id: p.projId, toolId: tid })));
  }
  return all;
};

export const deleteProjectFromInventory = async (projectId) => {
  // 不知道属于哪个工具的库，扫描
  for (const tid of TOOL_ORDER) {
    await ensureToolMigrated(tid);
    const rec = await getFromToolDB(tid, 'projects', projectId);
    if (rec) {
      await deleteFromToolDB(tid, 'projects', projectId);
      return;
    }
  }
  console.warn(`[deleteProjectFromInventory] 未找到工程: ${projectId}`);
};