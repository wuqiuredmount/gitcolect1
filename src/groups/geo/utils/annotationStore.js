// src/groups/geo/utils/annotationStore.js
// ⚠️ 新版：支持多工具隔离，通过 toolId 参数区分不同工具的数据
// 存储内容：轻量地理数据（坐标、样式、字段信息）

const DB_NAME = 'LiangJian_AnnotationStore';
const STORE_NAME = 'geojson_layers';
const DB_VERSION = 2; // ⚠️ 版本升级，触发 onupgradeneeded 重建索引

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      // 如果表已存在，先删除重建，确保新增 toolId 索引
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      // 创建 toolId 索引，用于按工具隔离读取
      store.createIndex('toolId', 'toolId', { unique: false });
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// 序列化图层（去除无法存储的 Leaflet 实例和庞大的 docHtml）
const serializeLayer = (layerData) => {
  const layer = layerData.layerRef;
  let coords = [];

  if (layer && layer.getLatLngs && layer.getLatLngs().length > 0) {
    const latlngs = layer.getLatLngs();
    const flatten = (arr) => Array.isArray(arr[0]) ? arr.map(flatten).flat(1) : arr.map(pt => [pt.lat, pt.lng]);
    coords = flatten(latlngs);
  } else if (layer && layer.getLatLng) {
    coords = [[layer.getLatLng().lat, layer.getLatLng().lng]];
  } else if (layer && layer.getBounds) {
    const b = layer.getBounds();
    coords = [[b.getSouthWest().lat, b.getSouthWest().lng], [b.getNorthEast().lat, b.getNorthEast().lng]];
  } else if (layerData.coords) {
    // 兼容从历史数据加载（layerRef 是空的）
    coords = layerData.coords;
  }

  return {
    id: layerData.id,
    toolId: layerData.toolId || '',
    title: layerData.title,
    type: layerData.type,
    lat: layerData.lat,
    lng: layerData.lng,
    objectName: layerData.objectName,
    fields: layerData.fields,
    style: layerData.style,
    coords: coords
    // ⚠️ 注意：不存 docHtml，由 documentStore.js 独立管理
  };
};

// ✨ 保存所有图层（按 toolId 隔离：只清空该工具的数据）
export const saveAllLayers = async (toolId, layers) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // 1. 只清除该 toolId 下的旧数据
  if (toolId) {
    const index = store.index('toolId');
    const request = index.openCursor(IDBKeyRange.only(toolId));
    await new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = reject;
    });
  } else {
    // 兼容旧调用：无 toolId 时全量清空
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }

  // 2. 写入新数据
  for (const layer of layers) {
    const serialized = serializeLayer({ ...layer, toolId });
    await new Promise((resolve, reject) => {
      const request = store.put(serialized);
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }
};

// ✨ 获取指定工具的所有图层数据（按 toolId 过滤）
export const getAllLayers = async (toolId) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  if (toolId) {
    const index = store.index('toolId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(toolId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } else {
    // 兼容旧调用：无 toolId 时全量返回
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
};

// ✨ 清空指定工具的所有图层数据
export const clearAllLayers = async (toolId) => {
  return saveAllLayers(toolId, []);
};