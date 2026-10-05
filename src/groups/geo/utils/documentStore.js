// src/groups/geo/utils/documentStore.js
import { safeOpenDB } from './dbMigrationManager';

const DB_NAME = 'LiangJian_DocumentStore';
const STORE_NAME = 'geojson_documents';
const DB_VERSION = 3; // 之前是2

const getDB = () => {
  return safeOpenDB(
    DB_NAME,
    [{ name: STORE_NAME, keyPath: 'compositeKey' }],
    DB_VERSION,
    (db, transaction, oldVersion) => {
      console.log('执行文档数据迁移逻辑...');
      // 此处根据实际字段变化写入迁移逻辑
    }
  );
};

const buildKey = (toolId, annotationId) => `${toolId || 'default'}::${annotationId}`;

export const saveDocument = async (toolId, annotationId, docHtml) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const compositeKey = buildKey(toolId, annotationId);
    const request = store.put({ compositeKey, toolId: toolId || 'default', annotationId, docHtml });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getDocument = async (toolId, annotationId) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const compositeKey = buildKey(toolId, annotationId);
    const request = store.get(compositeKey);
    request.onsuccess = () => resolve(request.result ? request.result.docHtml : null);
    request.onerror = () => reject(request.error);
  });
};

export const deleteDocument = async (toolId, annotationId) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const compositeKey = buildKey(toolId, annotationId);
    const request = store.delete(compositeKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllDocuments = async (toolId) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (!toolId || cursor.value.toolId === toolId) cursor.delete();
        cursor.continue();
      } else resolve();
    };
    request.onerror = () => reject(request.error);
  });
};