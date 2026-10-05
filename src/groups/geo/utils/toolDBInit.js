// src/groups/geo/utils/toolDBInit.js
// 🚨 Phase 2a：首次创建工具库时，写入出厂默认配置到 meta 表
import { TOOL_ORDER } from './toolRegistry';
import { TOOL_DEFAULTS } from './toolDefaults';
import { openToolDB, getFromToolDB, putToToolDB } from './toolDB';

// 确保指定工具的 meta 表有出厂配置
const seedToolMeta = async (toolId) => {
  const defaults = TOOL_DEFAULTS[toolId];
  if (!defaults) return;

  // 读取现有的 baseLayerConfig
  const existing = await getFromToolDB(toolId, 'meta', 'baseLayerConfig');
  if (existing) return; // 已有配置，不覆盖

  // 写入出厂配置
  await putToToolDB(toolId, 'meta', { key: 'baseLayerConfig', value: defaults.baseLayerConfig });
  await putToToolDB(toolId, 'meta', { key: 'initialView', value: defaults.initialView });
  console.log(`[toolDBInit] ${toolId} 出厂配置已写入`);
};

// 播种所有工具
export const seedAllToolMeta = async () => {
  for (const toolId of TOOL_ORDER) {
    try {
      await seedToolMeta(toolId);
    } catch (e) {
      console.warn(`[toolDBInit] ${toolId} 播种失败:`, e);
    }
  }
  console.log('[toolDBInit] 所有工具出厂配置播种完成');
};