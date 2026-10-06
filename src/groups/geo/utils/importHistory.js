// src/groups/geo/utils/importHistory.js
// 🚨 导入归档层 —— 记录「已导入过的文件」，实现仓库腾空
//
// 作用：
//   「一键导入全部」执行后，把本次处理的文件名记入 meta 表；
//   下次再点，这些文件自动从待导入清单中剔除，避免重复导入。
//
// 存储：toolDB 的 meta 表，key = 'imported_ai_files'，value = 文件名数组

import { getFromToolDB, putToToolDB } from './toolDB';
import { ensureToolMigrated } from './migrationManager';

const KEY = 'imported_ai_files';

/**
 * 读取已归档（已导入）的文件名列表
 */
export const getImportedFiles = async (toolId) => {
  if (!toolId) return [];
  await ensureToolMigrated(toolId);
  try {
    const rec = await getFromToolDB(toolId, 'meta', KEY);
    return (rec && Array.isArray(rec.value)) ? rec.value : [];
  } catch (e) {
    console.warn('[importHistory] 读取归档失败:', e);
    return [];
  }
};

/**
 * 把文件名标记为已归档
 * @param {string} toolId
 * @param {string[]} files
 */
export const markFilesImported = async (toolId, files) => {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!toolId || list.length === 0) return;
  await ensureToolMigrated(toolId);
  try {
    const current = await getImportedFiles(toolId);
    const merged = Array.from(new Set([...current, ...list]));
    await putToToolDB(toolId, 'meta', {
      key: KEY,
      value: merged,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.warn('[importHistory] 写入归档失败:', e);
  }
};

/**
 * 清空归档记录（需要重新导入历史文件时使用）
 */
export const resetImportedFiles = async (toolId) => {
  if (!toolId) return;
  await ensureToolMigrated(toolId);
  try {
    await putToToolDB(toolId, 'meta', { key: KEY, value: [], updatedAt: Date.now() });
  } catch (e) {
    console.warn('[importHistory] 重置归档失败:', e);
  }
};
