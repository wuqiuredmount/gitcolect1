// src/groups/geo/utils/aiDataCommand.js
// 🚨 AI 数据指令执行器
// 让 AI 通过标准指令文件，对数据执行：删除 / 读取回收站 / 恢复 / 彻底删除 / 查权限
// 指令由 AI 通过 webcode 写入 public/ai-import/commands/，应用读取后执行。
//
// 🔒 权限约束（本次新增）：
//   - 破坏性指令（delete / purge）只能作用于「已授权给 AI 的分组」
//   - 授权名单由用户在「图形列表 → 探索和编辑分组」窗口逐组开启（🤖 按钮）
//   - 名单存放于 localStorage['geo_group_ai_delete_perms']
//   - 未授权的分组一律跳过，并在结果中回报，避免 AI 误删重要数据
//   - 名单为空 = 全部未授权 = AI 一条都删不了（最安全默认）

import { getAllLayers, saveAllLayers, appendLayers } from './annotationStore';
import { getDocument, deleteDocument, saveDocument } from './documentStore';
import { moveToRecycleBin, getAllRecycled, purgeFromRecycleBin, getRecycled } from './recycleStore';
import { TOOL_META, TOOL_ORDER } from './toolRegistry';

// ==================== 🔒 AI 删除权限 ====================

// 与 LayerListPanel.vue 的 AI_PERM_KEY 保持一致
const AI_PERM_KEY = 'geo_group_ai_delete_perms';

/**
 * 读取当前已授权给 AI 的分组名单
 * @returns {string[]}
 */
export const getAiAllowedGroups = () => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(AI_PERM_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (e) {
    console.warn('[aiDataCommand] 读取 AI 权限名单失败:', e);
    return [];
  }
};

/**
 * 判断某个分组是否已授权给 AI
 */
const isGroupAllowed = (group, allowedList) => {
  const g = (group && String(group).trim()) || '默认';
  return allowedList.includes(g);
};

/**
 * 按权限把目标图层分成「允许」与「被拒」两组
 * @param {Array} layers
 * @param {string[]} allowedList
 * @returns {{ permitted: Array, denied: Array<{name:string, group:string}> }}
 */
const splitByPermission = (layers, allowedList) => {
  const permitted = [];
  const denied = [];
  (layers || []).forEach(l => {
    const g = (l && l.group) || '默认';
    if (isGroupAllowed(g, allowedList)) {
      permitted.push(l);
    } else {
      denied.push({
        name: (l && (l.objectName || l.title || l.id)) || '未命名',
        group: g
      });
    }
  });
  return { permitted, denied };
};

// 汇总被拒信息，便于统一回报
const buildDeniedReport = (denied) => ({
  deniedCount: denied.length,
  deniedGroups: Array.from(new Set(denied.map(d => d.group))),
  deniedNames: denied.map(d => d.name)
});

// ==================== 目标匹配 ====================

// 匹配目标图层：支持 ids 精确匹配、nameKeyword 关键词匹配、group 分组匹配
// 🚨 group 匹配为 2026-10-06 追加能力，用于「删除整个分组」场景；不影响既有逻辑
const matchLayers = (layers, target) => {
  if (!target) return [];
  const ids = Array.isArray(target.ids) ? target.ids : [];
  const kw = (target.nameKeyword || '').trim();
  const grp = (target.group || '').trim();

  return layers.filter(l => {
    if (ids.length > 0 && ids.includes(l.id)) return true;
    if (kw) {
      const name = (l.objectName || l.title || '').toString();
      if (name.includes(kw)) return true;
    }
    if (grp && ((l.group || '默认') === grp)) return true;
    return false;
  });
};

// ==================== 指令实现 ====================

// 执行删除指令：把匹配到且「已授权」的图层移入回收站
const cmdDelete = async (command) => {
  const toolId = command.toolId;
  if (!toolId) throw new Error('删除指令缺少 toolId');

  const layers = await getAllLayers(toolId);
  const matched = matchLayers(layers, command.target);
  if (matched.length === 0) {
    return { affected: 0, names: [], deniedCount: 0, deniedGroups: [], deniedNames: [] };
  }

  // 🔒 权限过滤：仅保留已授权分组的数据
  const allowedList = getAiAllowedGroups();
  const { permitted, denied } = splitByPermission(matched, allowedList);
  const deniedReport = buildDeniedReport(denied);

  // 全部被拒：不做任何删除，直接回报
  if (permitted.length === 0) {
    return { affected: 0, names: [], ...deniedReport };
  }

  const names = [];
  for (const layer of permitted) {
    const fileId = layer.fileId || 'legacy-file';
    const docHtml = await getDocument(toolId, fileId, layer.id) || layer.docHtml || '';
    await moveToRecycleBin(toolId, fileId, layer, docHtml);
    names.push(layer.objectName || layer.title || layer.id);
  }

  const matchedIds = new Set(permitted.map(l => l.id));
  const remain = layers.filter(l => !matchedIds.has(l.id));
  await saveAllLayers(
    toolId,
    command.target && command.target.fileId ? command.target.fileId : 'legacy-file',
    remain.filter(l => (command.target && command.target.fileId ? l.fileId === command.target.fileId : true))
  );

  return { affected: permitted.length, names, ...deniedReport };
};

// 执行读取回收站指令（只读，不受权限限制）
const cmdListRecycle = async (command) => {
  const toolId = command.toolId;
  const all = [];
  const toolIds = toolId ? [toolId] : TOOL_ORDER;
  for (const tid of toolIds) {
    const list = await getAllRecycled(tid);
    all.push(...list);
  }
  return {
    affected: all.length,
    items: all.map(r => ({
      id: r.annotationId,
      toolId: r.toolId,
      toolName: TOOL_META[r.toolId]?.name || r.toolId,
      name: (r.layer && (r.layer.objectName || r.layer.title)) || '未命名',
      group: (r.layer && r.layer.group) || '默认',
      deletedAt: r.deletedAt
    }))
  };
};

// 执行恢复指令：把匹配的回收站记录恢复到正式表（恢复是「建设性」操作，不受权限限制）
const cmdRestore = async (command) => {
  const toolIds = command.toolId ? [command.toolId] : TOOL_ORDER;
  const names = [];

  for (const tid of toolIds) {
    const list = await getAllRecycled(tid);
    const matched = list.filter(r => {
      const ids = Array.isArray(command.target?.ids) ? command.target.ids : [];
      const kw = (command.target?.nameKeyword || '').trim();
      if (ids.length > 0 && ids.includes(r.annotationId)) return true;
      if (kw) {
        const name = (r.layer && (r.layer.objectName || r.layer.title)) || '';
        if (name.includes(kw)) return true;
      }
      return false;
    });

    for (const r of matched) {
      await appendLayers(tid, r.fileId, [r.layer]);
      if (r.docHtml) await saveDocument(tid, r.fileId, r.annotationId, r.docHtml);
      await purgeFromRecycleBin(tid, r.fileId, r.annotationId);
      names.push((r.layer && (r.layer.objectName || r.layer.title)) || r.annotationId);
    }
  }

  return { affected: names.length, names };
};

// 执行彻底删除指令（不可恢复，同样受权限约束）
const cmdPurge = async (command) => {
  const toolIds = command.toolId ? [command.toolId] : TOOL_ORDER;
  const allowedList = getAiAllowedGroups();

  let count = 0;
  const names = [];
  const denied = [];

  for (const tid of toolIds) {
    const list = await getAllRecycled(tid);
    const matched = list.filter(r => {
      const ids = Array.isArray(command.target?.ids) ? command.target.ids : [];
      const kw = (command.target?.nameKeyword || '').trim();
      if (ids.length > 0 && ids.includes(r.annotationId)) return true;
      if (kw) {
        const name = (r.layer && (r.layer.objectName || r.layer.title)) || '';
        if (name.includes(kw)) return true;
      }
      return false;
    });

    for (const r of matched) {
      const g = (r.layer && r.layer.group) || '默认';
      // 🔒 权限校验：未授权分组不予彻底删除
      if (!isGroupAllowed(g, allowedList)) {
        denied.push({
          name: (r.layer && (r.layer.objectName || r.layer.title)) || r.annotationId,
          group: g
        });
        continue;
      }
      await purgeFromRecycleBin(tid, r.fileId, r.annotationId);
      names.push((r.layer && (r.layer.objectName || r.layer.title)) || r.annotationId);
      count++;
    }
  }

  return { affected: count, names, ...buildDeniedReport(denied) };
};

// 🚨 新增：查询当前 AI 删除权限名单（供 AI 在执行前自查）
const cmdListPerms = async () => {
  const groups = getAiAllowedGroups();
  return {
    affected: groups.length,
    groups,
    message: groups.length === 0
      ? 'AI 当前没有任何分组的删除权限，所有删除指令都会被拒绝。'
      : `AI 可删除以下分组的数据：${groups.join('、')}`
  };
};

/**
 * 执行一条 AI 数据指令
 * @param {object} command - { command, toolId, target: { ids, nameKeyword, fileId }, reason }
 *   command 取值：'delete' | 'list-recycle' | 'restore' | 'purge' | 'list-perms'
 */
export const executeDataCommand = async (command) => {
  if (!command || !command.command) throw new Error('指令格式错误：缺少 command 字段');
  switch (command.command) {
    case 'delete':       return await cmdDelete(command);
    case 'list-recycle': return await cmdListRecycle(command);
    case 'restore':      return await cmdRestore(command);
    case 'purge':        return await cmdPurge(command);
    case 'list-perms':   return await cmdListPerms(command);
    default: throw new Error('未知指令类型：' + command.command);
  }
};
