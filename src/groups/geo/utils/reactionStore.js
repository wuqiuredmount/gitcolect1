// src/groups/geo/utils/reactionStore.js
// 👍 图形「附带数据」通用容器（点赞 / 倒赞是它的第一个使用者）
//
// 【为什么复用 meta 表而不新建表】
//   toolRegistry.js:41-46 明确规定：6 个地理工具库（CC/CM/WM/CS/PM/EH）永久停在 v3，
//   新增表结构只能按库分支推进。新建 objectStore 必须 bump 版本号 → 会波及 6 个老库，
//   违反该约束。故复用已存在的 meta 表（keyPath: 'key'），零版本变更、零迁移风险。
//
// 【身份编码】
//   key = `graphic:${fileId}_${annotationId}`
//   —— 与 documents 表完全同源（documentStore.js:20 `${fileId}_${annotationId}`），
//      因此天然与「图形身份编码」捆绑：地图侧 annotationId = EH.00001，
//      白板侧 annotationId = WB.00012，两者互不干扰。
//
// 【为什么要做成「通用容器」而不是只存赞】
//   用户要求「保持数据之后依然易于捆绑其他功能的附带数据」。
//   本记录结构为 { key, fileId, annotationId, reactions, ...future }，
//   后续任何新功能（收藏、浏览数、评分、标签…）只需往同一条记录里加字段，
//   不需要再开新 key、不需要改表结构。reactions 只是当前唯一的字段。
//
// 【写入语义：读-改-写】
//   meta 表 put 是整条覆盖，故必须先读旧记录再合并写回，
//   否则会清掉 future 字段（这正是「通用容器」必须的写法）。

import { getFromToolDB, putToToolDB, deleteFromToolDB } from './toolDB';
import { ensureToolMigrated } from './migrationManager';

// 图形附带数据的 key 生成（对外暴露，便于其他功能复用同一约定）
export const graphicExtraKey = (fileId, annotationId) => `graphic:${fileId}_${annotationId}`;

// 反应类型白名单
const REACTION_TYPES = ['like', 'dislike'];

// 读取某图形的全部附带数据（无记录时返回空壳）
export const getGraphicExtra = async (toolId, fileId, annotationId) => {
  if (!toolId || !fileId || !annotationId) return null;
  await ensureToolMigrated(toolId);
  const rec = await getFromToolDB(toolId, 'meta', graphicExtraKey(fileId, annotationId));
  return rec || null;
};

// 读取点赞 / 倒赞计数（永远返回 { like, dislike } 两个数字）
export const getReactions = async (toolId, fileId, annotationId) => {
  const rec = await getGraphicExtra(toolId, fileId, annotationId);
  const r = (rec && rec.reactions) || {};
  return {
    like: Number(r.like) || 0,
    dislike: Number(r.dislike) || 0
  };
};

// 合并写入：把 patch 合进该图形的附带数据记录（读-改-写，保护其他字段）
// patch 形如 { reactions: {...} } 或未来的任意新字段
export const mergeGraphicExtra = async (toolId, fileId, annotationId, patch) => {
  if (!toolId || !fileId || !annotationId || !patch || typeof patch !== 'object') return null;
  await ensureToolMigrated(toolId);

  const key = graphicExtraKey(fileId, annotationId);
  const prev = (await getFromToolDB(toolId, 'meta', key)) || {};

  const next = {
    ...prev,
    ...patch,
    // 身份三件套恒定，防止 patch 意外覆盖
    key,
    fileId,
    annotationId,
    updatedAt: Date.now()
  };

  await putToToolDB(toolId, 'meta', next);
  return next;
};

// 给某个反应 +1（type: 'like' | 'dislike'），返回新的 { like, dislike }
export const bumpReaction = async (toolId, fileId, annotationId, type) => {
  if (!REACTION_TYPES.includes(type)) {
    console.warn('[bumpReaction] 未知反应类型:', type);
    return null;
  }
  if (!toolId || !fileId || !annotationId) return null;

  await ensureToolMigrated(toolId);
  const key = graphicExtraKey(fileId, annotationId);
  const prev = (await getFromToolDB(toolId, 'meta', key)) || {};

  const reactions = { like: 0, dislike: 0, ...(prev.reactions || {}) };
  reactions[type] = (Number(reactions[type]) || 0) + 1;

  const next = {
    ...prev,
    key,
    fileId,
    annotationId,
    reactions,
    updatedAt: Date.now()
  };

  await putToToolDB(toolId, 'meta', next);
  return reactions;
};

// 删除某图形的附带数据（供图形删除时清理，可选调用）
export const deleteGraphicExtra = async (toolId, fileId, annotationId) => {
  if (!toolId || !fileId || !annotationId) return;
  await ensureToolMigrated(toolId);
  await deleteFromToolDB(toolId, 'meta', graphicExtraKey(fileId, annotationId));
};
