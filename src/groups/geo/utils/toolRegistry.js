// src/groups/geo/utils/toolRegistry.js
// 🚨 Phase 2a：工具前缀码 + 库名 + 元数据注册表

// 工具前缀码（用于编号 CM.00001 / CC.00042 等）
export const TOOL_PREFIX = {
  'geo-custom-canvas': 'CC',
  'geo-china-map': 'CM',
  'geo-world-map': 'WM',
  'geo-china-standard-map': 'CS',
  'geo-province-map': 'PM',
  'geo-eagle-eye': 'EH'
};

// 工具元数据
export const TOOL_META = {
  'geo-custom-canvas':      { name: '自定义地图+自由标记', dbName: 'LiangJian_Tool_CC', prefix: 'CC' },
  'geo-china-map':          { name: '中国卫星地图',       dbName: 'LiangJian_Tool_CM', prefix: 'CM' },
  'geo-world-map':          { name: '世界卫星地图',       dbName: 'LiangJian_Tool_WM', prefix: 'WM' },
  'geo-china-standard-map': { name: '中国标准地图',       dbName: 'LiangJian_Tool_CS', prefix: 'CS' },
  'geo-province-map':       { name: '中国省级行政区',     dbName: 'LiangJian_Tool_PM', prefix: 'PM' },
  'geo-eagle-eye':          { name: '鹰眼公共平台',       dbName: 'LiangJian_Tool_EH', prefix: 'EH' }
};

// 按库存 Tab 顺序排列（后续 UI 依赖此顺序）
export const TOOL_ORDER = [
  'geo-custom-canvas',
  'geo-china-map',
  'geo-world-map',
  'geo-china-standard-map',
  'geo-province-map',
  'geo-eagle-eye'
];

// 每个工具库的版本号（每次表结构变更 +1）
export const TOOL_DB_VERSION = 1;

// 每个工具库的表结构（5 张表）
export const TOOL_STORES = [
  { name: 'annotations', keyPath: 'id' },
  { name: 'documents',   keyPath: 'id' },
  { name: 'projects',    keyPath: 'projId',
    indexes: [{ name: 'createdAt', keyPath: 'createdAt' }] },
  { name: 'meta',        keyPath: 'key' },
  { name: 'assets',      keyPath: 'assetId',
    indexes: [{ name: 'createdAt', keyPath: 'createdAt' }] }
];

// 生成带前缀的图形编号： CM.00001
export const formatGraphicId = (toolId, seq) => {
  const prefix = TOOL_PREFIX[toolId] || 'XX';
  return `${prefix}.${String(seq).padStart(5, '0')}`;
};

// 生成带前缀的分组编号： CM-G.00001
export const formatGroupId = (toolId, seq) => {
  const prefix = TOOL_PREFIX[toolId] || 'XX';
  return `${prefix}-G.${String(seq).padStart(5, '0')}`;
};

// 🚨 新增：生成带前缀的文件编号： CM-F.00001
export const formatFileId = (toolId, seq) => {
  const prefix = TOOL_PREFIX[toolId] || 'XX';
  return `${prefix}-F.${String(seq).padStart(5, '0')}`;
};

// 🚨 修改：生成工程编号（基于文件编号 + 时间戳）
export const formatProjectId = (toolId, fileId) => {
  return `${fileId}_P.${Date.now()}`;
};