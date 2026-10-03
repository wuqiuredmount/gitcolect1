// src/groups/geo/utils/documentStore.js
// ⚠️ 新版：支持多工具隔离，使用复合主键 `toolId:annotationId`
// 存储内容：富文本编辑器中的文档 HTML

const DB_NAME = 'LiangJian_DocumentStore';
const STORE_NAME = 'geojson_documents';
const DB_VERSION = 2; // ⚠️ 版本升级

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // 重建表，使用复合主键 `${toolId}:${annotationId}`
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: 'compositeKey' });
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// 构造复合主键（防止不同工具下的相同 annotationId 冲突）
const buildKey = (toolId, annotationId) => `${toolId || 'default'}:${annotationId}`;

// ✨ 保存文档
export const saveDocument = async (toolId, annotationId, docHtml) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const compositeKey = buildKey(toolId, annotationId);
    const request = store.put({ compositeKey, toolId: toolId || 'default', annotationId, docHtml });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ✨ 获取文档
export const getDocument = async (toolId, annotationId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const compositeKey = buildKey(toolId, annotationId);
    const request = store.get(compositeKey);
    request.onsuccess = () => resolve(request.result ? request.result.docHtml : null);
    request.onerror = () => reject(request.error);
  });
};

// ✨ 删除文档
export const deleteDocument = async (toolId, annotationId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const compositeKey = buildKey(toolId, annotationId);
    const request = store.delete(compositeKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ✨ 清空指定工具的所有文档
export const clearAllDocuments = async (toolId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (!toolId || cursor.value.toolId === toolId) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = reject;
  });
};