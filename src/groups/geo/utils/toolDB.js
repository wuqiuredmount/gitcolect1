// src/groups/geo/utils/toolDB.js
// 🚨 Phase 2a：每工具一库的通用操作封装
import { TOOL_META, TOOL_ORDER, TOOL_DB_VERSION, TOOL_STORES } from './toolRegistry';

// 缓存已打开的 DB 连接（同一库复用，避免重复 open）
const dbCache = new Map();

// 打开指定工具的数据库
export const openToolDB = (toolId) => {
  if (dbCache.has(toolId)) {
    return Promise.resolve(dbCache.get(toolId));
  }
  
  const meta = TOOL_META[toolId];
  if (!meta) {
    return Promise.reject(new Error(`[toolDB] 未知工具: ${toolId}`));
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(meta.dbName, TOOL_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // 首次创建：建全部表（含 v2 的 recyclebin）
      if (oldVersion === 0) {
        TOOL_STORES.forEach(storeConfig => {
          const store = db.createObjectStore(storeConfig.name, { keyPath: storeConfig.keyPath });
          if (storeConfig.indexes) {
            storeConfig.indexes.forEach(idx => {
              store.createIndex(idx.name, idx.keyPath, idx.options || {});
            });
          }
        });
        console.log(`[toolDB] 首次创建库: ${meta.dbName}`);
      }
      // 🚨 v1 → v2：补建 recyclebin 表（老库升级）
      if (oldVersion > 0 && oldVersion < 2) {
        if (!db.objectStoreNames.contains('recyclebin')) {
          const recycle = db.createObjectStore('recyclebin', { keyPath: 'id' });
          recycle.createIndex('deletedAt', 'deletedAt');
          console.log(`[toolDB] ${meta.dbName} 升级到 v2：已补建 recyclebin 表`);
        }
      }
      // 🚨 v2 → v3：补建 fingerprints 指纹索引表（支撑千万级幂等去重）
      if (oldVersion > 0 && oldVersion < 3) {
        if (!db.objectStoreNames.contains('fingerprints')) {
          const fp = db.createObjectStore('fingerprints', { keyPath: 'fp' });
          fp.createIndex('annotationId', 'annotationId');
          fp.createIndex('fileId', 'fileId');
          fp.createIndex('createdAt', 'createdAt');
          console.log(`[toolDB] ${meta.dbName} 升级到 v3：已补建 fingerprints 表`);
        }
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      dbCache.set(toolId, db);
      resolve(db);
    };
    request.onerror = (event) => reject(event.target.error);
  });
};

// 读取单条
export const getFromToolDB = async (toolId, storeName, key) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 读取全部
export const getAllFromToolDB = async (toolId, storeName) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 写入单条
export const putToToolDB = async (toolId, storeName, record) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// 删除单条
export const deleteFromToolDB = async (toolId, storeName, key) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// 清空整个 store
export const clearToolDB = async (toolId, storeName) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// 🚨 新增：批量按键存在性查询（用于幂等去重，避免全量加载）
// 返回已存在的 key 数组。单事务内完成，千万级数据下也只需 O(k log n)。
export const filterExistingKeys = async (toolId, storeName, keys) => {
  const list = Array.isArray(keys) ? keys.filter(k => k !== null && k !== undefined) : [];
  if (list.length === 0) return [];

  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const existing = [];
    let pending = list.length;

    list.forEach(key => {
      const req = store.getKey(key);
      req.onsuccess = () => {
        if (req.result !== undefined) existing.push(key);
        if (--pending === 0) resolve(existing);
      };
      req.onerror = () => {
        if (--pending === 0) resolve(existing);
      };
    });

    tx.onerror = () => reject(tx.error);
  });
};

// 🚨 新增：批量写入（单事务），用于指纹登记
// records: [{ ... }]，每条须含其 keyPath 对应字段
export const putManyToToolDB = async (toolId, storeName, records) => {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (list.length === 0) return;

  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    list.forEach(rec => store.put(rec));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 🚨 新增：按主键批量删除（单事务），用于删除图形时同步清理指纹
// keys: 主键数组
export const deleteManyFromToolDB = async (toolId, storeName, keys) => {
  const list = Array.isArray(keys) ? keys.filter(k => k !== null && k !== undefined) : [];
  if (list.length === 0) return;

  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    list.forEach(key => store.delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 原子替换：清空 + 批量写入（一次事务）
export const replaceAllInToolDB = async (toolId, storeName, records) => {
  const db = await openToolDB(toolId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    records.forEach(rec => store.put(rec));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 关闭指定工具库的连接
export const closeToolDB = (toolId) => {
  if (dbCache.has(toolId)) {
    dbCache.get(toolId).close();
    dbCache.delete(toolId);
  }
};

// 删除整个工具库（用于迁移后清理，或用户主动删除）
export const deleteToolDB = (toolId) => {
  closeToolDB(toolId);
  const meta = TOOL_META[toolId];
  if (!meta) return Promise.reject(new Error(`未知工具: ${toolId}`));
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(meta.dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn(`[toolDB] 删除库 ${meta.dbName} 被阻止（可能有其他连接未关闭）`);
    };
  });
};

// 🚨 启动时确保 6 个工具库全部创建
export const ensureAllToolDBs = async () => {
  const results = [];
  for (const toolId of TOOL_ORDER) {
    try {
      await openToolDB(toolId);
      results.push({ toolId, ok: true });
    } catch (e) {
      results.push({ toolId, ok: false, error: e.message });
    }
  }
  console.log('[toolDB] 所有工具库初始化完成:', results);
  return results;
};