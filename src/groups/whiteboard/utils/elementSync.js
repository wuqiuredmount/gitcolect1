// src/groups/whiteboard/utils/elementSync.js
// 🖊️ 白板元素 ↔ 地图元素同等待遇同步层
//
// 职责：把 Excalidraw 场景里的图形注册成与地图图形完全一致的 annotation：
//   编号（WB.00001）/ 指纹去重 / 富文本 documents / 软删除 recyclebin / 信息数据库可见
//
// 关键约束（不得更改）：
//   1. 不改指纹算法（fingerprint.js 保持 v4，buildFingerprint 一行不动）
//   2. 白板元素 type 一律加 `wb-` 前缀（wb-rectangle 等），与地图元素指纹天然隔离
//   3. 无自定义名称（customData.name）或坐标换算失败的元素 → 不注册指纹、不入库
//      （此时它在数据库里「不存在」，属未登记图形，UI 需引导补全）
//   4. 本文件只处理元素级差异，场景整体由 boardStore 负责

import { appendLayers, getAllLayers, saveAllLayers } from '../../geo/utils/annotationStore.js';
import { saveDocument, getDocument, deleteDocument } from '../../geo/utils/documentStore.js';
import { moveToRecycleBin } from '../../geo/utils/recycleStore.js';
import { reserveSequence } from '../../geo/utils/systemStore.js';
import { formatGraphicId } from '../../geo/utils/toolRegistry.js';
import { buildFingerprint, isValidFingerprint } from '../../geo/utils/fingerprint.js';
import { findExistingFingerprints, registerFingerprints, unregisterFingerprints } from '../../geo/utils/fingerprintStore.js';
import { canvasToLatLng, getElementAnchor, getElementGeometry, isValidBounds, isValidCanvas } from './coordinate.js';

export const WB_TOOL_ID = 'wb-whiteboard';

// 白板元素 → annotation 的 id 映射：sceneElementId -> WB.00001
// 内存态，随白板会话存活；持久化副本写在 annotation.wbElementId 上，刷新后可重建
export class ElementIdMap {
  constructor() {
    this.byElement = new Map();    // wbElementId -> annotationId
    this.byAnnotation = new Map(); // annotationId -> wbElementId
  }

  getAnnotationId(elementId) {
    return this.byElement.get(elementId) || null;
  }

  set(elementId, annotationId) {
    if (!elementId || !annotationId) return;
    this.byElement.set(elementId, annotationId);
    this.byAnnotation.set(annotationId, elementId);
  }

  removeByElement(elementId) {
    const aid = this.byElement.get(elementId);
    if (aid) this.byAnnotation.delete(aid);
    this.byElement.delete(elementId);
  }

  removeByAnnotation(annotationId) {
    const eid = this.byAnnotation.get(annotationId);
    if (eid) this.byElement.delete(eid);
    this.byAnnotation.delete(annotationId);
  }

  clear() {
    this.byElement.clear();
    this.byAnnotation.clear();
  }

  get size() {
    return this.byElement.size;
  }
}

// 从数据库已有记录重建映射（刷新页面后恢复关联）
export const rebuildIdMap = async (fileId) => {
  const map = new ElementIdMap();
  try {
    const layers = await getAllLayers(WB_TOOL_ID, fileId || null) || [];
    layers.forEach(l => {
      if (l && l.wbElementId) map.set(l.wbElementId, l.id);
    });
  } catch (e) {
    console.warn('[elementSync] 重建元素映射失败:', e);
  }
  return map;
};

// 元素名称来源：约定写在 customData.name（兼容 customData.title）
export const getElementName = (element) => {
  if (!element) return '';
  const cd = element.customData || {};
  const raw = cd.name || cd.title || '';
  return String(raw).trim();
};

// 分组来源：customData.group，缺省归入「默认」
export const getElementGroup = (element) => {
  const cd = (element && element.customData) || {};
  const g = String(cd.group || '').trim();
  return g || '默认';
};

// 白板元素类型：加 wb- 前缀，防止与地图元素指纹碰撞
export const getWbType = (element) => `wb-${(element && element.type) || 'element'}`;

// 判定元素是否「可登记」：必须有自定义名称，且坐标换算成功
export const isRegisterable = (element, bounds, canvas) => {
  if (!element || element.isDeleted) return false;
  if (!getElementName(element)) return false;
  const anchor = getElementAnchor(element);
  if (!anchor) return false;
  return !!canvasToLatLng(anchor, bounds, canvas);
};


// ---------- 记录构造 ----------

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// 构造 annotation 记录（坐标已换算）
const buildAnnotation = ({ element, annotationId, fileId, bounds, canvas, group, name }) => {
  const anchor = getElementAnchor(element);
  const geo = canvasToLatLng(anchor, bounds, canvas) || {};
  const geometry = getElementGeometry(element);

  return {
    id: annotationId,
    toolId: WB_TOOL_ID,
    fileId,
    title: name,
    objectName: name,
    type: getWbType(element),
    lat: geo.lat,
    lng: geo.lng,
    coords: Number.isFinite(geo.lat) ? [[geo.lat, geo.lng]] : [],
    group,
    // 保留原始画布信息，便于日后回写场景
    wbElementId: element.id,
    wbType: element.type,
    wbX: geometry.wbX,
    wbY: geometry.wbY,
    wbW: geometry.wbW,
    wbH: geometry.wbH,
    fields: Array.from({ length: 500 }).map(() => ({ label: '', value: '' })),
    style: { color: '#1890ff', iconType: 0, iconSize: 32, fillOpacity: 1 }
  };
};

// 默认富文本：把白板上的名称 / 文字先落一份，避免信息数据库里详情为空
export const buildDefaultDocHtml = (element, name) => {
  const parts = [];
  if (name) parts.push(`<p><b>${escapeHtml(name)}</b></p>`);
  const text = element && element.type === 'text' ? String(element.text || '').trim() : '';
  if (text && text !== name) parts.push(`<p>${escapeHtml(text)}</p>`);
  parts.push('<p style="color:#888;font-size:12px;">（由白板元素自动登记，可在富文本编辑器中补充详情）</p>');
  return parts.join('\n');
};


// ---------- 场景增量同步 ----------

/**
 * 场景增量同步主入口
 * @param {object} opts
 * @param {Array} opts.elements        - 当前 Excalidraw 场景元素（含 isDeleted）
 * @param {ElementIdMap} opts.idMap    - 元素 id ↔ 编号 映射（会被就地更新）
 * @param {object} opts.bounds         - 地理范围 { minLat, maxLat, minLng, maxLng }
 * @param {object} opts.canvas         - { canvasWidth, canvasHeight }
 * @param {string} opts.fileId         - 白板所在文件区（默认 legacy-file）
 * @param {boolean} [opts.autoRegister=true] - 是否自动为「已命名」新元素编号入库
 * @returns {Promise<{registered:number, skipped:number, removed:string[], updated:number}>}
 */
export const syncScene = async ({
  elements,
  idMap,
  bounds,
  canvas,
  fileId = 'legacy-file',
  autoRegister = true
}) => {
  const result = { registered: 0, skipped: 0, removed: [], updated: 0 };
  if (!idMap) return result;

  const list = Array.isArray(elements) ? elements : [];
  const boundsOk = isValidBounds(bounds);
  const canvasOk = isValidCanvas(canvas);
  const safeFileId = fileId || 'legacy-file';

  // ---------- 1. 已删除元素：进回收站 + 清富文本 + 注销指纹 ----------
  const aliveIds = new Set(list.filter(e => e && !e.isDeleted).map(e => e.id));
  const deletedElementIds = [];
  idMap.byElement.forEach((annotationId, elementId) => {
    if (!aliveIds.has(elementId)) deletedElementIds.push(elementId);
  });

  if (deletedElementIds.length > 0) {
    const all = await getAllLayers(WB_TOOL_ID, safeFileId) || [];
    const removedIds = new Set();
    for (const elementId of deletedElementIds) {
      const annotationId = idMap.getAnnotationId(elementId);
      const layer = all.find(l => l.id === annotationId);
      if (layer) {
        let docHtml = '';
        try { docHtml = await getDocument(WB_TOOL_ID, safeFileId, annotationId) || ''; } catch (e) { /* 忽略 */ }
        // 🚨 R2 删除顺序严格对齐 BaseMapTool.vue 的 handleSoftDeleteLayer：
        //   ① moveToRecycleBin（先留档，失败也不至于丢数据）
        //   ② deleteDocument（从 documents 表显式删除富文本）
        //   ③ unregisterFingerprints（从 fingerprints 表显式释放指纹，不能只靠后面 saveAllLayers 数量变少）
        // 注：本循环内不能直接 saveAllLayers，故统一放在循环外的 ④
        try { await moveToRecycleBin(WB_TOOL_ID, safeFileId, layer, docHtml); } catch (e) { /* 忽略 */ }
        try { await deleteDocument(WB_TOOL_ID, safeFileId, annotationId); } catch (e) { /* 忽略 */ }
        try { await unregisterFingerprints(WB_TOOL_ID, [layer]); } catch (e) { /* 忽略 */ }
        removedIds.add(annotationId);
        result.removed.push(annotationId);
      }
      idMap.removeByElement(elementId);
    }
    // ④ 从 annotations 表移除已软删除记录（与上面三步共同构成完整删除）
    if (removedIds.size > 0) {
      await saveAllLayers(WB_TOOL_ID, safeFileId, all.filter(l => !removedIds.has(l.id)));
      console.log(`[elementSync] 白板元素软删除完成：${removedIds.size} 个（回收站/富文本/指纹/图形表已同步清理）`);
    }
  }


  // ---------- 2. 新增 / 更新分流 ----------
  const existing = await getAllLayers(WB_TOOL_ID, safeFileId) || [];
  const existingById = new Map(existing.map(l => [l.id, l]));

  const toAppend = [];
  const updates = [];
  const docs = [];
  const fpEntries = [];

  for (const element of list) {
    if (!element || element.isDeleted) continue;

    const name = getElementName(element);
    const annotationId = idMap.getAnnotationId(element.id);

    // 已登记：只同步坐标 / 名称（画布上拖动图形，地理坐标必须跟着走）
    if (annotationId) {
      const prev = existingById.get(annotationId);
      if (!prev) {
        // 记录已被信息数据库删除 → 解除映射，落到下面新增分支
        idMap.removeByElement(element.id);
      } else {
        const anchor = getElementAnchor(element);
        const geo = (boundsOk && canvasOk) ? canvasToLatLng(anchor, bounds, canvas) : null;
        const geometry = getElementGeometry(element);
        const moved = geo && (Math.abs(geo.lat - prev.lat) > 1e-9 || Math.abs(geo.lng - prev.lng) > 1e-9);
        const renamed = !!name && name !== prev.objectName;
        const reshaped = geometry.wbW !== prev.wbW || geometry.wbH !== prev.wbH;

        if (moved || renamed || reshaped) {
          const next = {
            ...prev,
            title: name || prev.title,
            objectName: name || prev.objectName,
            wbX: geometry.wbX,
            wbY: geometry.wbY,
            wbW: geometry.wbW,
            wbH: geometry.wbH
          };
          if (geo) {
            next.lat = geo.lat;
            next.lng = geo.lng;
            next.coords = [[geo.lat, geo.lng]];
          }
          if (moved || renamed) {
            // 坐标或名称变了 → 指纹随之改变：注销旧的、登记新的
            try { await unregisterFingerprints(WB_TOOL_ID, [prev]); } catch (e) { /* 忽略 */ }
            const fp = buildFingerprint(next);
            if (isValidFingerprint(fp)) {
              next.fingerprint = fp;
              fpEntries.push({ fp, annotationId: next.id, fileId: safeFileId, group: next.group });
            } else {
              delete next.fingerprint;
            }
          }
          updates.push(next);
          result.updated++;
        }
        continue;
      }
    }

    // 未登记：必须「有名称 + 坐标换算成功」才入库，否则算未登记图形（跳过）
    if (!autoRegister) continue;
    if (!boundsOk || !canvasOk || !name) { result.skipped++; continue; }

    const geo = canvasToLatLng(getElementAnchor(element), bounds, canvas);
    if (!geo) { result.skipped++; continue; }

    const group = getElementGroup(element);
    const candidate = buildAnnotation({
      element, annotationId: '__pending__', fileId: safeFileId, bounds, canvas, group, name
    });
    const fp = buildFingerprint(candidate);
    if (!isValidFingerprint(fp)) { result.skipped++; continue; }

    toAppend.push({ element, name, group, fp });
  }


  // ---------- 3. 指纹去重：只对本批新元素查一次（避免逐个查询） ----------
  if (toAppend.length > 0) {
    let existingFp = new Set();
    try {
      existingFp = await findExistingFingerprints(WB_TOOL_ID, toAppend.map(t => t.fp));
    } catch (e) {
      console.warn('[elementSync] 指纹查询失败，本批按新元素处理:', e);
    }

    const finalNew = toAppend.filter(t => !existingFp.has(t.fp));
    result.skipped += toAppend.length - finalNew.length;

    if (finalNew.length > 0) {
      // 一次预留 N 个图形编号（WB.00001 递增）
      const { values: seqs } = await reserveSequence(WB_TOOL_ID, 'graphic', finalNew.length);
      const layers = [];
      finalNew.forEach((t, i) => {
        const annotationId = formatGraphicId(WB_TOOL_ID, seqs[i]);
        const layer = buildAnnotation({
          element: t.element, annotationId, fileId: safeFileId, bounds, canvas,
          group: t.group, name: t.name
        });
        layer.fingerprint = t.fp;
        layers.push(layer);
        docs.push({ annotationId, docHtml: buildDefaultDocHtml(t.element, t.name) });
        fpEntries.push({ fp: t.fp, annotationId, fileId: safeFileId, group: t.group });
        idMap.set(t.element.id, annotationId);
        result.registered++;
      });

      try {
        // 追加写入该文件区的图形集合（内部会兜底同步一次指纹索引）
        await appendLayers(WB_TOOL_ID, safeFileId, layers);
      } catch (e) {
        console.error('[elementSync] 写入白板元素失败:', e);
      }
    }
  }

  // ---------- 4. 富文本：只给新元素补默认文档，绝不覆盖用户已写内容 ----------
  for (const doc of docs) {
    try {
      const old = await getDocument(WB_TOOL_ID, safeFileId, doc.annotationId);
      if (!old) await saveDocument(WB_TOOL_ID, safeFileId, doc.annotationId, doc.docHtml);
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 5. 回写既有记录的坐标 / 名称变化 ----------
  if (updates.length > 0) {
    try {
      const map = new Map(existing.map(l => [l.id, l]));
      updates.forEach(u => map.set(u.id, u));
      await saveAllLayers(WB_TOOL_ID, safeFileId, Array.from(map.values()));
    } catch (e) {
      console.error('[elementSync] 更新白板元素失败:', e);
    }
  }

  // ---------- 6. 补登指纹（幂等） ----------
  if (fpEntries.length > 0) {
    try { await registerFingerprints(WB_TOOL_ID, fpEntries); } catch (e) { /* 忽略 */ }
  }

  return result;
};

/**
 * 手动为单个元素补登记（UI 引导用户命名后调用）
 */
export const registerElement = async ({
  element, idMap, bounds, canvas, fileId = 'legacy-file', name, group
}) => {
  if (!element || !idMap || !isValidBounds(bounds) || !isValidCanvas(canvas)) return null;
  const finalName = String(name || getElementName(element) || '').trim();
  if (!finalName) return null;
  const geo = canvasToLatLng(getElementAnchor(element), bounds, canvas);
  if (!geo) return null;

  const safeFileId = fileId || 'legacy-file';
  const { values } = await reserveSequence(WB_TOOL_ID, 'graphic', 1);
  const annotationId = formatGraphicId(WB_TOOL_ID, values[0]);

  const layer = buildAnnotation({
    element, annotationId, fileId: safeFileId, bounds, canvas,
    group: group || getElementGroup(element),
    name: finalName
  });
  const fp = buildFingerprint(layer);
  if (!isValidFingerprint(fp)) return null;
  layer.fingerprint = fp;

  try {
    await appendLayers(WB_TOOL_ID, safeFileId, [layer]);
    await saveDocument(WB_TOOL_ID, safeFileId, annotationId, buildDefaultDocHtml(element, finalName));
    await registerFingerprints(WB_TOOL_ID, [{ fp, annotationId, fileId: safeFileId, group: layer.group }]);
  } catch (e) {
    console.error('[elementSync] 手动登记元素失败:', e);
    return null;
  }

  idMap.set(element.id, annotationId);
  return layer;
};

// 读取某文件区下白板已登记的全部元素（供信息栏 / 详情面板使用）
export const getRegisteredElements = async (fileId = 'legacy-file') => {
  try {
    return await getAllLayers(WB_TOOL_ID, fileId || 'legacy-file') || [];
  } catch (e) {
    console.warn('[elementSync] 读取白板元素失败:', e);
    return [];
  }
};
