# 项目归档详情（PROJECT_MEMO_ARCHIVE）

> 从主 MEMO 拆出的历史内容。**不必每轮读**，需要细节时按标题搜索。
> 主 MEMO 保留：状态速览 / 项目概况 / 协作约定 / 数据现状 / 踩坑索引 / 待办 / 每轮必做。

---

## 一、施工轮存档（第 5~25 轮）

## 第 18 轮存档（2026-10-07）：缺陷 1 方案设计（未改代码）—— 交付 G 方案

DeepSeek 已裁决通过 G 方案全部 5 项，第 19 轮只批**第 1 步 E1**（已在上面实施）。
本轮**只做设计、零源码改动**（build 1.59s 仅验证）。核出三条**推翻我自己旧判断**的事实：
① **`wbElementRaw` 每次删除都必然有值**（`elementSync.js:265-266` 的 `rawById` 由当前 scene
全量建立，`:281` 入库；因删除只打标记不物理移除 → 必然命中）⇒ 我上轮「raw 可能缺失 → 情况 1
不可替代」**是错的**；「老记录无 raw」只指补丁前的历史记录。
② **畸形 text 不是「情况 1 物理移除」造成的** —— `finalizeRestore` 降级重建**就在
`restoreElementsToBoard` 内部**，是情况 1 的**兄弟分支**，二者互不干扰 ⇒ 「情况 2 替代情况 1」
**零新增降级风险**（修正 MEMO 坑#14 的成因叙述）。
③ **CAS 拦不住 `finalizeRestore` 的裸写**（`:764` 不传 baseUpdatedAt）—— 实测时间窗：乐观写
（CAS）**全偏移都拒**（含 0ms）⇒ 上轮「0ms 是漏洞」**悲观误判已撤回**；但裸写**全偏移都回灌**
⇒ **裸写必须消灭，否则 T 方案正确性不闭合**。
⚠️ 唯一致命危害 = **不可逆 + 静默**的数据丢失（`result.missing` 分支不写库 + 基线未变 →
乐观写匹配成功 → 旧快照带 isDeleted 覆盖 → 元素永久消失、UI 却显示「恢复成功」）。
📋 推荐 **G 方案**：**E1**（`finalizeRestore` 不再写库，交 `refreshDataFromDB` 用已有的
`persistBoardAuthoritative` 统一权威写 ⇒ 裸写从根消失）+ **D**（`runSync` 删除分支把**已成功
入档**的元素从 scene 剔除；⚠️ 只在入档成功后剔、不只过滤 isDeleted）+ **军规哨兵**（`missing` 必须可见）。
❌ 不做：不动 `captureScene` / 不做 C（物理移除）/ 不做 B（载入即永久剔除，会**永久杀死**历史恢复能力）。
✅ 情况 1 代码**保留**为兼容层（第 2 步后自然失效）。⏳ 等 DeepSeek 裁决 5 项）

## 第 11 轮存档（2026-10-07）
🚀 **第一批：回收站性能优化**（按 DeepSeek 裁决 1，**只改 `RecycleBinModal.vue`**）
  · **方案 2**：`loadItems()` 由 7 库串行 → `Promise.all` 并发，**逐库 catch 兜底**（一库坏不炸全表）
  · **方案 3**：新增 `removeItemLocally(item)`，恢复/彻底删除后 `splice` 局部移除，
    清空后 `items.value = []` —— **不再全量重载**（旧版恢复 5 条 = 35 次库遍历，是卡顿主因）
  · **方案 4**：`getRegisteredElementsWithBoard()` 的 `getBounds`/`getCanvas` 合并并发读
  · **开窗时机**（关键约束）：方案 3 移除了「操作后重载」这一隐式新鲜度保证，
    `watch(visible)` 里的无条件 `loadItems()` 成为**唯一**新鲜度来源 → 已写注释标「关键，勿删」
  · **顺带修 2 处旧遗漏**：`handlePurge` / `handleClearAll` 原本**都没有** `emit('changed')`
    → 「彻底删除/清空」后 GisApp 图层缓存不刷新。已补齐（方案 3 后 emit 成为唯一通知渠道）
  · ⚠️ **踩坑（已修）**：实现裁决 3 时我顺手在开窗处加了 `emit('changed')`，
    查接线发现 `GisApp.vue:299` 把它接到 `loadAllLayersFromDB()` ——
    那是「7 库 × N 图层 + 每图层一次 `getDocument`」的 **N+1 全量重查**，
    开窗触发会**直接抵消本次优化**。已删除该行并加注释锁死防复发。
  · ⚠️ `executeCmd`（AI 批量指令）**保留** `await loadItems()`：批量可能改多行，局部更新覆盖不了
  · 验证：build 1.42s ✅ / 10 项特征串落盘全过 / UTF-8 干净 / 残留 `await loadItems()` = 1（预期）

## 第 10 轮存档（2026-10-07）—— 只出方案，未动代码
📋 **两件方案评估**（DeepSeek 已全部采纳，见第 11 轮执行）：
  · **回收站慢**：纠正 3 处根因误判 —— ①`handleRecover` 事务更少（地图元素直接 return）；
    ②真正放大器是「每次恢复后全量 `loadItems()`」（恢复 5 条 = 35 次库遍历）；
    ③`ensureToolMigrated` 有内存缓存，首访后零事务。四方案排序：**方案3(局部更新) > 方案2(并发)
    > 方案4(合并读) > 方案1(放弃)**
  · **P1**：纠正关键前提错误 —— **`recordToElement` 不存在**（全仓 0 命中）；
    T1 的 `restoreElementsToBoard` 只有「塞回已有 wbElementRaw」/「按坐标降级重建」两条路径，
    **都不是「从记录生成元素」** → P1 是从零新建生成器，不是复用。
    另确认 `AiImportPanel`/`MarkerDocPanel` **已是工具无关的**（toolId/fileId 走 props）


## 第 9 轮收尾（2026-10-07）
🧹 **收尾 1：临时调试按钮全清**（`WhiteboardTool.vue`）
  · 删除 4 处：模板 button 块 + `handleTempDebugClear`/`debugClearing` + `.wb-btn-debug` CSS + `clearAllLayers` 导入
  · `grep '临时调试'` / `wb-btn-debug` / `debugClearing` / `handleTempDebugClear` / `clearAllLayers` **全部 0 命中** ✅
  · dist 产物确认「临时调试」已消失，「🛡️ 已隔离」（C 方案）仍在 ✅
  · ⚠️ 清理手法提醒：CSS 区块删除时我用 PowerShell 按行删，**多删了 1 行**导致孤立 `};`（build 报错），
    已修。**教训：按行号批量删后必须立刻 build，不能只看 grep 结果。**
🔖 **收尾 2：arrow/line 区分标记**（`elementSync.js`）
  · 线性元素重建的 `customData._rebuiltFrom` 由 `'coordinate'` → **`'coordinate-line'`**
    （线性元素重建**丢失原始路径**，只有一条近似对角线；该标记便于排查「箭头形状不对」）
  · 基础图形仍为 `'coordinate'`，两种取值均已打包 ✅
📮 **收尾 3：mailbox 改覆盖式**
  · `to-deepseek.md` 只保留本轮报告（此前累积 29909 字节 / 3+ 轮历史，违背 token 节约要求）
  · 历史报告交给 git 保存，不再累积
✅ **A+C 实测结论（用户验收）**：画布正常显示、删除-恢复闭环通、控制台正确隔离 2 个毒元素 → 达标。

## 第 8 轮存档（2026-10-07）
🔧 **第 8 轮（按 DeepSeek 裁决，A + C 立即、B 排期）**：
  · **A 治坏数据源** `elementSync.js:662-748`：降级重建改为「先 `rebuildBase`，再按 `wbType` 分派」——
    `text` 补全 9 个必需字段；`rect/ellipse/diamond` 同源直接用；`arrow/line` 补 `points`；
    `frame/image/embeddable/freedraw` **拒绝重建**（落入 missing，半成品比缺失危害大）。
  · **C 长期防御** `elementSync.js:563-647`：新增 `validateElement` / `filterBrokenElements`，
    必需字段表 `text→[text,fontFamily,fontSize]`、`image→[fileId]`、`frame→[children]`，
    另校验共有字段 `id/type`（非空串）与 `x/y`（有限数值）。
    **两层接线**：① `WhiteboardTool.sanitizeSceneFromDB()`（读库 + 恢复回写）
    ② `ExcalidrawBoard.toSafeElements()`（漏斗收口，覆盖 `initialData`/`onApiReady`/`setScene`/`watch` 4 出口）。
    行为：残缺元素**内存剔除不送画布** + `console.warn` 列出 id/type/缺字段，**不写库、不删 annotations**。
  · **离线验证**：C 8 用例全过（识别畸形 text + 空文本不误杀）；
    A 产物 × C 校验器 10 类型交叉验证全通过（证明 A/C 自洽，C 不会剔除 A 的产物）。
  · **B（根治）已排期**：`wbElementRaw` 强制留档。详见「五-14」+ `to-deepseek.md` 第 8 轮。
  · ⚠️ 待裁决：A 中 `arrow`/`line` 我**额外补了 `points`**（原文只说「保持现有模板」）。

## 第 7 轮存档（2026-10-07）
🔍 **第 7 轮（只诊断 + 加临时按钮）**：
  · **根因确认**：`elementSync.js:577-608` 降级近似重建**硬编码 28 个矩形字段**，
    第 579 行只换 `type` 不换字段集 → `wbType==='text'` 时产出无
    `text`/`fontFamily`/`fontSize`/… （9/9 全缺）的**畸形元素** → 写入 `board.scene`
    → 下次打开渲染时 `renderText` 读 undefined → **TypeError** → React error boundary
    → **整个画布挂起**（「正在加载绘图...」不恢复）。详见 MEMO「五-14」。
  · `wbElementRaw` 补丁路径**字段完整、不受影响** → 故**偶尔**才触发（换白板/清过画布/早期删除无 raw）。
  · 临时按钮 `🧪 [临时调试] 清空白板` 已加（三步：清 scene → `clearAllLayers` → reload），
    **用完必删清单见「六、待办」**（4 处，`grep -n '临时调试'` 定位）。
  · 报告全文见 `to-deepseek.md` 第 7 轮。

## 第 6 轮存档（2026-10-07，仍有效）
🔧 **第 6 轮（按 DeepSeek 裁决，只改一行）**：
  · `WhiteboardTool.vue:361` `allowDelete: alive.length > 0` → **`allowDelete: firstNonEmptyChangeSeen`**
  · 根因：旧判据把「首帧空回抛（应禁）」与「用户删光（应允）」混为一谈 ——
    删光时 `alive.length === 0` → `allowDelete:false` → `elementSync` 删除整块被静默跳过
    → 回收站**什么都没有**（现象正是「删除失效」）。
  · 闸门③（`:320-334`）**一字未动**：它才是「首帧空回抛」的唯一防线，且在 `allowDelete` 之前 return。
  · 离线复算 6 场景全通过（含关键 S4「画2删光」：旧 false → 新 true）；产物验证 `R` 双用已对齐。
  · 详见 `to-deepseek.md` 第 6 轮报告 + MEMO「五-13」。

## 第 5 轮存档（2026-10-06，仍有效）
🔧 **第 5 轮（按 DeepSeek 裁决）**：
  ① `elementSync.js` 更新分支**新增 group 同步**（本次关键修复，详见「五-12」）——
     `if (moved||renamed||reshaped)` → `|| regrouped`，`next` 里追加 `group: regrouped ? currentGroup : prev.group`；
  ② 删掉 `WhiteboardTool.vue` 里上轮加的 `wbGroupOverride` / `bumpWbGroupOverride` / `getEffectiveGroup` 三件套
     （库值已正确 → 覆盖层就是新隐患），`wbPanelLayers` 恢复简单形式（不再读 `getEffectiveGroup`），
     `wbPanelGroups` 改回读 `registeredList` 的 `l.group`，`handleWbUpdateGroup` 末尾改为
     `refreshRegisteredList()`（**只读库、不写库**，不构成第二写入口）；同时移除已无用的 `shallowRef` import。
  ③ `buildFingerprint` 不含 group **已逐行核实**（`fingerprint.js:101` payload = `[name,lat,lng,toolId,type]`）
     → 「改组不触发注销/重登」成立，DeepSeek 的指纹安全性结论正确。
本轮新增：`LayerListPanel` 加 `hideWindowHint` 增量 prop；新建 `WhiteboardPanels.vue` 薄包装
（图形列表 Teleport 顶栏 + 信息栏画布左下角浮层）；`WhiteboardTool.vue` 完成模板接线 +
`wbPanelLayers`/`wbPanelGroups` computed + `syncSelectedToInfoPanel` / `whiteboardLocate` /
`handleWbUpdateGroup` / `handleWbDeleteElement` 四个 handler。
🔧 **本轮修正（第 4 轮）**：上轮删除实现是**错的**，已按 DeepSeek 裁决回滚 ——
`handleWbDeleteElement` 改为**只打 `isDeleted` 标记**（不物理移除、不手动写回收站）。
**失效链**：物理移除 → `onChange` → `runSync` 删除分支 `moveToRecycleBin`，
其 `wbElementRaw` 取自 `rawById`（`elementSync.js:265-266`，**由当前 scene 建立索引**）
→ 元素已被移除 → 传 `null` → 恢复时情况 1（`:521` 需元素在 scene）与情况 2
（`:534` 需 rawMap 有值）**双双不成立** → 落 `missing` → 画布上什么都不出现。
🆕 **顺藤摸出更严重的问题**：`elementSync` **根本不同步 `group`** ——
更新分支（`:330-358`）的 `next = {...prev}` **不包含 group**，
`getElementGroup` 只在**新增**（`:370`）与 `registerElement`（`:466`）时读一次。
⇒ 我上轮报告的「分组双写」**不成立**，且会出现「改组后列表闪回旧分组」。
已在 `WhiteboardTool` 侧用 `wbGroupOverride`（`shallowRef<Map>`）+ `getEffectiveGroup`
做**画布侧有效值**（零改动 elementSync），但**库值仍滞后**（重启后回旧值），待 DeepSeek 裁决。
🚨 **新增禁令**：面板侧**禁止**手动调用 `runSync` / `moveToRecycleBin`
（`handleWbUpdateGroup` 上轮也犯了这个「多此一举」的错，已移除）。
上一轮已确认主 bug 修复生效：状态栏「元素 1·已登记 1」、信息数据库出现 WB.00012 记录）

---


---

## 二、已完成功能（详情）

### 已完成功能明细（原主 MEMO「三、已完成功能」全文）

### 0. 白板（Excalidraw）—— 目标与当前进度（2026-10-06，用户已拍板）

**🎯 目标升级（本轮新增决策，此前未落盘）**：
白板目标从「地图的补充视图」升级为 **「具备和鹰眼同等完整度的面板组合」**。
即白板侧要形成与鹰眼 `geo-eagle-eye` 对等的面板体系：**图形列表** + **信息栏** + 富文本详情
+ 回收站 + 信息数据库 + AI 指令可操作，而非仅仅「画布能存住」。

**✅ 已完成（可依赖）**：
- 路线 A 落地：白板元素带 `lat/lng`，走同一套 `annotations` / `documents` 表
- `wb-whiteboard` 工具注册；DB 库 `LiangJian_Tool_WB` 已升 **v4**（其余 6 库保持 v3）
- 全登记：所有元素入库，无 name 时用 `element.id` 兜底参与指纹（指纹算法 v4 未动）
- **五层防御已落地（时序竞态修复）**：`canvasReady`/`pendingElements` 守卫、
  `elementSync` 的 `allowDelete` 门控、`v-if="boardReady"` 延迟挂载、
  `onApiReady` 无条件 `applyScene` + `sceneDirty` 补执行、`syncNow` 守卫
- **字体路径已定**：目录 `public/fonts/`（**不是** `excalidraw-fonts/`）+
  `index.html` 动态计算赋给 `EXCALIDRAW_ASSET_PATH`
- **✅ 字体路径 404 修复（2026-10-06，已实测）**：
  **现象**：控制台 `Failed to decode downloaded font: http://localhost:5173/gis/fonts/…`
  **根因**：旧实现取「文档所在目录」，但本项目用 `createWebHistory()`，
  页面 URL 是 `http://localhost:5173/gis/whiteboard` → 取目录得 **`…/gis`**
  （`/gis` 是**路由前缀**、不是真实目录）→ Excalidraw 补 `/fonts/` → `…/gis/fonts/` ❌
  而 Vite 的 `public/` 恒定挂在**站点根**，与路由无关（实测 `…/fonts/…` **HTTP 200**）。
  **修复**：按协议分流（`index.html`）——
  · `http(s)` → 用 `location.origin`（`http://localhost:5173`）
  · `file://` → `location.origin` 为 `file://`（不可解析），退化为「文档所在目录」
    → `file:///…/dist`（与 index.html 同级，正确）
  两者都不带尾斜杠，交 Excalidraw 的 `normalizeBaseUrl` 自补。
  **实测**：`ASSET_PATH=http://localhost:5173`（不含 /gis）、`/gis/fonts/` 请求 **0** 次；
  Electron 下 `ASSET_PATH=file:///D:/app100-multifunction/dist` ✅。
- **✅ 问题 2 根因修复（2026-10-06，已实测）—— prop 名错了**：
  **根因**：0.18.1 的 prop 名是 **`excalidrawAPI`**，旧代码传的是 **`onExcalidrawAPI`**
  （0.17 时代的名字）。`node_modules/@excalidraw/excalidraw/dist/prod/index.js` 原文：
  ```js
  let { excalidrawAPI: n, … } = t;                       // t = props
  typeof n == "function" ? n(d)
                         : console.error("excalidrawAPI should be a function!")
  ```
  传错名**不报错**，只在控制台留一句 `excalidrawAPI should be a function!`（极易被刷屏埋掉），
  API 永远拿不到 → `api.value` 恒 null → `captureScene(api)` 失效 →
  「手动同步」「关闭兜底落库」全断。
  **为何 `onChange` 正常但 api 从不触发**：两者是**各自独立**的 props，
  前者名字对、后者名字错 —— 这正是「诡异组合」的解释。
  **修复**：`excalidrawBridge.js` 改传 `excalidrawAPI: (api) => { … }`。
  ⚠️ **勿改回 `onExcalidrawAPI`**，0.18.1 只认 `excalidrawAPI`。
  **实测**：`"should be a function!"` **0** 次，`api-ready` 链路打通。
- **🩹 白板主 bug 修复（2026-10-06，待用户实测）**：
  **根因**：`canvasReady` 的触发条件设计错误 —— 绑在 `api-ready` 上，
  而 `onExcalidrawAPI` **从未触发**（问题 2）→ `canvasReady` 永远 false
  → `runSync` 永远直返 → 元素从不登记、状态栏恒「0 个」。
  **修复**：① `canvasReady` 语义改为「元素数据就绪」，主触发源移到 `onMounted`
  （scene 灌入 + `nextTick` + `idMap` 重建完成），`api-ready` 降为备选兜底；
  ② 三个触发源统一走幂等入口 `armCanvasReady(reason)`（只升不降，先到先赢）；
  ③ **新增闸门③**（见下）；④ 调用侧 `allowDelete: alive.length > 0`
  （**新增前置条件，未动 elementSync 内部门控**）。

**🚨 闸门③（本轮核心补充，勿删）**：
`sceneAliveBaseline` + `firstNonEmptyChangeSeen` 两个变量。
- **为什么需要**：`applyScene` 异步生效，`nextTick` 只保证 Vue flush，
  **不保证 React/Excalidraw 已消化 initialData**。故存在时序：
  `scene 灌入(10) → nextTick → canvasReady=true → idMap 重建(10条) → Excalidraw 首帧 onChange 抛 []`
  → `alive=[]` → 集合差 = 全部 10 条 → 💥 全量误删。
  闸门①②只防「某时间点**之前**」，防不住「时间点**之后**回来的空数组」。
- **判据用 `firstNonEmptyChangeSeen`（不是「首次空回抛」）**：
  「Excalidraw 何时消化完 initialData」只有「第一次吐出非空」能证明。
  一旦见过非空 → 闸门③ **永久失效**，后续所有 onChange 不受约束。
  这样不误伤两种正常场景：① 首次就非空（直接画）→ 立刻解锁，之后删光可正常删；
  ② 反复「画一笔删一笔」→ 首次画即解锁，后续空回抛全放行。
- **不误删 / 不误伤，两头都要保住**：改动风险是「onChange 早于场景灌入 → 空数组 → 误删」，
  所以闸门③**不是可选项**。

**🐞 问题 2（独立 bug，✅ 已修复 —— 见上方「问题 2 根因修复」）**：
`onExcalidrawAPI` **从不触发**（实测 `api: -3` = `apiRef` 一直未就绪）。
**根因**：0.18.1 的 prop 名是 `excalidrawAPI`，旧代码传 `onExcalidrawAPI`（0.17 旧名），
Excalidraw 侧走 `else` 分支只打一句 `console.error("excalidrawAPI should be a function!")`
→ API 从未注入 → `onApiReady` 从未回调 → `api.value` 恒 null
→ `api.getSceneElements()` 恒 -3 → `captureScene(api)` 失效
→ 「手动同步」「关闭兜底落库」全断（问题 2 的完整因果链）。
**已修复并实测通过**；4 处诊断探针已随之清理。

**🐞 已修复（原「已知未修 bug」）**：
新画的元素不被登记、状态栏恒「0 个」—— **已修复，待实测**（见上方「🩹 白板主 bug 修复」）。

**⚠️ 两次误判记录（教训，勿重蹈）**：
- **误判 1**（第 1 轮）：断定 `sanitizeElements` 的 `JSON.parse(JSON.stringify(el))`
  丢弃元素。**错**：实测 `onChange.elements: 1 | sanitize 后: 1`，净化没问题。
  教训：**没有实测 `onChange` 入参个数就往下游找根因** = 从下往上猜。
- **误判 2**（第 2 轮）：断定 `canvasReady` 守卫"写过头了"。
  **错**：守卫逻辑本身正确，是**它依赖的信号从未到达**。
  教训：「守卫拦住了」≠「守卫写错了」，要分清**逻辑错**与**输入缺失**。
- **✓ 正解**：加一行 `api.getSceneElements()` 对比日志 + `handleApiReady` 探针，
  一次实测定位。教训：**先用日志划定断点区间，再读代码解释断点**。

**🛠️ 施工顺序（用户已定，按序推进）**：
1. **修上述 bug** —— 新画元素必须被登记（状态栏计数正常）
2. **P0 界面** —— 图形列表 + 信息栏（对齐鹰眼完整度）
3. **P1**
4. **P2**

### 1. AI 批量导入系统
- 数据格式：`public/ai-import/*.json`
- 契约字段：`batchName / group / markerColor / items[{name,lat,lng,address,intro,images}]`
- 面板：`AiImportPanel.vue`；导入器：`aiImporter.js`

### 2. 信息回收站
- 数据层 `recycleStore.js`，UI `RecycleBinModal.vue`
- 删除改软删除（先入回收站，可恢复）
- AI 指令：`aiDataCommand.js` 支持 `delete / list-recycle / restore / purge / list-perms`

### 3. 数据身份证（指纹）系统 v4
- 算法：`fingerprint.js`
- 指纹 = `v4-<64位hex>`，由 5 个**稳定维度**组成：
  名称（归一化）+ 纬度 + 经度 + toolId + type
- **刻意排除** address / fileId（易变字段，曾导致去重失效）
- 索引层：`fingerprintStore.js`，表 `fingerprints`（主键 fp）
- 去重 O(k log n)，支持千万级；回填用游标分批，内存恒定

### 4. 导入归档腾空
- `importHistory.js`，meta 键 `imported_ai_files`
- 「一键导入全部」后文件入历史库，待导入清单归零

### 5. 分组编辑增强
- `LayerListPanel.vue`
- 分组显示元素数量；编辑窗口放大到 860×620 双栏
- 可展开查看元素、单个删除（软删除）
- **AI 删除权限开关**（🤖 按钮，localStorage 键 `geo_group_ai_delete_perms`）

### 6. AI 删除权限落地
- `aiDataCommand.js` 中 `delete / purge` 受权限白名单约束
- 未授权分组一律跳过，结果回报「权限拦截 N 条」
- 名单为空 = AI 一条都删不了（最安全默认）

### 7. 界面滚动修复
- `InfoDatabase.vue`：表格加 `.table-scroll` 滚动容器
- `RecycleBinModal.vue`：`.rc-body` 补 `min-height: 0`

### 8. 面板固定到顶栏（2026-10-06）
- `MapPanel.vue` 新增 `inline` 模式：顶栏「按钮+下拉」，不可拖拽；默认浮层行为不变
- 定位查找、信息栏、AI 批量导入 三个面板已 Teleport 到 `#tool-header-slot`
- 图层透明度等仍为浮层可拖拽
- 详见 skill：`.agents/skills/geo-panel-ui-design/SKILL.md`

### 9. 层叠上下文修复（2026-10-06）
- 根因：Leaflet 窗格 z-index 高达 700 且泄漏到外层，压住顶栏与浮层
- 修复：`.tool-content` 加 `isolation: isolate; z-index: 0`；顶栏 z-index 1100；底部工具栏 1060
- 教训已写入 `geo-panel-ui-design` skill 第五节

### 10. 热点信息分组（2026-10-06）
- 目的：鹰眼平台数据量大时全量渲染卡顿，打开时只渲染少量图形
- 机制：与收藏夹同属「叠加型」虚拟分组，按 id 集合而非 group 归属
- 生成：遍历每个分组随机抽 2-3 个，总数上限 49（HOTSPOT_MAX）
- 存储：localStorage 键 `geo_hotspot_layer_ids`
- 打开鹰眼时自动应用；图形列表下拉可选「🔥 热点信息」，另有「🔥 刷新热点」按钮重新随机
- 数据零风险：只切 Leaflet 挂载状态，不改 IndexedDB
- 仅对 `geo-eagle-eye` 生效（`enableHotspot` 控制）

### 13. 海量数据性能优化（2026-10-06）
- 新增 `src/groups/geo/utils/layerScheduler.js`：分块执行 + 让出主线程 + 随机采样
- **分块加载**：每 9 个一组（CHUNK_SIZE），组间 `requestIdleCallback` 让出主线程
- **显示窗口**：任何视图最多挂载 60 个图形（GROUP_DISPLAY_MAX），数据全量保留在内存
- **30 秒轮换**：定时随机换一批显示（ROTATE_INTERVAL_MS），热点视图不自动轮换
- **图标缓存**：同样式 divIcon 只创建一次（markerIconCache）
- **markRaw**：Leaflet 对象不进入 Vue 响应式，避免万级深度代理开销
- 图形列表与地图严格一致，只显示窗口内 60 条

### 12. 多 AI 协作骨架（2026-10-06）
- 协作协议：`.agents/references/multi-ai-collab.md`
- 分片目录：`public/ai-import/shards/`（采集员只写此处，主 AI 统一登记 manifest）
- MCP 端口：主 9222 / 采集员A 9223 / B 9224 / C 9225，配置在 `.vscode/settings.json`
- 隔离铁律：一 AI 一浏览器、一 AI 一片区、只有主 AI 写 manifest、采集员不碰 MEMO 与代码
- 已知限制：导入永远串行（AI 写不了 IndexedDB），并行只加速采集
- 建议：先跑通单采集员再扩展

### 14. 第三产品入口占位：Excalidraw Whiteboard +数据信息（2026-10-06）
- **需求边界**：只在初始界面加第三个产品入口。第三产品是**独立功能区**，体量大、架构复杂，本次不实现其功能，也不得改动既有代码
- `Home.vue` 新增第三个入口卡片（🖊️），文案 `Excalidraw 白板 + 数据信息`，点击跳 `/gis/whiteboard`
- **未改动** `GisApp.vue`、`toolRegistry.js` 及任何既有逻辑（首轮越界改动已全部回滚，`git status` 已确认）
- 当前 `/gis/whiteboard` 在 GisApp 中无对应工具组 → 落到默认欢迎页，属占位状态
- 第三产品正式落地时：应为其建立**独立路由/独立容器**，不要硬塞进现有 `groups` 工具组体系
- **2026-10-06 后续决策（路线 A，用户已拍板）**：
  - 白板定位 = **地图的补充视图**，元素必须带地理坐标 `lat/lng`
  - 坐标来源：白板先绑定一个地理范围（bounds），元素画布坐标 `x/y` 换算为 `lat/lng`
  - **不改指纹算法**（`fingerprint.js` 保持 v4，`buildFingerprint` 一行不动）
  - 新增 toolId `wb-whiteboard`（前缀 `WB`，库 `LiangJian_Tool_WB`），已注册到 `toolRegistry.js`
  - 元素点开有富文本详情，复用 `documents` 表（主键 `fileId_annotationId`）
  - 白板元素享受全部既有待遇：编号 / 指纹去重 / 软删除回收站 / AI 指令 / 信息数据库
  - 完整实施设计与改动清单见 `.agents/references/whiteboard-integration.md`
  - **参考资料整理（2026-10-06）**：原先由用户提供的 `migrated-project-design.md` 实为 **Excalidraw 官方仓库完整导出**（14.5 MB / 36 万行，含全量源码与 locale），并非本项目设计文档，已删除以免污染检索。其中唯一有约束力的两份文档已抽为独立参考：
    - `.agents/references/excalidraw-migration-guide.md`（16.5 KB）= 官方 `MIGRATION_GUIDE.md`，11 节，讲 Excalidraw 架构、包依赖图、集成面、陷阱
    - `.agents/references/excalidraw-vue-integration.md`（5.1 KB）= 官方 `TARGET_INTEGRATION_VUE.md`，讲 Vue↔React 桥接（onMounted + createRoot / onBeforeUnmount + unmount、非零高度、懒加载）
    - 两份文档与 `whiteboard-integration.md` **无架构级冲突**（官方"路线 A"即本项目"自托管"）；细节差异与待裁决项已在本轮分析中列出

### 11. 时间字段与分组联动（2026-10-06）
- `aiImporter.js` 的 `buildDocHtml` 新增渲染 `time` 字段（富文本顶部显示「时间：xxx」）
- `LayerListPanel.vue` 分组下拉变更时 `emit('filter-group')`
- `BaseMapTool.vue` 新增 `handleFilterGroup`：选中分组时地图只显示该分组的图形（仅切 Leaflet 挂载状态，不动数据）
- 定位查找与信息栏改为默认折叠（`initialCollapsed`）

---

