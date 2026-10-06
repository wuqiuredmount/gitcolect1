// src/groups/whiteboard/utils/elementSync.js
// 🖊️ 白板元素 ↔ 地图元素同等待遇同步层
//
// 职责：把 Excalidraw 场景里的图形注册成与地图图形完全一致的 annotation：
//   编号（WB.00001）/ 指纹去重 / 富文本 documents / 软删除 recyclebin / 信息数据库可见
//
// 关键约束（不得更改）：
//   1. 不改指纹算法（fingerprint.js 保持 v4，buildFingerprint 一行不动）
//   2. 白板元素 type 一律加 `wb-` 前缀（wb-rectangle 等），与地图元素指纹天然隔离
//   3. 🖊️ 全登记：所有未删除元素都入库，不论有没有自定义名称。
//      无 customData.name 时用 element.id 作为兜底名称参与指纹计算（指纹算法本身不动）。
//      唯一不入库的情况：坐标换算失败（bounds/canvas 缺失或非法）。
//   4. 本文件只处理元素级差异，场景整体由 boardStore 负责

import { appendLayers, getAllLayers, saveAllLayers } from '../../geo/utils/annotationStore.js';
import { saveDocument, getDocument, deleteDocument } from '../../geo/utils/documentStore.js';
import { moveToRecycleBin } from '../../geo/utils/recycleStore.js';
import { reserveSequence } from '../../geo/utils/systemStore.js';
import { formatGraphicId } from '../../geo/utils/toolRegistry.js';
import { buildFingerprint, isValidFingerprint } from '../../geo/utils/fingerprint.js';
import { findExistingFingerprints, registerFingerprints, unregisterFingerprints } from '../../geo/utils/fingerprintStore.js';
import { canvasToLatLng, getElementAnchor, getElementGeometry, isValidBounds, isValidCanvas, latLngToCanvas } from './coordinate.js';
// 🚨 T1：恢复时需读写白板场景。此处用静态 import（原为动态 import），
//    因为 coordinate.js / boardStore.js 早已被本文件与 WhiteboardTool 静态引用，
//    动态 import 不产生分块收益，反而会触发 Vite 的 INEFFECTIVE_DYNAMIC_IMPORT 警告。
import { getBoard, saveBoard, getAllBoards, WB_LEGACY_BOARD_ID } from './boardStore.js';

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

// 🚨 【R4 实测结论】@excalidraw/excalidraw@0.18.1 中 scrollConstraints **完全不存在**：
//    - 类型声明（dist/types/excalidraw/types.d.ts）0 处
//    - 构建产物（dist/prod/*.js）0 处
//    → 「用 initialData.appState.scrollConstraints 锁死画布」的方案在本版本不可行，放弃。
// 本版本可用的平移/缩放相关入口只有三个（实测确认）：
//    - Props.viewModeEnabled?: boolean     —— 只读模式，禁用一切编辑（代价：连画图也禁了）
//    - Props.onScrollChange?: (x,y,zoom)   —— 只读回调，不能阻止平移
//    - api.onScrollChange(cb): Unsubscribe —— 只读订阅，不能阻止平移
// 且 Excalidraw 会把滚动钳制在「内容包围盒」内，scrollX/scrollY 无法被程序固定为常数。
// 【本版本采用方案】读时归一化：不做任何强制锁定，而是在换算坐标时扣掉画布视口变换，
//    用「世界坐标」而非「屏幕坐标」参与 lat/lng 计算。这样无论用户怎么平移/缩放，
//    元素的 lat/lng 与其指纹都稳定不变（R4 验收标准达成）。
//    ⚠️ 与 coordinate.js 文件头注释的超集约定一致：一旦放开平移，
//       必须在此处补 scrollX/scrollY/zoom 变换，勿用简化近似。

// ---------- 世界坐标提取（R4 读时归一化核心）----------
// Excalidraw 语义：屏幕坐标 = 世界坐标 * zoom + scroll
//   screenX = element.x * zoom + scrollX
// element.x 即「世界坐标」（与视图平移无关，这正是我们要的稳定量）。
// panning 只改 appState.scrollX，不改 element.x，所以直接用 element.x/y 即天然归一化。
export const toWorldPoint = (element) => {
  if (!element) return null;
  const x = Number(element.x);
  const y = Number(element.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

// 反向：世界坐标 → 屏幕坐标（需要把点定位进当前视口时用，如 scrollToElement 兜底换算）
export const worldToScreen = (point, appState) => {
  if (!point) return null;
  const scrollX = Number(appState && appState.scrollX) || 0;
  const scrollY = Number(appState && appState.scrollY) || 0;
  const zoom = Number(appState && appState.zoom && appState.zoom.value) || 1;
  return { x: point.x * zoom + scrollX, y: point.y * zoom + scrollY };
};

export const getFallbackName = (element) =>
  String((element && element.id) || '').trim();

// 元素名称来源：约定写在 customData.name（兼容 customData.title）；
// 🖊️ 全登记路线：没有自定义名称时返回 element.id，保证「无名元素」也能拿到有效指纹入库。
//    注意：调用方若需要「区分原名 / 兜底名」，请另外调 getCustomName 判断。
export const getElementName = (element) => {
  if (!element) return '';
  const cd = element.customData || {};
  const raw = cd.name || cd.title || '';
  const trimmed = String(raw).trim();
  if (trimmed) return trimmed;
  return getFallbackName(element);
};

// 仅取用户显式填写的名称（不含 element.id 兜底），用于判断是否需要在 UI 引导用户命名
export const getCustomName = (element) => {
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

// 判定元素是否「可登记」：只要有 id（兜底名称）且坐标换算成功即可登记。
// 🖊️ 全登记路线：不再要求必须有自定义名称——无名元素的指纹用 element.id 参与计算。
//    唯一排除项：已软删除、无法换算坐标（bounds/canvas 缺失或非法）的元素。
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
 * @param {boolean} [opts.allowDelete=true]  - 🚨【防御层 2】是否允许执行「删除分支」。
 *   调用方在画布尚未就绪（首帧空场景 / setScene 未完成）时必须传 false，
 *   否则 aliveIds 为空集 → idMap 全部命中 → 误把已登记元素批量软删除进回收站。
 * @returns {Promise<{registered:number, skipped:number, removed:string[], updated:number}>}
 */
export const syncScene = async ({
  elements,
  idMap,
  bounds,
  canvas,
  fileId = 'legacy-file',
  autoRegister = true,
  allowDelete = true
}) => {
  const result = { registered: 0, skipped: 0, removed: [], updated: 0 };
  if (!idMap) return result;

  const list = Array.isArray(elements) ? elements : [];
  const boundsOk = isValidBounds(bounds);
  const canvasOk = isValidCanvas(canvas);
  const safeFileId = fileId || 'legacy-file';

  // ---------- 1. 已删除元素：进回收站 + 清富文本 + 注销指纹 ----------
  // 🚨【防御层 2】整块删除逻辑受 allowDelete 门控。
  //   本段是纯「集合差」判定：aliveIds 为空（空场景/首帧）时 idMap 中每个 id
  //   都会被判为「已消失」→ 全量软删除。画布未就绪时调用方必须传 allowDelete:false。
  //   ⚠️ 若后续仍误删，第一嫌疑是 sanitizeElements 静默丢弃含循环引用的元素
  //      （excalidrawBridge.js:57-70），可先用 syncNow 手动同步对照验证。
  if (allowDelete) {
  const aliveIds = new Set(list.filter(e => e && !e.isDeleted).map(e => e.id));
  const deletedElementIds = [];
  idMap.byElement.forEach((annotationId, elementId) => {
    if (!aliveIds.has(elementId)) deletedElementIds.push(elementId);
  });

  if (deletedElementIds.length > 0) {
    const all = await getAllLayers(WB_TOOL_ID, safeFileId) || [];
    // 补丁①：scene 中仍能找到原始元素对象（Excalidraw 删除只是打 isDeleted 标记，
    //   元素本身还留在数组里）→ 逐 id 建立 element.id → 原始元素 的索引，
    //   随回收站一起深拷贝留档，供恢复时「精确还原」。
    const rawById = new Map();
    list.forEach(el => { if (el && el.id) rawById.set(el.id, el); });
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
        // 补丁②：第 5 个参数 = 原始 Excalidraw 元素深拷贝（带文字的框 → 恢复后文字不丢）
        try {
          await moveToRecycleBin(WB_TOOL_ID, safeFileId, layer, docHtml, rawById.get(elementId) || null);
        } catch (e) { /* 忽略 */ }
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
  } // 🚨【防御层 2】end if (allowDelete)


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
        // 🖊️ 全登记后 name 恒非空（无名元素取 element.id），这里直接比较即可；
        //    prev.objectName 存的也是同一套兜底值，语义一致。
        const renamed = name !== prev.objectName;
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

    // 未登记：只要坐标换算成功就入库（🖊️ 全登记：无名元素用 element.id 兜底）
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
  // 🖊️ 全登记：名称缺省时用 element.id 兜底（与 syncScene 保持一致）
  const finalName = String(name || getElementName(element) || getFallbackName(element) || '').trim();
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

/**
 * 把「已恢复的 wbElementId 集合」同步回白板场景：
 *   - 元素在 scene 中且 isDeleted=true → 擦除标记（精确还原，最理想）
 *   - 元素在 scene 中且已正常      → 无需处理
 *   - 元素不在 scene 中            → 用 wbElementRaw 补回，否则按坐标近似重建
 *
 * @param {string} boardId                - 白板编号（WB-B.00001）
 * @param {Array<string>} wbElementIds    - 已恢复元素的 Excalidraw element.id 列表
 * @param {object} [opts]
 * @param {Map<string,object>} [opts.rawMap] - wbElementId → 原始元素（来自 wbElementRaw）
 * @param {object} [opts.bounds]          - 近似重建用地理范围
 * @param {object} [opts.canvas]          - 近似重建用画布基准尺寸
 * @returns {Promise<{revived:number, rebuilt:number, missing:string[], scene:Array}>}
 */
export const restoreElementsToBoard = async (boardId, wbElementIds, opts = {}) => {
  const result = { revived: 0, rebuilt: 0, missing: [], scene: [] };
  if (!boardId || !Array.isArray(wbElementIds) || wbElementIds.length === 0) return result;

  const board = await getBoard(boardId);
  if (!board) {
    result.missing = wbElementIds.slice();
    return result;
  }

  const scene = Array.isArray(board.scene) ? board.scene.slice() : [];
  const indexById = new Map();
  scene.forEach((el, i) => { if (el && el.id) indexById.set(el.id, i); });

  const rawMap = opts.rawMap || new Map();
  const canRebuild = isValidBounds(opts.bounds) && isValidCanvas(opts.canvas);

  for (const elementId of wbElementIds) {
    if (!elementId) continue;
    const idx = indexById.get(elementId);

    // 情况 1：元素还在 scene 里（只是挂着 isDeleted）→ 擦除标记即可精确还原
    //        这是 T1 的关键：不重建、不丢文字、不改宽高样式
    if (idx !== undefined) {
      const el = scene[idx];
      if (el && el.isDeleted) {
        scene[idx] = { ...el, isDeleted: false, updated: Date.now() };
        result.revived++;
      }
      continue;
    }

    // 情况 2：元素已不在 scene（极端情况：用户删除后清过画布 / 换了白板）
    //        优先用 wbElementRaw 精确补回；没有 raw 才降级近似重建
    const raw = rawMap.get(elementId);
    if (raw && raw.id === elementId) {
      // 补丁：wbElementRaw 是删除时的完整深拷贝 → 原样塞回，文字/样式/宽高全保留
      scene.push({ ...raw, isDeleted: false, updated: Date.now() });
      indexById.set(elementId, scene.length - 1);
      result.rebuilt++;
      continue;
    }

    result.missing.push(elementId);
  }

  result.scene = scene;
  result._canRebuild = canRebuild;
  result._board = board;
  return await finalizeRestore(board, scene, result, opts, canRebuild);
};

// 收尾：兜底近似重建（降级路径）+ 落库
const finalizeRestore = async (board, scene, result, opts, canRebuild) => {
  if (result.missing.length > 0 && canRebuild) {
    const layers = await getAllLayers(WB_TOOL_ID, board.fileId || 'legacy-file') || [];
    const rest = [];
    for (const elementId of result.missing) {
      const layer = layers.find(l => l.wbElementId === elementId);
      if (!layer || !Number.isFinite(Number(layer.lat)) || !Number.isFinite(Number(layer.lng))) {
        rest.push(elementId);
        continue;
      }
      const pt = latLngToCanvas({ lat: layer.lat, lng: layer.lng }, opts.bounds, opts.canvas);
      if (!pt) { rest.push(elementId); continue; }
      // 近似重建：几何可恢复，**文字内容无法恢复**（这正是补丁 wbElementRaw 要解决的痛点）
      scene.push({
        id: elementId,
        type: String(layer.wbType || 'rectangle'),
        x: pt.x,
        y: pt.y,
        width: Number(layer.wbW) || 100,
        height: Number(layer.wbH) || 60,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        customData: {
          ...(layer.customData || {}),
          name: layer.objectName || layer.title,
          _rebuiltFrom: 'coordinate'
        }
      });
      result.rebuilt++;
    }
    result.missing = rest;
  }

  // 写回白板场景（只在真的改了东西时才写库，避免无意义 IO）
  if (result.revived > 0 || result.rebuilt > 0) {
    await saveBoard({
      boardId: board.boardId,
      fileId: board.fileId,
      name: board.name,
      bounds: board.bounds,
      canvas: board.canvas,
      appState: board.appState,
      scene
    });
  }

  result.scene = scene;
  delete result._canRebuild;
  delete result._board;
  return result;
};

/**
 * 便捷封装：给定一批已恢复的回收站记录，批量还原其画布元素
 * @param {Array<object>} recycleRecords - 回收站记录数组（含 layer.wbElementId / wbElementRaw）
 * @param {object} [opts] - { boardId, bounds, canvas }
 * @returns {Promise<{revived:number, rebuilt:number, missing:string[], scene:Array}>}
 */
export const restoreRecycledElements = async (recycleRecords, opts = {}) => {
  const list = Array.isArray(recycleRecords) ? recycleRecords : [];
  const ids = [];
  const rawMap = new Map();

  list.forEach(rec => {
    if (!rec) return;
    const layer = rec.layer || {};
    const elementId = layer.wbElementId;
    if (!elementId) return;
    ids.push(elementId);
    // 补丁字段：删除时深拷贝的完整原始元素（老记录没有 → 走近似重建降级）
    if (rec.wbElementRaw && rec.wbElementRaw.id === elementId) {
      rawMap.set(elementId, rec.wbElementRaw);
    }
  });

  if (ids.length === 0) return { revived: 0, rebuilt: 0, missing: [], scene: [] };

  const boards = await getAllBoards();
  const boardId = opts.boardId || (boards[0] && boards[0].boardId) || WB_LEGACY_BOARD_ID;

  return await restoreElementsToBoard(boardId, ids, {
    rawMap,
    bounds: opts.bounds,
    canvas: opts.canvas
  });
};

export const getRegisteredElements = async (fileId = 'legacy-file') => {
  try {
    return await getAllLayers(WB_TOOL_ID, fileId || 'legacy-file') || [];
  } catch (e) {
    console.warn('[elementSync] 读取白板元素失败:', e);
    return [];
  }
};

// ==========================================================================
// 🚨 T1【核心修复】回收站恢复 → 同步还原画布元素（解决「恢复后被自动删除第二遍」）
// ==========================================================================
//
// 【隐性循环成因】（修复前）
//   1. 白板删除元素：Excalidraw 把它标记 isDeleted=true，但**物理上仍留在 scene 数组里**，
//      同时 elementSync 把它从 annotations 表移除、写入回收站。
//   2. 用户点「恢复」：annotations 表加回了记录，但 **board.scene 里那枚元素仍是
//      isDeleted=true**（恢复流程压根没碰 scene）。
//   3. 下次 runSync 触发 syncScene：
//      - idMap（重启后由 rebuildIdMap 重建）已包含刚恢复的元素 → 进入删除分支
//      - aliveIds 由 `!e.isDeleted` 计算，该元素 isDeleted 仍为 true → 不在集合内
//      - 于是被判定为「已删除」，**第二次写进回收站并被移出 annotations**
//      → 表现为「恢复成功后刷一下就又没了」，且回收站出现重复记录。
//
// 【修复策略】恢复时把 scene 中对应元素的 isDeleted 擦除，使其重新进入 aliveIds。
//   本函数**只做最小改动**：仅在 isDeleted 为真时改写，不重建元素、不动其它字段。
// ==========================================================================

