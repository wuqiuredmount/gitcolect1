// src/groups/geo/utils/dedup.js
// 🚨 重复数据清理器
//
// 用途：把同一份数据（相同指纹）的多余副本移入回收站，只保留最早的一条。
// 安全性：
//   1. 走回收站（软删除），可在回收站恢复
//   2. 保留「最先出现」的那条，删除后出现的副本
//   3. 兼容没有 fingerprint 字段的旧数据（即时计算指纹）
//
// 返回：{ removed, groups, kept }

import { getAllFromToolDB, replaceAllInToolDB } from './toolDB';
import { ensureToolMigrated } from './migrationManager';
import { moveToRecycleBin } from './recycleStore';
import { getDocument } from './documentStore';
import { resolveFingerprint, isValidFingerprint } from './fingerprint';

/**
 * 扫描并清理重复数据
 * @param {string} toolId 工具 id
 * @param {object} [opts]
 * @param {function} [opts.onProgress] (done, total, name) => void
 * @returns {Promise<{removed:number, groups:number, kept:number}>}
 */
export const cleanupDuplicates = async (toolId, opts = {}) => {
  if (!toolId) return { removed: 0, groups: 0, kept: 0 };
  await ensureToolMigrated(toolId);

  const { onProgress } = opts;

  // 1. 读取全部图形
  let all = [];
  try {
    all = await getAllFromToolDB(toolId, 'annotations') || [];
  } catch (e) {
    console.warn('[dedup] 读取图形失败:', e);
    return { removed: 0, groups: 0, kept: 0 };
  }

  // 2. 按指纹分组，找出重复项（保留首个，其余为副本）
  const seen = new Map(); // fp -> 保留的图层
  const duplicates = [];

  all.forEach(layer => {
    if (!layer || !layer.id) return;
    const fp = resolveFingerprint(layer);
    if (!isValidFingerprint(fp)) return; // 无有效身份证，不参与去重

    if (seen.has(fp)) {
      duplicates.push(layer);
    } else {
      seen.set(fp, layer);
    }
  });

  if (duplicates.length === 0) {
    return { removed: 0, groups: 0, kept: seen.size };
  }

  // 3. 把重复项移入回收站（连同富文本）
  let done = 0;
  for (const layer of duplicates) {
    const fileId = layer.fileId || 'legacy-file';
    let docHtml = '';
    try {
      docHtml = await getDocument(toolId, fileId, layer.id) || '';
    } catch (e) {
      // 文档读取失败不影响主流程
    }
    try {
      await moveToRecycleBin(toolId, fileId, layer, docHtml);
    } catch (e) {
      console.warn('[dedup] 移入回收站失败:', layer.id, e);
    }
    done++;
    if (typeof onProgress === 'function') {
      onProgress(done, duplicates.length, layer.objectName || layer.title || layer.id);
    }
  }

  // 4. 从 annotations 中移除重复项
  const dupIds = new Set(duplicates.map(l => l.id));
  const remain = all.filter(l => !dupIds.has(l.id));
  try {
    await replaceAllInToolDB(toolId, 'annotations', remain);
  } catch (e) {
    console.warn('[dedup] 回写图形表失败:', e);
  }

  return { removed: duplicates.length, groups: seen.size, kept: remain.length };
};
