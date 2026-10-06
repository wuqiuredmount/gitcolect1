// src/groups/geo/utils/recycleStore.js
// 🚨 信息回收站数据层
// 设计：删除图形时不直接销毁，而是把图形记录 + 富文本一起搬到 recyclebin 表；
//       恢复时再搬回 annotations + documents。
// 主键：`${fileId}_${annotationId}`，保证跨文件唯一。

import { openToolDB } from './toolDB';
import { ensureToolMigrated } from './migrationManager';

const recycleKey = (fileId, annotationId) => `${fileId}_${annotationId}`;

// 把一条图形 + 富文本移入回收站（单事务，先写回收站）
export const moveToRecycleBin = async (toolId, fileId, layer, docHtml = '') => {
  if (!toolId || !fileId || !layer || !layer.id) return;
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recyclebin', 'readwrite');
    const store = tx.objectStore('recyclebin');
    store.put({
      id: recycleKey(fileId, layer.id),
      fileId,
      annotationId: layer.id,
      deletedAt: new Date().toISOString(),
      layer: JSON.parse(JSON.stringify(layer)),
      docHtml: docHtml || ''
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 读取某工具回收站全部记录（按删除时间倒序）
export const getAllRecycled = async (toolId) => {
  if (!toolId) return [];
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recyclebin', 'readonly');
    const store = tx.objectStore('recyclebin');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      resolve(list.map(r => ({ ...r, toolId })));
    };
    req.onerror = () => reject(req.error);
  });
};

// 读取单个回收站记录
export const getRecycled = async (toolId, fileId, annotationId) => {
  if (!toolId || !fileId || !annotationId) return null;
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recyclebin', 'readonly');
    const store = tx.objectStore('recyclebin');
    const req = store.get(recycleKey(fileId, annotationId));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
};

// 从回收站移除单条（彻底删除，不恢复）
export const purgeFromRecycleBin = async (toolId, fileId, annotationId) => {
  if (!toolId || !fileId || !annotationId) return;
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recyclebin', 'readwrite');
    const store = tx.objectStore('recyclebin');
    store.delete(recycleKey(fileId, annotationId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 清空某工具回收站
export const clearRecycleBin = async (toolId) => {
  if (!toolId) return;
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recyclebin', 'readwrite');
    const store = tx.objectStore('recyclebin');
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 统计某工具回收站条数
export const countRecycled = async (toolId) => {
  if (!toolId) return 0;
  await ensureToolMigrated(toolId);
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recyclebin', 'readonly');
    const store = tx.objectStore('recyclebin');
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
};
