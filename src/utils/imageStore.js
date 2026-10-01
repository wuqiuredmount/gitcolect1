// src/utils/imageStore.js
// 专门管理“轮播图”的 IndexedDB 存储

const DB_NAME = 'LiangJian_ImageStore';
const STORE_NAME = 'slideshow_images';
const DB_VERSION = 1;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// 获取所有已保存的图片
export const getAllImages = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 新增一张图片（File 对象直接存储，无需转 Base64）
export const addImage = async (file) => {
  const db = await openDB();
  const id = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const record = {
    id,
    name: file.name,
    blob: file,
    type: file.type,
    createdAt: Date.now()
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

// 删除一张图片
export const deleteImage = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// 清空所有用户上传的图片（用于“恢复默认”）
export const clearAllImages = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};