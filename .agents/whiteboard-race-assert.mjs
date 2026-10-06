// .agents/whiteboard-race-assert.mjs
// 白板「首帧空数组假删除」时序竞态修复 —— 逻辑断言（临时脚本，验证完即删）
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name); }
};

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

console.log('\n=== L1. elementSync 防御层 2：allowDelete 门控 ===');
const es = read('src/groups/whiteboard/utils/elementSync.js');
ok('syncScene 签名含 allowDelete 且默认 true', /allowDelete\s*=\s*true/.test(es));
ok('删除分支被 if (allowDelete) 包裹', /if \(allowDelete\) \{/.test(es));
ok('存在 end if (allowDelete) 收口注释', /end if \(allowDelete\)/.test(es));
const idxGate = es.indexOf('if (allowDelete) {');
const idxAlive = es.indexOf('const aliveIds = new Set');
const idxSave = es.indexOf('白板元素软删除完成');
ok('aliveIds 集合差位于 allowDelete 门控之内', idxGate > -1 && idxAlive > idxGate);
ok('软删除写库日志位于 allowDelete 门控之内', idxSave > idxGate);
ok('守卫注释提及 sanitizeElements 第一嫌疑', /第一嫌疑是 sanitizeElements/.test(es));

console.log('\n=== L2. WhiteboardTool 防御层 1/3a/4 ===');
const wt = read('src/groups/whiteboard/WhiteboardTool.vue');
ok('声明 canvasReady', /const canvasReady = ref\(false\)/.test(wt));
ok('声明 boardReady', /const boardReady = ref\(false\)/.test(wt));
ok('声明 pendingElements 暂存', /let pendingElements = null/.test(wt));
ok('模板用 v-if="boardReady" 延迟挂载画布', /<template v-if="boardReady">/.test(wt));
ok('scheduleSync 未就绪时只暂存不调度', /if \(!canvasReady\.value\) \{\s*pendingElements = elements;/.test(wt));
ok('runSync 入口硬守卫 canvasReady', /if \(!canvasReady\.value\) \{[\s\S]{0,200}stats\.skipped = alive\.length/.test(wt));
ok('syncNow 有 canvasReady 守卫', /if \(!canvasReady\.value \|\| !boardRef\.value\?\.getScene\) return;/.test(wt));
ok('allowDelete 由调用侧按「本轮有活元素」判定', /allowDelete: alive\.length > 0/.test(wt));
ok('onMounted 在 await 后才置 boardReady', /await nextTick\(\);\s*boardReady\.value = true;/.test(wt));
ok('canvasReady 改为幂等入口 armCanvasReady（只升不降）', /const armCanvasReady = \(reason\) => \{\s*if \(canvasReady\.value\) return;/.test(wt));
ok('主触发源：onMounted 内 armCanvasReady（不再依赖 api-ready）',
  /armCanvasReady\('onMounted: scene灌入 \+ nextTick \+ idMap 重建完成'\)/.test(wt));
ok('备选触发源：api-ready 仍保留 armCanvasReady', /armCanvasReady\('api-ready 备选触发（api 就绪）'\)/.test(wt));
ok('回收站恢复路径也走 armCanvasReady（三触发源统一）',
  (wt.match(/armCanvasReady\(/g) || []).length >= 3);
ok('裸赋值 canvasReady.value = true 只存在于 armCanvasReady 内部',
  (wt.match(/canvasReady\.value = true;/g) || []).length === 1);
ok('导入 nextTick', /import \{[^}]*nextTick[^}]*\} from 'vue'/.test(wt));

console.log('\n=== L2b. 闸门③：firstNonEmptyChangeSeen 判据（本轮核心） ===');
ok('声明 sceneAliveBaseline 基线', /let sceneAliveBaseline = 0;/.test(wt));
ok('声明 firstNonEmptyChangeSeen 分水岭', /let firstNonEmptyChangeSeen = false;/.test(wt));
ok('onMounted 中记录基线', /sceneAliveBaseline = initialScene\.value\.filter\(e => e && !e\.isDeleted\)\.length;/.test(wt));
ok('闸门③ 仅在 !firstNonEmptyChangeSeen 时生效',
  /if \(!firstNonEmptyChangeSeen\) \{[\s\S]{0,300}alive\.length === 0 && sceneAliveBaseline > 0/.test(wt));
ok('闸门③ 拦截分支直接 return（本轮回抛 0 且基线 > 0）',
  /alive\.length === 0 && sceneAliveBaseline > 0\) \{[\s\S]{0,300}return;/.test(wt));
ok('见到首次非空即解除（永久失效）', /if \(alive\.length > 0\) \{\s*firstNonEmptyChangeSeen = true;/.test(wt));
ok('闸门③ 位于 bounds/canvas 守卫之后、syncScene 之前',
  wt.indexOf('sceneAliveBaseline > 0') > wt.indexOf('bounds/canvas 缺失拦下') &&
  wt.indexOf('sceneAliveBaseline > 0') < wt.indexOf('syncing.value = true;'));

// ---- 闸门③ 判据行为仿真：两种「正常场景」不得被误伤 ----
const gate3 = (state, alive) => {
  if (!state.seen) {
    if (alive === 0 && state.baseline > 0) return { action: 'BLOCK', state };
    if (alive > 0) { state.seen = true; return { action: 'PASS(解锁)', state }; }
  }
  return { action: 'PASS', state };
};
// 场景 A：首帧空回抛（Excalidraw 未消化）→ 必须拦
let stA = { baseline: 3, seen: false };
ok('【防误删】首帧空回抛（基线3/回抛0）被拦截', gate3(stA, 0).action === 'BLOCK');
// 场景 B：用户直接画一笔 → 非空 → 解锁 → 之后删光可正常删除
let stB = { baseline: 3, seen: false };
ok('【不误伤】首次即非空 → 解锁', gate3(stB, 4).action === 'PASS(解锁)');
ok('【不误伤】解锁后用户删光（回抛0）→ 放行，可正常删除', gate3(stB, 0).action === 'PASS');
// 场景 C：反复「画一笔删一笔」→ 首次画即解锁，后续空回抛均放行
let stC = { baseline: 0, seen: false };
ok('【不误伤】基线0 + 空回抛 → 不拦（本就无元素需保护）', gate3(stC, 0).action === 'PASS');
ok('【不误伤】画一笔 → 解锁', gate3(stC, 1).action === 'PASS(解锁)');
ok('【不误伤】删掉 → 放行（不被闸门③误拦）', gate3(stC, 0).action === 'PASS');
ok('【不误伤】再画一笔 → 放行', gate3(stC, 1).action === 'PASS');
ok('【不误伤】再删掉 → 放行', gate3(stC, 0).action === 'PASS');

console.log('\n=== L3. ExcalidrawBoard 防御层 3b ===');
const eb = read('src/groups/whiteboard/ExcalidrawBoard.vue');
ok('onApiReady 内无条件 applyScene', /onApiReady: \(nextApi\) => \{[\s\S]{0,400}applyScene\(api, props\.initialScene, props\.initialAppState\);/.test(eb));
ok('引入 sceneDirty 标记', /let sceneDirty = false/.test(eb));
ok('watch 不再 if (!api) return 丢弃', !/watch\(\(\) => props\.initialScene[\s\S]{0,200}if \(!api\) return;/.test(eb));
ok('watch 未就绪时打 dirty 标记', /if \(!api\) \{\s*sceneDirty = true;\s*return;/.test(eb));

console.log('\n=== L3b. 问题 2 根因：prop 名必须是 excalidrawAPI（0.18.1） ===');
const eb2 = read('src/groups/whiteboard/utils/excalidrawBridge.js');
ok('传的是 excalidrawAPI（0.18.1 正确 prop 名）', /^\s*excalidrawAPI: \(api\) => \{/m.test(eb2));
// 只在「可执行代码」范围内检查旧名，注释里出现旧名是允许的（用于解释根因）
const eb2Code = eb2.replace(/^\s*\/\/.*$/gm, '');
ok('可执行代码中不再使用旧名 onExcalidrawAPI（注释除外）', !/onExcalidrawAPI/.test(eb2Code));
ok('excalidrawAPI 回调把 api 交给 onApiReady（上层 api-ready 链路）', /if \(typeof onApiReady === 'function'\)/.test(eb2));
ok('无遗留 [诊断-API] 日志', !/诊断-API/.test(eb2));
ok('无遗留诊断期临时兜底路径（api 数据替换 payload）', !/临时取证行为/.test(eb2));
ok('保留「净化后归零」常驻哨兵告警', /净化后元素数归零/.test(eb2));

console.log('\n=== L3c. 残留③：诊断日志分级（关键保留 / 其余降级） ===');
const wtLogs = read('src/groups/whiteboard/WhiteboardTool.vue');
ok('保留：canvasReady 打开（console.log）',
  /console\.log\('\[诊断-HT\] canvasReady 已由', reason, '打开'\)/.test(wtLogs));
ok('保留：闸门③拦截（console.log）',
  /console\.log\('\[诊断-HT\] 闸门③拦截/.test(wtLogs));
ok('保留：onMounted 异常（console.error）',
  /console\.error\('\[诊断-HT\] 🚨 onMounted 抛异常/.test(wtLogs));
ok('requestNOISE：onMounted 逐步日志已删除（不再有 1/4、2/4 打印）',
  !/onMounted 1\/4|onMounted 2\/4|onMounted 3\/4|onMounted 4\/4/.test(wtLogs));
ok('降级：scheduleSync/runSync 入口改为 console.debug',
  /console\.debug\('\[诊断-HT\] scheduleSync 被调:/.test(wtLogs) &&
  /console\.debug\('\[诊断-HT\] runSync 入口:/.test(wtLogs));
ok('降级：handleChange 改为 console.debug', /console\.debug\('\[诊断-HT\] handleChange 收到:/.test(wtLogs));
ok('关键日志数量受控（console.log 的诊断-HT ≤ 2 处）',
  (wtLogs.match(/console\.log\('\[诊断-HT\]/g) || []).length <= 2);
ok('其余诊断-HT 一律 debug/error（无中等级 log）',
  (wtLogs.match(/console\.(debug|error)\('\[诊断-HT\]/g) || []).length >= 5);

console.log('\n=== L3d. 残留①：字体路径按协议分流（修复 /gis/fonts/ 404） ===');
const idxHtml = read('index.html');
ok('http(s) 下取 origin（修复路由前缀被当目录）', /test\(origin\)/.test(idxHtml) && /usable \? origin : pathPrefix/.test(idxHtml));
ok('file:// 下退化为文档目录（Electron 打包仍正确）', /pathPrefix = href\.replace/.test(idxHtml));
ok('去尾斜杠交给 Excalidraw 补（两种模式统一）', /replace\(\/\\\/\+\$\/, ''\)/.test(idxHtml));
ok('不再写死旧的 ./excalidraw-fonts/', !/'\.\/excalidraw-fonts\/'/.test(idxHtml));

// 复算：三种「页面 URL」下的实际取值
const assetPath = (href, origin) => {
  const h = href.replace(/[?#][\s\S]*$/, '');
  const pathPrefix = h.replace(/[^/]*$/, '').replace(/\/+$/, '');
  return /^https?:\/\//.test(origin) ? origin : pathPrefix;
};
ok('dev 白板页 → origin（不含 /gis）',
  assetPath('http://localhost:5173/gis/whiteboard', 'http://localhost:5173') === 'http://localhost:5173');
ok('dev 首页 → 同样 origin', assetPath('http://localhost:5173/', 'http://localhost:5173') === 'http://localhost:5173');
ok('Electron 打包 → dist 目录（与 index.html 同级）',
  assetPath('file:///C:/app/dist/index.html', 'null') === 'file:///C:/app/dist');
ok('【反例】旧逻辑（纯取文档目录）在 /gis/whiteboard 下会得到 /gis（即 404 根因）',
  'http://localhost:5173/gis/whiteboard'.replace(/[^/]*$/, '').replace(/\/+$/, '') === 'http://localhost:5173/gis');

console.log('\n=== L4. 字体：路径归一化复算（真实还原 Excalidraw normalizeBaseUrl） ===');
// ---- 复刻 Excalidraw createUrls + normalizeBaseUrl（含 file:// 下 origin='null' 的退化）----
//   createUrls:  n = fontUri.replace(/^\/+/, '')            // 仅剥开头 '/'，'./' 保留
//   normalize:   base 以 './' 或 '/' 开头 → new URL(base.replace(/^\.?\//,''), origin)
//                base = base.replace(/\/+$/,'') + '/'        // 恒追加尾斜杠
const fontUri = './fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2';
const EX = (assetPath, origin, pageUrl) => {
  const n = fontUri.replace(/^\/+/, '');
  let base = assetPath;
  if (/^\.?\//.test(base)) {
    const rest = base.replace(/^\.?\//, '');
    const b = (origin && origin !== 'null') ? origin : pageUrl;
    base = new URL(rest, b).toString();
  }
  base = base.replace(/\/+$/, '') + '/';
  return new URL(n, base).toString();
};

// ---- 从 index.html 抽取「真实生效」的赋值并求值（避免断言与实现脱节）----
//   🩹 赋值已从「单表达式」改为「IIFE 内条件分流」（按 protocol 选 origin / 目录前缀），
//      故改为直接把整段 <script> 丢进沙箱执行 —— 这样断言是**跑真实代码**，
//      比正则抽表达式更强（表达式形态以后再变也不会误伤断言）。
const htmlSrc = read('index.html');
const scriptMatch = htmlSrc.match(/<script>([\s\S]*?)<\/script>/);
ok('index.html 中存在内联 script（承载 EXCALIDRAW_ASSET_PATH）', !!scriptMatch);

const evalAssetPath = (href, origin) => {
  const window = { location: { href, origin } };
  // eslint-disable-next-line no-new-func
  new Function('window', scriptMatch[1])(window);
  return window.EXCALIDRAW_ASSET_PATH;
};

const DEV_HREF = 'http://localhost:5173/';
const PACK_HREF = 'file:///C:/app/dist/index.html';
// 🚨 真实浏览器形态：dev 下 origin 是 "http://localhost:5173"；file:// 下是字符串 "null"
const devAsset = evalAssetPath('http://localhost:5173/gis/whiteboard', 'http://localhost:5173');
const packAsset = evalAssetPath(PACK_HREF, 'null');

ok(`dev 白板页求值 = "http://localhost:5173"（实得 ${JSON.stringify(devAsset)}）`, devAsset === 'http://localhost:5173');
ok(`打包 href 求值 = "file:///C:/app/dist"（实得 ${JSON.stringify(packAsset)}）`, packAsset === 'file:///C:/app/dist');

ok(`dev 白板页求值 = "http://localhost:5173"（实得 ${JSON.stringify(devAsset)}）`, devAsset === 'http://localhost:5173');
ok(`打包 href 求值 = "file:///C:/app/dist"（实得 ${JSON.stringify(packAsset)}）`, packAsset === 'file:///C:/app/dist');

const wantDev = 'http://localhost:5173/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2';
const wantPack = 'file:///C:/app/dist/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2';
ok('【修复】dev 最终字体 URL 命中 /fonts/', EX(devAsset, 'http://localhost:5173', DEV_HREF) === wantDev);
ok('【修复】打包最终字体 URL 命中 dist/fonts/', EX(packAsset, 'null', PACK_HREF) === wantPack);

// 反例 1：旧值 './excalidraw-fonts/' —— 两种模式都双重嵌套（即原 bug）
const oldDev = EX('./excalidraw-fonts/', 'http://localhost:5173', DEV_HREF);
const oldPack = EX('./excalidraw-fonts/', 'null', PACK_HREF);
ok('【反例】旧值 dev 双重嵌套 /excalidraw-fonts/fonts/（404）', oldDev !== wantDev && oldDev.includes('/excalidraw-fonts/fonts/'));
ok('【反例】旧值打包双重嵌套（404）', oldPack !== wantPack && oldPack.includes('/excalidraw-fonts/fonts/'));

// 反例 2：写死单一常量无法两全（证明「必须动态」）
ok('【反例】base="/" dev 可行', EX('/', 'http://localhost:5173', DEV_HREF) === wantDev);
ok('【反例】base="/" 打包不可行（index.html 被当目录）', EX('/', 'null', PACK_HREF).includes('index.html/fonts/'));
ok('【反例】base="/fonts/" dev 不可行（双重 /fonts/fonts/）', EX('/fonts/', 'http://localhost:5173', DEV_HREF).includes('/fonts/fonts/'));
ok('【反例】base="/fonts/" 打包也不可行（双重 /fonts/fonts/）', EX('/fonts/', 'null', PACK_HREF).includes('/fonts/fonts/'));

ok('index.html 不再写死旧的 ./excalidraw-fonts/', !htmlSrc.includes("'./excalidraw-fonts/'"));
ok('index.html 赋值基于 window.location（动态）', /window\.location\.href/.test(scriptMatch[1]));
ok('index.html 注释中已改用动态说明（无旧赋值语句）',
  !/window\.EXCALIDRAW_ASSET_PATH\s*=\s*'\.\/excalidraw-fonts\/'/.test(htmlSrc));

console.log('\n=== L5. 字体实际落盘校验 ===');
const html = read('index.html');
ok('index.html 的 ASSET_PATH 赋值不使用写死常量', !/EXCALIDRAW_ASSET_PATH\s*=\s*['"]/.test(html));
ok('public/fonts 存在', fs.existsSync(path.join(root, 'public/fonts')));
ok('public/excalidraw-fonts 已不存在', !fs.existsSync(path.join(root, 'public/excalidraw-fonts')));
ok('dist/fonts 存在（build 已产出）', fs.existsSync(path.join(root, 'dist/fonts')));

const chunkPath = 'node_modules/@excalidraw/excalidraw/dist/prod/chunk-K2UTITRG.js';
if (fs.existsSync(path.join(root, chunkPath))) {
  const chunk = read(chunkPath);
  const referenced = [...new Set([...chunk.matchAll(/"\.\/fonts\/([A-Za-z0-9\-_./]+)"/g)].map(m => m[1]))];
  let missing = 0, badMagic = 0;
  for (const rel of referenced) {
    const p = path.join(root, 'public/fonts', rel);
    if (!fs.existsSync(p)) { missing++; continue; }
    if (fs.readFileSync(p).subarray(0, 4).toString('latin1') !== 'wOF2') badMagic++;
  }
  ok(`引用的 ${referenced.length} 个字体全部存在（缺失 ${missing}）`, referenced.length === 230 && missing === 0);
  ok(`全部 wOF2 魔数正确（异常 ${badMagic}）`, badMagic === 0);
}

console.log('\n=== L6. 反向用例：空列表在 allowDelete=false 下不得触发删除 ===');
const simulate = (elements, idMapEntries, allowDelete) => {
  const list = Array.isArray(elements) ? elements : [];
  const deleted = [];
  if (allowDelete) {
    const aliveIds = new Set(list.filter(e => e && !e.isDeleted).map(e => e.id));
    idMapEntries.forEach(([elementId]) => { if (!aliveIds.has(elementId)) deleted.push(elementId); });
  }
  return deleted;
};
const reg = [['el-A'], ['el-B'], ['el-C']];
ok('allowDelete=true + 空列表 → 会误删全部（原始 BUG 复现）', simulate([], reg, true).length === 3);
ok('allowDelete=false + 空列表 → 零删除（修复后行为）', simulate([], reg, false).length === 0);
ok('allowDelete=false + 有元素 → 零删除', simulate([{ id: 'el-A' }, { id: 'el-B' }], reg, false).length === 0);
ok('allowDelete=true + 有元素 → 只删缺失的 el-C',
  JSON.stringify(simulate([{ id: 'el-A' }, { id: 'el-B' }], reg, true)) === '["el-C"]');
ok('allowDelete=true + 显式 isDeleted → 正确删除（不破坏正常删除）',
  JSON.stringify(simulate([{ id: 'el-A', isDeleted: true }, { id: 'el-B' }], reg, true)) === '["el-A","el-C"]');

console.log('\n============================================');
console.log(`  通过 ${pass} / ${pass + fail}`);
console.log('============================================\n');
if (fail > 0) process.exitCode = 1;
