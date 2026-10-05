// src/groups/geo/utils/documentStore.js
// 🚨 支持 fileId 隔离
import {
  getFromToolDB,
  putToToolDB,
  deleteFromToolDB,
  getAllFromToolDB,
  clearToolDB
} from './toolDB';
import { ensureToolMigrated } from './migrationManager';

export const saveDocument = async (toolId, fileId, annotationId, docHtml) => {
  if (!toolId || !fileId || !annotationId) {
    console.warn('[saveDocument] 缺少 toolId、fileId 或 annotationId');
    return;
  }
  await ensureToolMigrated(toolId);
  const id = `${fileId}_${annotationId}`; // 🚨 组合主键，保证不同文件下的图形文档互不干扰
  await putToToolDB(toolId, 'documents', { id, fileId, annotationId, docHtml });
};

export const getDocument = async (toolId, fileId, annotationId) => {
  if (!toolId || !fileId || !annotationId) return null;
  await ensureToolMigrated(toolId);
  const id = `${fileId}_${annotationId}`;
  const rec = await getFromToolDB(toolId, 'documents', id);
  return rec ? rec.docHtml : null;
};

export const deleteDocument = async (toolId, fileId, annotationId) => {
  if (!toolId || !fileId || !annotationId) return;
  await ensureToolMigrated(toolId);
  const id = `${fileId}_${annotationId}`;
  await deleteFromToolDB(toolId, 'documents', id);
};

export const clearAllDocuments = async (toolId) => {
  if (!toolId) return;
  await ensureToolMigrated(toolId);
  await clearToolDB(toolId, 'documents');
};

// 可选：批量读取该工具所有文档（备用于信息数据库全量拉取优化）
export const getAllDocuments = async (toolId, fileId = null) => {
  if (!toolId) return [];
  await ensureToolMigrated(toolId);
  const list = await getAllFromToolDB(toolId, 'documents');
  
  // 🚨 如果传了 fileId，则只过滤出当前文件的文档
  if (fileId) {
    return list.filter(doc => doc.fileId === fileId);
  }
  return list;
};