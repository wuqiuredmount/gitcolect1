// src/groups/geo/utils/fingerprintStore.js
// 🚨 指纹索引层 —— 支撑千万级数据的幂等去重
//
// 核心思想：
//   fingerprints 表以指纹为主键（keyPath: 'fp'）。
//   去重时只查「待插入的这批指纹是否存在」，而非把全量数据读进内存。
//   时间复杂度 O(k log n)（k=本批条数，n=库中总数），空间 O(k)。
//
// 记录结构：
//   { fp, annotationId, fileId, toolId, group, createdAt }

import {
  openToolDB,
  getFromToolDB,
  putToToolDB,
  filterExistingKeys,
  putManyToToolDB,
  deleteManyFromToolDB,
  getAllFromToolDB
} from './toolDB';
import { ensureToolMigrated } from './migrationManager';
import { buildFingerprint, resolveFingerprint, isValidFingerprint } from './fingerprint';

const STORE = 'fingerprints';
// 🚨 标志带版本号：指纹算法升级时改名，强制重新回填
const BACKFILL_FLAG = 'fingerprints_backfilled_v4';
const BACKFILL_BATCH = 1000; // 每批登记条数，控制事务大小

// 游标遍历 annotations：分批读取，内存占用恒定（不随数据量增长）
// onBatch(records) 返回 Promise，批次内处理完成后继续下一批
const iterateAnnotations = async (toolId, onBatch, batchSize = BACKFILL_BATCH) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('annotations', 'readonly');
    const store = tx.objectStore('annotations');
    const req = store.openCursor();

    let buffer = [];
    let chain = Promise.resolve();

    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        buffer.push(cursor.value);
        if (buffer.length >= batchSize) {
          const chunk = buffer;
          buffer = [];
          chain = chain.then(() => onBatch(chunk));
        }
        cursor.continue();
      } else {
        // 收尾：处理剩余
        if (buffer.length) {
          const chunk = buffer;
          chain = chain.then(() => onBatch(chunk));
        }
        chain.then(() => resolve()).catch(reject);
      }
    };
    req.onerror = () => reject(req.error);
  });
};

/**
 * 批量查询：返回这批指纹中「已存在」的集合
 * @param {string} toolId
 * @param {string[]} fingerprints
 * @returns {Promise<Set<string>>}
 */
export const findExistingFingerprints = async (toolId, fingerprints) => {
  const list = (Array.isArray(fingerprints) ? fingerprints : []).filter(isValidFingerprint);
  if (!toolId || list.length === 0) return new Set();

  await ensureToolMigrated(toolId);
  try {
    const existing = await filterExistingKeys(toolId, STORE, list);
    return new Set(existing);
  } catch (e) {
    console.warn('[fingerprintStore] 索引查询失败:', e);
    return new Set();
  }
};

/**
 * 批量登记指纹（导入成功后调用）
 * @param {string} toolId
 * @param {Array<{fp, annotationId, fileId, group}>} entries
 */
export const registerFingerprints = async (toolId, entries) => {
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && isValidFingerprint(e.fp));
  if (!toolId || list.length === 0) return;

  await ensureToolMigrated(toolId);
  const now = Date.now();
  const records = list.map(e => ({
    fp: e.fp,
    annotationId: e.annotationId || '',
    fileId: e.fileId || 'legacy-file',
    toolId,
    group: e.group || '',
    createdAt: now
  }));

  try {
    await putManyToToolDB(toolId, STORE, records);
  } catch (e) {
    console.warn('[fingerprintStore] 指纹登记失败:', e);
  }
};

/**
 * 删除图形时同步清理指纹（避免残留导致无法重新导入）
 * @param {string} toolId
 * @param {Array<{id?, fingerprint?}>} layers - 被删除的图层对象
 */
export const unregisterFingerprints = async (toolId, layers) => {
  const list = Array.isArray(layers) ? layers.filter(Boolean) : [];
  if (!toolId || list.length === 0) return;

  const fps = [];
  list.forEach(l => {
    const fp = resolveFingerprint(l);
    if (isValidFingerprint(fp)) fps.push(fp);
  });
  if (fps.length === 0) return;

  await ensureToolMigrated(toolId);
  try {
    await deleteManyFromToolDB(toolId, STORE, fps);
  } catch (e) {
    console.warn('[fingerprintStore] 指纹清理失败:', e);
  }
};

/**
 * 🚨 清空该工具全部指纹（算法升级时用于重建索引）
 */
export const clearAllFingerprints = async (toolId) => {
  if (!toolId) return;
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

/**
 * 🚨 按 fileId 清除指纹（用于「清空该文件全部图形」场景）
 * 使用索引游标删除，内存占用恒定
 * @param {string} toolId
 * @param {string} fileId
 */
export const clearFingerprintsByFile = async (toolId, fileId) => {
  if (!toolId) return 0;
  await ensureToolMigrated(toolId);

  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    // 优先用 fileId 索引游标删除；索引缺失时退化为全表游标过滤
    const hasIndex = store.indexNames.contains('fileId');
    const source = hasIndex ? store.index('fileId') : store;
    const req = source.openCursor(fileId ? IDBKeyRange.only(fileId) : undefined);

    let removed = 0;
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        removed++;
        cursor.continue();
      } else {
        resolve(removed);
      }
    };
    req.onerror = () => reject(req.error);
  });
};

/**
 * 读取全部指纹记录（用于统计/校验，慎用于千万级）
 */
export const getAllFingerprintRecords = async (toolId) => {
  if (!toolId) return [];
  await ensureToolMigrated(toolId);
  try {
    return await getAllFromToolDB(toolId, STORE) || [];
  } catch (e) {
    return [];
  }
};

/**
 * 统计某工具库指纹数量（轻量，仅供 UI 展示）
 */
export const countFingerprints = async (toolId) => {
  if (!toolId) return 0;
  await ensureToolMigrated(toolId);
  const list = await getAllFingerprintRecords(toolId);
  return list.length;
};

/**
 * 回填：为已有图层补登指纹（用于旧数据一次性迁移）
 * 🚨 游标驱动：内存占用恒定，可支撑千万级数据
 * @param {string} toolId
 * @returns {Promise<{scanned:number, registered:number}>}
 */
export const backfillFingerprints = async (toolId) => {
  if (!toolId) return { scanned: 0, registered: 0 };
  await ensureToolMigrated(toolId);

  let scanned = 0;
  let registered = 0;

  await iterateAnnotations(toolId, async (chunk) => {
    const entries = [];
    chunk.forEach(l => {
      scanned++;
      const fp = resolveFingerprint(l);
      if (isValidFingerprint(fp)) {
        entries.push({ fp, annotationId: l.id, fileId: l.fileId, group: l.group });
      }
    });
    if (entries.length) {
      await registerFingerprints(toolId, entries);
      registered += entries.length;
    }
  });

  return { scanned, registered };
};

/**
 * 🚨 确保指纹索引就绪（幂等，只执行一次）
 *   - 若从未回填过，则游标扫描 annotations 补登指纹
 *   - 完成后写入 meta 标志，后续调用直接返回
 * 用于：旧数据迁移 + 首次导入前的自愈
 * @returns {Promise<{skipped:boolean, scanned?:number, registered?:number}>}
 */
export const ensureFingerprintsReady = async (toolId) => {
  if (!toolId) return { skipped: true };
  await ensureToolMigrated(toolId);

  try {
    const flag = await getFromToolDB(toolId, 'meta', BACKFILL_FLAG);
    if (flag && flag.value) return { skipped: true };
  } catch (e) {
    // meta 读取失败时继续尝试回填
  }

  // 🚨 回填前先清空旧版本指纹，避免新旧格式混存导致去重失效
  try {
    await clearAllFingerprints(toolId);
  } catch (e) {
    console.warn('[fingerprintStore] 清理旧指纹失败:', e);
  }

  const result = await backfillFingerprints(toolId);

  try {
    await putToToolDB(toolId, 'meta', { key: BACKFILL_FLAG, value: true, at: Date.now() });
  } catch (e) {
    console.warn('[fingerprintStore] 回填标志写入失败:', e);
  }

  return { skipped: false, ...result };
};

/**
 * 清除回填标志（数据被清空重建时调用，确保下次导入重新自愈）
 */
export const resetFingerprintBackfillFlag = async (toolId) => {
  if (!toolId) return;
  await ensureToolMigrated(toolId);
  try {
    await putToToolDB(toolId, 'meta', { key: BACKFILL_FLAG, value: false, at: Date.now() });
  } catch (e) {
    console.warn('[fingerprintStore] 重置回填标志失败:', e);
  }
};
