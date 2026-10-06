// src/groups/geo/utils/aiImporter.js
// 🚨 AI 批量导入器：把标准 JSON 批量转成标记 + 富文本文档，写入 IndexedDB
// 设计原则：
//   1. 只处理数据，不接触 Leaflet 实例（渲染交给 BaseMapTool.refreshDataFromDB）
//   2. 优先使用坐标；无坐标则跳过（地理编码由 AI 采集阶段完成，避免消耗高德额度）
//   3. 不破坏现有 fileId 隔离与鹰眼公共平台规则
//   4. 🚨 幂等导入：基于「指纹索引表」去重，O(k log n)，可支撑千万级数据
//      不再把全量数据读进内存，避免 OOM

import { appendLayers } from './annotationStore';
import { saveDocumentsBatch } from './documentStore';
import { reserveSequence } from './systemStore';
import { formatGraphicId } from './toolRegistry';
import { buildFingerprint, isValidFingerprint } from './fingerprint';
import {
  ensureFingerprintsReady,
  findExistingFingerprints,
  registerFingerprints
} from './fingerprintStore';
// 🚨 多平台地理编码器（高德额度耗尽自动降级到百度/天地图/Nominatim）
// 仅作采集阶段兜底，导入主流程仍不自动调用，保持「导入零消耗」约定
import {
  geocodeAddress,
  geocodeBatch,
  getGeocodeQuotaStatus,
  resetGeocodeQuota
} from './geocoder';

export { geocodeAddress, geocodeBatch, getGeocodeQuotaStatus, resetGeocodeQuota };

// 蓝色标记默认样式（与全局 marker 默认样式一致）
const DEFAULT_MARKER_STYLE = { color: '#1890ff', iconType: 0, iconSize: 32, fillOpacity: 1 };

// 校验单条数据，返回 null 表示通过，否则返回错误说明
const validateItem = (item, idx) => {
  if (!item || typeof item !== 'object') return `第 ${idx + 1} 条不是对象`;
  if (!item.name || String(item.name).trim() === '') return `第 ${idx + 1} 条缺少 name`;
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return `第 ${idx + 1} 条缺少有效坐标 (lat/lng)`;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return `第 ${idx + 1} 条坐标越界`;
  return null;
};

// 拼接富文本 HTML：时间 + 简介 + 图片
const buildDocHtml = (item) => {
  const parts = [];
  // 🚨 时间信息：涉及赛事 / 活动 / 节庆等时间敏感数据时由 AI 提供，置于正文顶部
  const timeText = item.time || item.date || '';
  if (timeText && String(timeText).trim() !== '') {
    parts.push(`<p><b>时间：</b>${String(timeText).trim()}</p>`);
  }
  const intro = item.intro || item.description || '';
  if (intro) parts.push(String(intro));

  const images = Array.isArray(item.images)
    ? item.images
    : (item.image ? [item.image] : []);

  images.forEach(url => {
    if (url && String(url).trim() !== '') {
      parts.push(`<p><img src="${url}" alt="${item.name}" /></p>`);
    }
  });
  return parts.join('\n');
};

// 初始化空信息栏（500 位，保持与手动绘制一致的数据结构）
const emptyFields = () => Array.from({ length: 500 }).map(() => ({ label: '', value: '' }));

/**
 * 执行批量导入（幂等：已存在的相同数据会被跳过）
 * @param {object} opts
 * @param {string} opts.toolId   - 工具 id
 * @param {string} opts.fileId   - 文件编号（鹰眼固定 legacy-file）
 * @param {object} opts.batchData - { batchName, group, markerColor, items: [] }
 * @param {function} [opts.onProgress] - (done, total, currentName) => void
 * @returns {Promise<{imported:number, skipped:number, duplicated:number, skippedReasons:string[], ids:string[], group:string}>}
 */
export const importAiBatch = async ({ toolId, fileId, batchData, onProgress }) => {
  if (!toolId) throw new Error('[importAiBatch] 缺少 toolId');
  const safeFileId = fileId || 'legacy-file';

  const items = (batchData && Array.isArray(batchData.items)) ? batchData.items : [];
  if (items.length === 0) {
    return { imported: 0, skipped: 0, duplicated: 0, skippedReasons: ['数据为空'], ids: [], group: '' };
  }

  const groupName = (batchData.group && String(batchData.group).trim()) || 'AI导入';

  // 1. 逐条校验，分离有效/无效
  const validItems = [];
  const skippedReasons = [];
  items.forEach((item, idx) => {
    const err = validateItem(item, idx);
    if (err) skippedReasons.push(err);
    else validItems.push(item);
  });

  if (validItems.length === 0) {
    return { imported: 0, skipped: items.length, duplicated: 0, skippedReasons, ids: [], group: groupName };
  }

  // 2. 🚨 确保指纹索引就绪（首次调用会自动回填旧数据，幂等）
  try {
    await ensureFingerprintsReady(toolId);
  } catch (e) {
    console.warn('[importAiBatch] 指纹索引初始化失败，将退化处理:', e);
  }

  // 3. 🚨 为每条数据计算指纹（含批次内去重）
  const candidates = [];
  const seenInBatch = new Set();
  let innerDup = 0;
  validItems.forEach(item => {
    // 🚨 仅用稳定身份维度计算指纹（name/lat/lng/toolId/type）
    const fp = buildFingerprint({
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      toolId,
      type: 'marker'
    });
    if (!isValidFingerprint(fp)) {
      skippedReasons.push(`指纹计算失败，跳过：${String(item.name).trim()}`);
      return;
    }
    if (seenInBatch.has(fp)) {
      innerDup++;
      skippedReasons.push(`批次内重复，跳过：${String(item.name).trim()}`);
      return;
    }
    seenInBatch.add(fp);
    candidates.push({ item, fp });
  });

  // 4. 🚨 索引查询：一次性查出这批指纹中哪些已存在（O(k log n)，不加载全量）
  let existingSet = new Set();
  try {
    existingSet = await findExistingFingerprints(toolId, candidates.map(c => c.fp));
  } catch (e) {
    console.warn('[importAiBatch] 指纹查询失败，本次将全量尝试导入:', e);
  }

  // 5. 过滤已存在的数据
  const toInsert = [];
  let duplicated = innerDup;
  candidates.forEach(({ item, fp }) => {
    if (existingSet.has(fp)) {
      duplicated++;
      skippedReasons.push(`已存在，跳过：${String(item.name).trim()}`);
      return;
    }
    toInsert.push({ item, fp });
  });

  if (toInsert.length === 0) {
    return {
      imported: 0,
      skipped: items.length,
      duplicated,
      skippedReasons,
      ids: [],
      group: groupName
    };
  }

  const markerStyle = { ...DEFAULT_MARKER_STYLE };
  if (batchData.markerColor) markerStyle.color = batchData.markerColor;

  // 6. 一次预留 N 个图形序号
  const { values: seqs } = await reserveSequence(toolId, 'graphic', toInsert.length);

  // 7. 构造 layerData 与文档
  const newLayers = [];
  const docs = [];
  const ids = [];
  const fpEntries = [];

  for (let i = 0; i < toInsert.length; i++) {
    const { item, fp } = toInsert[i];
    const graphicId = formatGraphicId(toolId, seqs[i]);
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    const name = String(item.name).trim();

    newLayers.push({
      id: graphicId,
      toolId,
      fileId: safeFileId,
      title: name,
      objectName: name,
      type: 'marker',
      lat,
      lng,
      coords: [[lat, lng]],
      address: item.address || '',
      group: groupName,
      // 🚨 数据身份证：用于幂等去重
      fingerprint: fp,
      fields: emptyFields(),
      style: { ...markerStyle }
    });

    docs.push({ annotationId: graphicId, docHtml: buildDocHtml(item) });
    fpEntries.push({ fp, annotationId: graphicId, fileId: safeFileId, group: groupName });
    ids.push(graphicId);

    if (typeof onProgress === 'function') onProgress(i + 1, toInsert.length, name);
  }

  // 8. 增量追加到 annotations 表（单事务，不读旧数据、不清空）
  await appendLayers(toolId, safeFileId, newLayers);

  // 9. 批量写富文本文档
  await saveDocumentsBatch(toolId, safeFileId, docs);

  // 10. 🚨 登记指纹索引（失败不影响主流程，下次导入会重新自愈）
  try {
    await registerFingerprints(toolId, fpEntries);
  } catch (e) {
    console.warn('[importAiBatch] 指纹登记失败（数据已导入）:', e);
  }

  return {
    imported: newLayers.length,
    skipped: skippedReasons.length,
    duplicated,
    skippedReasons,
    ids,
    group: groupName
  };
};

/**
 * 可选：用 OpenStreetMap Nominatim 反查坐标（免费、无需 key、不消耗高德额度）
 * 注意：Nominatim 有 1 req/s 限流要求，请谨慎批量调用。
 * 导入主流程不自动调用此函数，坐标由 AI 采集阶段提供。
 */
export const geocodeByNominatim = async (address) => {
  if (!address || String(address).trim() === '') return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn('[geocodeByNominatim] 失败:', e);
  }
  return null;
};
