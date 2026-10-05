// src/groups/geo/utils/projectStore.js
import { safeOpenDB } from './dbMigrationManager';

const DB_NAME = 'LiangJian_ProjectStore';
const STORE_NAME = 'geo_projects';
const DB_VERSION = 2; // 升级版本号

const getDB = () => {
  return safeOpenDB(
    DB_NAME,
    [{ 
      name: STORE_NAME, 
      keyPath: 'id',
      indexes: [
        { name: 'toolId', keyPath: 'toolId', options: { unique: false } },
        { name: 'createdAt', keyPath: 'createdAt', options: { unique: false } }
      ]
    }],
    DB_VERSION,
    (db, transaction, oldVersion) => {
      console.log('执行工程数据迁移逻辑...');
      // 若将来有字段变动，在此处补充逻辑
    }
  );
};

export const saveProjectToInventory = async (projectData) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const id = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const record = { ...projectData, id, updatedAt: new Date().toISOString() };
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjects = async (toolId) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    if (toolId) {
      const index = store.index('toolId');
      const request = index.getAll(toolId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }
  });
};

export const deleteProjectFromInventory = async (id) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};