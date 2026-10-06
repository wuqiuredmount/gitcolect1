// src/groups/geo/utils/systemStore.js
// 🚨 Phase 2b：每工具独立发号器（存在各工具库的 meta 表）
import { getFromToolDB, putToToolDB } from './toolDB';
import { ensureToolMigrated } from './migrationManager';

/**
 * 获取某工具的下一个序号
 * @param {string} toolId - 工具 id
 * @param {string} type - 'graphic' | 'group' | 'file'
 * @returns {Promise<number>} 下一个序号（从 1 开始）
 */
export const getNextSequence = async (toolId, type) => {
  if (!toolId) throw new Error('[getNextSequence] 缺少 toolId 参数');
  if (!type) throw new Error('[getNextSequence] 缺少 type 参数');

  await ensureToolMigrated(toolId);

  const key = `sequence_${type}`;
  const rec = await getFromToolDB(toolId, 'meta', key);
  const next = rec && typeof rec.value === 'number' ? rec.value + 1 : 1;
  await putToToolDB(toolId, 'meta', { key, value: next });
  return next;
};

/**
 * 🚨 新增：一次预留 N 个连续序号（用于 AI 批量导入等场景）
 * 只对 meta 表读写各一次，避免 N 次 IndexedDB 往返。
 * @param {string} toolId - 工具 id
 * @param {string} type - 'graphic' | 'group' | 'file'
 * @param {number} count - 需要预留的数量（正整数）
 * @returns {Promise<{start:number, end:number, values:number[]}>}
 */
export const reserveSequence = async (toolId, type, count) => {
  if (!toolId) throw new Error('[reserveSequence] 缺少 toolId 参数');
  if (!type) throw new Error('[reserveSequence] 缺少 type 参数');

  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return { start: 0, end: -1, values: [] };

  await ensureToolMigrated(toolId);

  const key = `sequence_${type}`;
  const rec = await getFromToolDB(toolId, 'meta', key);
  const current = rec && typeof rec.value === 'number' ? rec.value : 0;
  const start = current + 1;
  const end = current + n;

  await putToToolDB(toolId, 'meta', { key, value: end });

  const values = [];
  for (let i = start; i <= end; i++) values.push(i);
  return { start, end, values };
};