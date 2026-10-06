// 临时脚本：核对 pin 版本与按库分版本/分表逻辑（验证后删除）
import { readFileSync } from 'node:fs';
import {
  TOOL_DB_VERSION, WB_DB_VERSION, TOOL_ORDER, WHITEBOARD_TOOL_ID,
  getDBVersionForTool, getStoresForTool, TOOL_STORES
} from './src/groups/geo/utils/toolRegistry.js';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
console.log('--- package.json dependencies ---');
console.log(JSON.stringify(pkg.dependencies, null, 2));

console.log('\n--- 按库分版本 / 分表 ---');
console.log('TOOL_DB_VERSION(老库) =', TOOL_DB_VERSION, '| WB_DB_VERSION =', WB_DB_VERSION);
TOOL_ORDER.forEach(id => {
  const v = getDBVersionForTool(id);
  const s = getStoresForTool(id).map(x => x.name);
  console.log(
    (id === WHITEBOARD_TOOL_ID ? '[WB]  ' : '       ') + id.padEnd(24),
    'v' + v,
    '| 表:', s.join(','), '| 表数:', s.length
  );
});

console.log('\n--- 断言 ---');
const assert = (cond, msg) => console.log((cond ? '✅ ' : '❌ ') + msg);
assert(TOOL_DB_VERSION === 3, '老库版本号 = 3');
assert(WB_DB_VERSION === 4, '白板库版本号 = 4');
assert(getDBVersionForTool('geo-china-map') === 3, 'geo-china-map 走 v3');
assert(getDBVersionForTool(WHITEBOARD_TOOL_ID) === 4, 'wb-whiteboard 走 v4');
assert(!getStoresForTool('geo-china-map').some(s => s.name === 'whiteboard'), 'geo-china-map 不含 whiteboard 表');
assert(getStoresForTool(WHITEBOARD_TOOL_ID).some(s => s.name === 'whiteboard'), 'wb-whiteboard 含 whiteboard 表');
assert(getStoresForTool('geo-eagle-eye').length === TOOL_STORES.length, '老库表集 = TOOL_STORES');
assert(getStoresForTool(WHITEBOARD_TOOL_ID).length === TOOL_STORES.length + 1, 'WB 表集 = TOOL_STORES + 1');
assert(pkg.dependencies['@excalidraw/excalidraw'] === '0.18.1', 'excalidraw pin 0.18.1');
assert(pkg.dependencies.react === '18.3.1' && pkg.dependencies['react-dom'] === '18.3.1', 'react/react-dom pin 18.3.1');
