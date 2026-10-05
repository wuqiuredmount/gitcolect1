// src/groups/geo/utils/migrationManager.js
// 🚨 Phase 3b：简化版
// Phase 2b 已完成旧库→新库的迁移，Phase 3a 已删除旧库。
// 本文件现在只负责"初始化标记"：
//   - 老用户：标记已存在，直接走缓存
//   - 新用户（首次安装或清库后）：每个工具第一次访问时打标记
//   - 未来新增工具：自动被纳入管理体系

const SYSTEM_DB = 'LiangJian_System';
const SYSTEM_VERSION = 1;

let systemDBPromise = null;
const openSystemDB = () => {
  if (systemDBPromise) return systemDBPromise;
  systemDBPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(SYSTEM_DB, SYSTEM_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('migration')) {
        db.createObjectStore('migration', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('global')) {
        db.createObjectStore('global', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return systemDBPromise;
};

const setMigrationRecord = async (toolId, record) => {
  const db = await openSystemDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('migration', 'readwrite');
    const store = tx.objectStore('migration');
    const req = store.put({ id: `tool_${toolId}`, ...record });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

// ==================== 内存缓存 ====================
const migratedCache = new Set();
let migratedCacheLoaded = false;
const migrationPromises = new Map();

const loadMigratedCache = async () => {
  if (migratedCacheLoaded) return;
  const db = await openSystemDB();
  await new Promise((resolve) => {
    const tx = db.transaction('migration', 'readonly');
    const store = tx.objectStore('migration');
    const req = store.getAll();
    req.onsuccess = () => {
      (req.result || []).forEach(r => {
        if (r.migrated && r.id.startsWith('tool_')) {
          migratedCache.add(r.id.replace('tool_', ''));
        }
      });
      migratedCacheLoaded = true;
      resolve();
    };
    req.onerror = () => { migratedCacheLoaded = true; resolve(); };
  });
};

// ==================== 对外接口 ====================
export const ensureToolMigrated = async (toolId) => {
  if (!toolId) return;

  await loadMigratedCache();
  if (migratedCache.has(toolId)) return;

  if (migrationPromises.has(toolId)) {
    return migrationPromises.get(toolId);
  }

  const p = (async () => {
    try {
      await setMigrationRecord(toolId, {
        migrated: true,
        migratedAt: new Date().toISOString(),
        note: 'Phase 3b: 初始化完成'
      });
      migratedCache.add(toolId);
      console.log(`[初始化] 工具 ${toolId} 已就绪`);
    } catch (e) {
      console.error(`[初始化] 工具 ${toolId} 标记失败:`, e);
      throw e;
    } finally {
      migrationPromises.delete(toolId);
    }
  })();

  migrationPromises.set(toolId, p);
  return p;
};