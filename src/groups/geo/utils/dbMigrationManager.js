// src/groups/geo/utils/dbMigrationManager.js

/**
 * 数据库全局守卫：用于防止热更新导致的数据丢失
 * 如果版本发生升级，必须提供完整的 migrationLogic，否则阻断应用运行
 */
export const safeOpenDB = (dbName, storeNames, newVersion, migrationLogic = null) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, newVersion);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // 1. 首次创建数据库
      if (oldVersion === 0) {
        storeNames.forEach(storeConfig => {
          const store = db.createObjectStore(storeConfig.name, { keyPath: storeConfig.keyPath });
          if (storeConfig.indexes) {
            storeConfig.indexes.forEach(idx => store.createIndex(idx.name, idx.keyPath, idx.options));
          }
        });
        return;
      }

      // 2. 版本升级（核心拦截逻辑）
      if (oldVersion > 0 && oldVersion < newVersion) {
        if (!migrationLogic) {
          // 触发强报错机制：拦截并终止程序！
          const errorMsg = `【致命错误】代码数据库版本已升级至 v${newVersion}，但未提供数据迁移逻辑！\n请立刻在 dbMigrationManager.js 中补充 migrationLogic 函数，否则将会丢失用户旧数据！`;
          console.error(errorMsg);
          
          // 阻止默认的覆盖行为，抛出异常
          alert(errorMsg); 
          throw new Error('缺少关键的数据迁移逻辑，应用已被强制阻断！');
        }

        try {
          // 执行开发者传入的迁移逻辑
          console.log(`开始从 v${oldVersion} 升级到 v${newVersion}...`);
          migrationLogic(db, event.currentTarget.transaction, oldVersion, newVersion);
        } catch (migrationError) {
          console.error('数据迁移失败:', migrationError);
          alert(`数据迁移失败：${migrationError.message}`);
          reject(migrationError);
          return;
        }
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};