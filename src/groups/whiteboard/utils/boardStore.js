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
export const saveBoard = async (board) => {
  if (!board || !board.boardId) return;
  await ensureToolMigrated(WB_TOOL_ID);
  const now = Date.now();
  const existing = await getBoard(board.boardId);
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
