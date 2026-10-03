// src/groups/geo/utils/projectStore.js
const DB_NAME = 'LiangJian_ProjectStore';
const STORE_NAME = 'geo_projects';
const DB_VERSION = 1;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('toolId', 'toolId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// 保存工程到库存
export const saveProjectToInventory = async (projectData) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // 生成唯一ID
    const id = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const record = {
      ...projectData,
      id,
      updatedAt: new Date().toISOString()
    };
    
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

// 获取特定工具组的所有工程
export const getAllProjects = async (toolId) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const index = store.index('toolId');
    const request = index.getAll(toolId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 删除工程
export const deleteProjectFromInventory = async (id) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const request = store.delete(id);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};