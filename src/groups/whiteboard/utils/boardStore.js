// src/groups/whiteboard/utils/boardStore.js
// 🖊️ 白板场景存储层
//
// 存放位置：白板工具库 LiangJian_Tool_WB 的 whiteboard 表（toolRegistry v4 新增）
// 一条记录 = 一块白板：
//   { boardId, fileId, name, bounds, appState, scene, createdAt, updatedAt }
//
// 与地图侧的对应关系：
//   - 场景 JSON（scene）≈ 地图的 Leaflet 图形集合，用于还原画布
//   - 元素级数据（编号 / 指纹 / 富文本 / 回收站）走 annotations + documents + recyclebin
//     由 elementSync.js 负责同步，本文件只管「场景整体」。

import { getFromToolDB, putToToolDB, getAllFromToolDB, openToolDB } from '../../geo/utils/toolDB.js';
import { ensureToolMigrated } from '../../geo/utils/migrationManager.js';
import { reserveSequence } from '../../geo/utils/systemStore.js';

export const WB_TOOL_ID = 'wb-whiteboard';
export const WB_LEGACY_BOARD_ID = 'WB-legacy-board';

const STORE = 'whiteboard';

// 🚨 白板编号：用工具库的文件序号发号器，格式 WB-B.00001
//    复用 reserveSequence('file')，与地图工具的 WB-F.xxxxx 前缀不同，不会串号
export const makeBoardId = (seq) => `${'WB'}-B.${String(seq).padStart(5, '0')}`;

export const createBoardId = async () => {
  const { values } = await reserveSequence(WB_TOOL_ID, 'file', 1);
  return makeBoardId(values[0] || 1);
};

// 读取单块白板
export const getBoard = async (boardId) => {
  if (!boardId) return null;
  await ensureToolMigrated(WB_TOOL_ID);
  try {
    return await getFromToolDB(WB_TOOL_ID, STORE, boardId);
  } catch (e) {
    console.warn('[boardStore] 读取白板失败:', e);
    return null;
  }
};

// 列出全部白板（按更新时间倒序）
export const getAllBoards = async () => {
  await ensureToolMigrated(WB_TOOL_ID);
  try {
    const list = await getAllFromToolDB(WB_TOOL_ID, STORE) || [];
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.warn('[boardStore] 列出白板失败:', e);
    return [];
  }
};

// 保存（全量覆盖单块白板记录，单事务）
//
// 🛡️【缺陷 2 修复（2026-10-07）】乐观并发控制（opts.baseUpdatedAt）
//
// 【要解决的竞争】WhiteboardTool.onBeforeUnmount 会用「画布实时快照」整体覆盖 board.scene。
//   但它并不知道「库在它取快照之后是否已被别人改过」（例：回收站恢复 → setScene 期间
//   用户立刻切走工具）→ 旧快照回覆盖新数据 → 元素被回退成 isDeleted=true
//   → 下次 runSync 又把它写进回收站 → 脏数据再生。
//
// 【解法】调用方声明「我这份快照是基于哪个版本改的」（baseUpdatedAt），
//   本函数在写库前用 existing.updatedAt 做版本校验：
//     · 库版本 ≠ 基线 → 库已被别人更新 → **拒绝本次写入**，返回 { saved:false, reason:'stale' }
//     · 库版本 = 基线 → 正常写入
//
// 【为什么用 updatedAt 而不是「时间保护窗」】
//   updatedAt 是**客观的版本向量**（本函数本就 await getBoard() 读到了它），
//   不依赖任何时间常量 → 慢机器/慢磁盘同样正确。
//
// 【调用约定（必须遵守，否则会丢数据）】
//   · 乐观写（画布快照）→ **传** baseUpdatedAt，允话被拒
//   · 权威写（回收站恢复 / 清理工具 / 手动保存）→ **不传**（undefined）→ 强制覆盖
//     ⚠️ 不传 = 旧行为，故本改动**向后兼容**，其余调用方零修改。
//
// @param {object} board - 白板记录
// @param {object} [opts] - { baseUpdatedAt?: number } 仅乐观写传
// @returns {Promise<{saved:boolean, reason?:string, updatedAt?:number}>}
//   ⚠️ 返回值新增（旧调用方忽略返回值不受影响）
export const saveBoard = async (board, opts = {}) => {
  if (!board || !board.boardId) return { saved: false, reason: 'no-board-id' };
  await ensureToolMigrated(WB_TOOL_ID);
  const existing = await getBoard(board.boardId);

  // 🔒 乐观并发控制：仅当调用方显式声明基线时才校验（不传 = 强制写）
  if (opts.baseUpdatedAt !== undefined && existing) {
    if (existing.updatedAt !== opts.baseUpdatedAt) {
      // ⚠️ console.warn（非 debug）：这是「防丢数据」的安全哨兵，必须可见
      console.warn('[boardStore] 🛡️ 拒绝过期写入：库已被更新，本次快照作废',
        { baseUpdatedAt: opts.baseUpdatedAt, dbUpdatedAt: existing.updatedAt });
      return { saved: false, reason: 'stale', dbUpdatedAt: existing.updatedAt };
    }
  }

  // ⏱️【修订号必须严格单调递增】（2026-10-07 自查发现）
  //
  // 【为什么不能直接用 Date.now()】
  //   读取（getBoard）与写入（putToToolDB）是**两个独立的 await 事务，中间没有锁**。
  //   于是存在这个交错：
  //     A 读 → A 读时间戳
  //            B 读 → B 读时间戳
  //                   A 写（ts=100）
  //                   B 写（ts=100）→ 与 A 撞同一毫秒 → **CAS 静默失效**
  //   毫秒级分辨率在「恢复 + 立即切走」这类紧凑时序下**不够**：
  //   两次写入可能落在同一毫秒，导致「基线相同 = 版本相同」的误判。
  //
  // 【解法】修订号 = max(Date.now(), 库内修订号 + 1) → **同一毫秒内也严格递增**。
  //   仍保持「单调递增的大整数」语义，对调用方（比较相等性）完全透明。
  //   ⚠️ 不引入单独字段（复用 updatedAt）：旧数据没有该字段也不受影响，
  //     因为比较的是「本次调用方拿到的值」与「库里现值」，两者都来自同一处。
  const now = Math.max(Date.now(), ((existing && existing.updatedAt) || 0) + 1);
  const record = {
    boardId: board.boardId,
    fileId: board.fileId || 'legacy-file',
    name: board.name || (existing && existing.name) || '未命名白板',
    bounds: board.bounds || (existing && existing.bounds) || null,
    canvas: board.canvas || (existing && existing.canvas) || null,
    appState: board.appState || {},
    scene: Array.isArray(board.scene) ? board.scene : (board.scene || {}).elements || [],
    createdAt: (existing && existing.createdAt) || board.createdAt || now,
    updatedAt: now
  };
  // 深度净化：剥离任何不可序列化字段（Excalidraw 元素理论上已是纯 JSON）
  await putToToolDB(WB_TOOL_ID, STORE, JSON.parse(JSON.stringify(record)));
  return { saved: true, updatedAt: record.updatedAt };
};

// 删除单块白板（仅清场景，元素级数据由调用方决定是否走回收站）
export const deleteBoard = async (boardId) => {
  if (!boardId) return;
  await ensureToolMigrated(WB_TOOL_ID);
  const db = await openToolDB(WB_TOOL_ID);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(boardId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 读取/写入「默认白板」（首启无白板时自动创建，保证用户一进来就能画）
export const ensureDefaultBoard = async () => {
  const boards = await getAllBoards();
  if (boards.length > 0) return boards[0];

  const boardId = await createBoardId();
  const board = {
    boardId,
    fileId: 'legacy-file',
    name: '白板 1',
    bounds: null,
    canvas: null,
    appState: {},
    scene: []
  };
  await saveBoard(board);
  return await getBoard(boardId);
};
