// src/groups/geo/utils/annotationStore.js
import { safeOpenDB } from './dbMigrationManager';

const DB_NAME = 'LiangJian_AnnotationStore';
const STORE_NAME = 'geo_annotations';
const DB_VERSION = 2; // 每次修改数据结构，务必手动+1

const getDB = () => {
  return safeOpenDB(
    DB_NAME,
    [{ 
      name: STORE_NAME, 
      keyPath: 'id', 
      indexes: [{ name: 'toolId', keyPath: 'toolId', options: { unique: false } }] 
    }],
    DB_VERSION,
    (db, transaction, oldVersion, newVersion) => {
      // 【迁移逻辑写在这里】
      // 示例：从 v1 升级到 v2 时，为所有旧数据补充 group 字段
      console.log('执行标注数据迁移逻辑...');
      const store = transaction.objectStore(STORE_NAME);
      
      if (oldVersion < 2) {
        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const data = cursor.value;
            if (data.group === undefined) {
              data.group = '默认';
            }
            cursor.update(data);
            cursor.continue();
          }
        };
      }
    }
  );
};

export const saveAllLayers = async (toolId, layers) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // 1. 先清除该工具下的旧数据
    if (toolId) {
      const index = store.index('toolId');
      const request = index.openKeyCursor(IDBKeyRange.only(toolId));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    } else {
      store.clear();
    }

    // 2. 写入新数据
    for (const layer of layers) {
      store.put({ ...layer, toolId });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getAllLayers = async (toolId) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    if (toolId) {
      const index = store.index('toolId');
      const request = index.getAll(IDBKeyRange.only(toolId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }
  });
};

export const clearAllLayers = async (toolId) => {
  return saveAllLayers(toolId, []);
};