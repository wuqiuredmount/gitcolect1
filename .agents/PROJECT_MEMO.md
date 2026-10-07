# 项目记忆与上下文交接（PROJECT_MEMO）

> **用途**：DeepSeek 网页版上下文有限、会话可能中断。
> 本文件是**跨会话的唯一权威记忆**。新会话开始时，AI 必须先读它。
> **每轮对话结束前，AI 必须更新本文件的「数据现状」与「待办」两节。**

最后更新：2026-10-07（**第 19 轮：缺陷 1 · 第 1 步 E1 已实施（消灭裸写）**。
**① `elementSync.js` `finalizeRestore`（原 `:762-773`）删掉裸写** ——
原 `if (revived>0||rebuilt>0) await saveBoard({...scene})` **不传 baseUpdatedAt** ⇒ 绕过 CAS
（`boardStore.js:88`）⇒ 构成**不可逆 + 静默**的数据丢失链（`missing` 分支不写库 → 库没变 →
白板 `onBeforeUnmount` 乐观写**基线匹配 → 写入成功** → 旧快照带 `isDeleted=true` 回灌 →
元素永久消失而 UI 显示「恢复成功」）。现在本函数**只算 scene、不落库**。
**② 关键发现（DeepSeek §二-2 未预见的第二处）**：`RecycleBinModal.restoreWhiteboardScene` 是
restore 的**另一条调用路径** —— `notifyWhiteboardRefresh()` 只调 `window.__wbRefreshHook()`
**不传参**，`refreshDataFromDB` 是「**重新从库读**」型入口 ⇒ **拿不到** restore 算出的 scene。
故 **必须由 `RecycleBinModal` 自己权威写**（新增 `persistRestoredScene`：
先 `getBoard()` 取全量 → 不传 base 的权威写；⚠️ 必须先 getBoard，因 `saveBoard` 的
`appState: board.appState||{}` **无 existing 兜底**，只传 scene 会清空 appState），
且**调序为「先写库 → 再 notify」**（反了会让白板用旧 scene 覆盖库 → 恢复白费）。
**正向收益**：恢复不再依赖「白板正开着」/ 消灭「库变基线不变」窗口 / appState 不清空。
✅ 验证：逻辑测试 **11/11**（旧行为丢链复现 3 + E1 修复 3 + 对照组 1 + appState 3 + 白板未开 1）
+ `npm run build` ✅ 1.86s（注释补充后复验 2.32s）；临时脚本已清理；全仓已无「非权威 + 不传 base」的裸写。
✅ **E1 契约已写入代码**（防后人加回）：`finalizeRestore` 末尾注释 + `restoreRecycledElements`
的 JSDoc + `RecycleBinModal.restoreWhiteboardScene` 内的完整丢失链推导与调序理由。
⏳ 待裁决 4 项：① 第二处改动是否认可 ② 未使用 `saveBoard` import 保留/删 ③ `_persisted` 命名
④ 等用户实测后进第 2 步 D）
✅ **第 19 轮裁决已全部通过**（19-2 回执）：① 第二处调用路径认可 ② `RecycleBinModal` 自主权威写认可
③ 调序认可 ④ `saveBoard` import **保留** ⑤ `_persisted` 命名认可。**E1 已定稿，不再改动。**
📋 **DeepSeek 要求把用户实测清单写进报告**（已写入 `to-deepseek.md` §十，8 步：
画2→删1→切走切回(1/1/1)→恢复→**立刻切走切回**→(2/2/0)→**再刷新页面仍为 2**）。
⇒ **下一步：等用户按清单实测并回报 → 通过后进第 2 步 D。**

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

## 一、项目概况

- **名称**：app100-multifunction（良件-空间信息共享与集成）
- **技术栈**：Vue 3 + Vite 8 + Vue Router 4 + Leaflet 1.9 + Electron
- **数据层**：每工具一库的 IndexedDB
  - 库名：`LiangJian_Tool_CC / CM / WM / CS / PM / EH`
  - 表：annotations / documents / projects / meta / assets / recyclebin / fingerprints
  - 版本：**v3**（v2 加 recyclebin，v3 加 fingerprints）
- **核心工具**：鹰眼公共平台 `geo-eagle-eye`，数据统一存 `legacy-file` 区
- **协作通道**：AI 通过 webcode 直接读写本地 VS Code 工作区

---

## 二、协作硬性约定（每次必须遵守）

1. **只追加，不改既有逻辑**（除非用户明确要求改动）
2. **改代码必须返回完整文件代码**（工作区 skill：`代码修改返还完整代码`）
3. **高德额度零消耗**——坐标由采集阶段提供，导入器不调 geocode
4. **图片用文本链接（外链 URL）**，不用 base64、不下载文件。Wikimedia 已被封锁，改用国内可访问图源或留空
5. **IndexedDB 不换存储系统**
6. **AI 无法直接写浏览器 IndexedDB**，只能通过指令文件间接操作
7. 语言：中文；风格：直接给结果，少铺垫
8. **Token 分层约定**（2026-10-06 新增）：
   - Cline 侧常驻规则只放 `.clinerules/00-index.md`（薄索引），大段正文一律外置
   - 通用验证命令集中在 `.agents/references/common-verification.md`，各 skill 只引用不重写
   - skill 里不再重复 `.clinerules` 已有的横切约定，只写本技能专属内容

---

## 三、已完成功能

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

## 四、数据现状

- **5A 级景区：366 条**，11 个批次 `5a-batch-1~11.json`
- **4A 级景区：65 条**，3 个批次（batch-3 实为 14 条，2 条移入待处理库）
  - `4a-batch-1.json` 北京 35 条（2026-10-06，已导入）
  - `4a-batch-2.json` 天津 16 条（2026-10-06，待导入）
  - `4a-batch-3.json` 河北 14 条（石家庄 11 + 保定 3，2026-10-06，待导入；坐标由用户经高德坐标拾取器人工核验，GCJ-02，**精度为高德返回的两位小数近似值**）
- **待处理未放置信息库（2026-10-06 新增）**：`public/pending-unplaced/pending.json`
  - UI：顶栏「📥 待处理未放置信息库」按钮，位于「信息数据库」左侧；组件 `PendingUnplacedModal.vue`
  - 表格列：编号 / 名称 / 属地 / 预分组 / 未放置原因
  - 当前 2 条：紫云山风景区（高德返回北京密云坐标）、藤龙山风景区（高德返回邢台坐标）
  - 规则已写入 ai-import skill：查不到可信坐标的一律入此库，禁止用猜测值冒充
- **intro 字数约束（2026-10-06 新增）**：100-1000 字，AI 按景区分量自选。batch-1 的 35 条 intro 仅一句话，不符合新约束，如需统一需补写后重新导入（指纹去重会跳过，需先删旧数据）
- **新增分组（2026-10-06）**：
  - `11月全国运动赛会` 19 条（`sports-nov-batch-1.json`，已补 time 字段，待重导）
  - `贵州村超举办地` 12 条（`cunchao-batch-1.json`，待导入）
  - 分组无需手动创建，导入时按 `batchData.group` 自动建组（BaseMapTool.vue:563/1301）
- **多平台地理编码器（2026-10-06 新增）**：`src/groups/geo/utils/geocoder.js`
  - 高德额度耗尽自动降级 → 百度 → 天地图 → Nominatim
  - 额度状态存 localStorage，跨日自动重置；结果带缓存
  - 百度/天地图需在 localStorage 配 key：`geo_baidu_ak` / `geo_tianditu_tk`
  - 仅作采集兜底，导入器仍不调 geocode
- 分组：默认 / 5A级景区 / 中国4A级景区（后两个为面板预置）
- 官方口径 358 家，当前 366（含 8 条历史差异，名称表述不同）
- 鹰眼图形编码当前从 `EH.00435` 起（清库重建未归零，不影响功能）

---

## 五、踩过的坑（血泪教训，务必避免重犯）

1. **数据丢失事故**
   `InfoPanel.vue` 的 TDZ 报错（`createNewFormat` 在定义前被调用）
   → 组件树挂载失败 → 触发 `onDeactivated` → `forceAutoSave()`
   → 用**空数组全量覆盖** IndexedDB → 426 条永久丢失（不走回收站）
   - 已修：`hasLoadedOnce` 标志，数据未加载完禁止保存

2. **指纹失效导致全量重复导入**
   v3 指纹包含 address / fileId → 旧数据无 address
   → 新旧指纹不匹配 → 366 条全部重复（累积到 671 条）
   - 已修：v4 只保留稳定维度

3. **Vite HMR 陷阱**
   新增 `.js` 文件时热更新可能不生效，**必须 Ctrl+Shift+R 强制刷新**验证

4. **AI 声称改了但实际没改**
   调用 webcode 后要用 `search_code` 或看文件时间戳确认落盘

5. **IndexedDB 按域名隔离**
   在 DeepSeek 页面控制台读不到 localhost 的数据，必须在应用页面调试

10. **百度百科内嵌坐标已失效（2026-10-06 实测）**
   词条页不再内嵌 api.map.baidu.com/marker?location=LAT,LNG，iframe 提取流程取不到坐标。
   替代：高德坐标拾取器人工核验（GCJ-02）。Nominatim 本机不可达，百度/天地图需 key。
   教训：skill 里的采集方法要定期实测，不要假设一直有效。

11. **禁止用猜测值冒充已核验坐标**
   本轮曾生成一批坐标并贴「多源交叉核验」标签，实际未采集。此类行为违反数据真实性底线，
   查不到就入待处理库，绝不允许编造。


12. **`elementSync` 更新分支从不同步 `group`（架构级 bug，2026-10-06 修）**
    现象：白板里给元素改分组 → **会话内看着生效，重启/刷新后回到旧分组**。
    根因：`elementSync.js` 的 syncScene **只**在
      - 新增分支（`getElementGroup(element)`，约 :370）
      - `registerElement`（约 :466）
    这两处读 `customData.group`；**更新分支（约 :330-358）的 `next = {...prev, ...}` 里根本没有 group 字段**
    → 元素一旦登记过，此后改 `customData.group` 永远不会写回 `annotations.group`，
      库里恒为「首次登记时」的旧值。
    为什么必须修：用户目标是「白板元素和地图元素享受一样的待遇」。地图侧改分组走 forceAutoSave
    立即落库（见「三-5 分组编辑增强」），白板侧不落库 = 待遇不一致；且这类 bug **会跨会话复现**，
    不是一次性失误。
    修法（DeepSeek 裁决选 3：改 elementSync，而非「保持现状」/「面板侧多写一份库」）：
    条件 `if (moved || renamed || reshaped)` → 追加 `|| regrouped`；
    并先算 `currentGroup = getElementGroup(element)`、`regrouped = currentGroup !== prev.group`，
    在 next 里加 `group: regrouped ? currentGroup : prev.group`。
    指纹安全性（已逐行核实，不是推理）：`buildFingerprint` 的 payload 只有
    `[name, lat, lng, toolId, type]`（`src/groups/geo/utils/fingerprint.js:101`），**不含 group**
    → `regrouped` **必须不**进入下面 `if (moved || renamed)` 的注销/重登判定，否则会平白注销重登指纹
      （本项目指纹重建是危险动作，见坑 2）。
    配套教训：数据源修好后必须撤掉消费侧「覆盖层」。修复前曾在 `WhiteboardTool.vue` 加过
    `wbGroupOverride`(shallowRef Map) + `bumpWbGroupOverride` + `getEffectiveGroup`，
    用「画布值优先、库值兜底」绕开症状。库值一旦正确，这三件套立刻变成新隐患（两份真相、永不同步），
    已按裁决整体删除，`wbPanelLayers` 恢复直接读 `item.group`。
    可迁移的通用规律：「写入侧漏字段」这种 bug **极难被两端同时发现** ——
    读的一侧（面板）永远只看到旧值，很容易误判成「Vue 响应式/缓存问题」，进而去加缓存层把 bug 盖住。
    排查正解：**先列出该字段的所有写入点，再确认「我这条路径」是否在其中**。

### 13. `allowDelete` 判据混用两种语义 → 「删光元素」删除被静默吞掉（2026-10-07 修复）

    现象：白板里画元素 → 从图形列表删除 → **回收站里什么都没有**（形如「删除完全失效」）。
    根因：`WhiteboardTool.vue` 调用 `syncScene` 时传 `allowDelete: alive.length > 0`。
      这个判据把**两种完全相反**的情况混为一谈：
        · 首帧空回抛（**必须禁止删除**）：Excalidraw 还没消化 initialData，从未见过非空
        · 用户删光（**必须允许删除**）：之前必然见过非空，但此刻 `alive.length` 恰好也是 0
      ⇒ 后者被前者误伤：`allowDelete:false` → `elementSync` 的删除整块（`:253-296`）
        被静默跳过 → 不写回收站、不删富文本、不注销指纹 → 用户看到「删除无效」。
    修法（DeepSeek 裁决，一行）：判据改为 `firstNonEmptyChangeSeen` ——
      它是「Excalidraw 已消化完 initialData」的唯一可靠证明，与闸门③ 的置位语义天然一致：
        · 从未见过非空 → false → 不误删首帧 ✅
        · 用户删光     → true  → 正确归档 ✅
    ⚠️ 闸门③（`:320-334`）**必须保留原样**：它拦的是「`alive===0 && 基线>0 && 未见非空」，
      在 `allowDelete` 计算**之前**就 `return` 了 —— 是「调用都不到达」，比「传 false 进去」更强。
    可迁移规律：**用「当前状态量」（alive.length）去表达「历史是否发生过某事」（是否已初始化完成），
      必然在状态量回到初始值时出错。** 需要的是**单调的、只升不降的闩锁（latch）**，
      而不是一个会回落的瞬时计数。同类的还有「用 `elements.length>0` 判断是否加载完」
      「用 `list.size` 判断是否安装过」——凡「一旦为真就该永久为真」的语义，都要用 latch。

### 14. 降级「近似重建」只覆盖创建者字段子集 → 畸形元素毒死整个画布（2026-10-07 定位）

    现象：白板打开后**永久卡在「正在加载绘图...」**，元素有轮廓无图像、
      不能定位（`scrollToContent` 失效）、新元素不被记录。
      控制台一条 `TypeError`（`chunk-4FTI6OG3.js:1662`，实为 Excalidraw 内部子组件）。
    根因：`elementSync.js:577-608` 的**降级近似重建**路径
      （`restoreElementsToBoard` 的「情况 2」兜底：元素既不在 scene、`rawMap` 里也没有时）。
      它硬编码 **28 个字段，全部来自矩形模板**：
        id/type/x/y/width/height/angle/strokeColor/backgroundColor/fillStyle/
        strokeWidth/strokeStyle/roughness/opacity/groupIds/frameId/roundness/
        seed/version/versionNonce/isDeleted/boundElements/updated/link/locked/
        customData/name/_rebuiltFrom
      第 579 行 `type: String(layer.wbType || 'rectangle')` 只换了 `type`，
      **字段集仍是矩形的**。当 `wbType === 'text'` → 产出 `type:'text'` 却无
      `text`/`fontSize`/`fontFamily`/`textAlign`/`verticalAlign`/`containerId`/
      `originalText`/`lineHeight`/`baseline`（**9/9 全缺**）的**畸形元素**。
    因果链：畸形元素写入 `board.scene` → 下次打开进 `initialData.elements`
      → Excalidraw 渲染 → `renderText` 读 `element.fontFamily`/`element.text` = undefined
      → TypeError → **React error boundary 捕获 → 整个 Excalidraw 组件树不再更新**
      → 画布挂起，且「选中+Delete」「图形列表删除」两条 UI 路径**全失效**，用户无法自救。
    为什么只有 text 炸：矩形/椭圆/箭头缺字段时 Excalidraw 有宽松默认兜底；
      `text` 的 `renderText` **直接读** `fontFamily`/`text`，无兜底 → 必炸。
    为什么「偶尔」才撞上：`wbElementRaw` 补丁（`:545-552`）用删除时深拷贝原样塞回，
      **字段完整**，不走降级路径。只有「换过白板 / 手动清过画布 / 早期删除未留 raw」
      这类极端情况才落入 `:577`。⇒ **不是每次恢复都触发**。
    ⚠️ 附带排除：`getWbType`（`:152`）是 `` `wb-${element.type}` ``，
      而 `buildAnnotation`（`:193`）写的是 `wbType: element.type`（**裸类型**），
      故 `layer.wbType` 本就是 `'text'`，第 579 行取用**无误** —— 问题**只在字段集**。
    可迁移规律：**「按坐标近似重建」这类降级路径，必然只覆盖「创建者的字段子集」。**
      一旦被重建的元素类型 ≠ 降级模板的类型，就产出**类型与字段不符的畸形对象**。
      防御原则：① 降级重建**必须按 `type` 分派模板**；
      ② 做不到就**宁可拒绝重建**（报 missing），不产出半成品 ——
      因为半成品可能比「缺失」危害大得多（本例：一个坏元素毒死整块画布，用户连自救 UI 都没有）。
      更一般的：**「宁缺勿滥」在持久化数据上成立，在渲染数据上更成立。**

    ✅ **第 8 轮修复（A + C）**：
      · **A（治已知坏数据源）** `elementSync.js:662-748` —— 降级重建改为「先建 `rebuildBase`，
        再按 `wbType` 分派模板」：
          - `text` → 补全 9 个必需字段（`text`/`originalText`/`fontSize:20`/`fontFamily:1`/
            `textAlign:'left'`/`verticalAlign:'top'`/`containerId:null`/`lineHeight:1.25`/`baseline:0`）
          - `rectangle`/`ellipse`/`diamond` → 字段集同源，直接可用
          - `arrow`/`line` → 额外补 `points`（无兜底，缺则渲染异常）
          - `frame`/`image`/`embeddable`/`freedraw` → **拒绝重建**，落入 `missing`
            （半成品比缺失危害大，B 的简化版）
      · **C（长期防御，画布对坏元素免疫）** `elementSync.js:563-647` 新增校验器 +
        两层接线：
          - `validateElement(el)` / `filterBrokenElements(elements)`（新导出）
            必需字段表：`text→[text,fontFamily,fontSize]`、`image→[fileId]`、`frame→[children]`，
            共有字段 `id`/`type` 须非空字符串、`x`/`y` 须有限数值
          - **第 1 层** `WhiteboardTool.vue` 的 `sanitizeSceneFromDB()`：
            用于 `onMounted` 读 `board.scene` + 回收站恢复回写
          - **第 2 层** `ExcalidrawBoard.vue` 的 `toSafeElements()`：
            漏斗式收口，覆盖 `initialData` / `onApiReady` 重放 / `setScene` / `watch` **4 个出口**
            —— 未来任何新路径都绕不过（内部串联 `filterBrokenElements → sanitizeElements`）
          - 行为：残缺元素**内存剔除不送画布** + `console.warn` 列出 `id/type/缺字段`，
            **不写库、不删 annotations**（数据仍在信息数据库可见，用户可自行清理）
      · 离线验证：C 校验器 8 用例全过（含「畸形 text」识别 + 「空文本不误杀」）；
        A 重建产物 × C 校验器交叉验证 10 类型全通过（证明 A 修完后 C 不会再剔除 A 的产物）
      · **B（根治，排期）**：`wbElementRaw` 强制留档 —— 删除时若拿不到 raw 就不落回收站、
        结果报 `missing`，让降级路径**永不发生**。

### 15. 性能优化时「顺手加的 emit」可能触发更贵的全量重查（2026-10-07 第 11 轮）

**现象**：优化回收站时，我在 `watch(visible)` 里顺手加了 `emit('changed')`，
本意是「开窗即同步外部计数」。查接线才发现 `GisApp.vue:299`：
```
@changed="loadAllLayersFromDB"
```
而 `loadAllLayersFromDB()`（`GisApp.vue:576-589`）是：
```js
for (const tool of allToolsWithWhiteboard.value) {   // 7 库
  const layers = await getAllLayers(tool.id);
  for (const l of layers) {
    const docHtml = await getDocument(tool.id, l.fileId, l.id) || ...  // ← N+1 逐条查
  }
}
```
**「7 库 × N 图层 + 每图层一次 `getDocument`」的 N+1 全量重查** ——
比回收站本身慢得多。保留那句 emit = 「打开回收站 → 触发全量重查」，
**直接抵消整轮优化的收益**。

**教训**：
1. **加 `emit` 前必须先查「谁在监听、监听方做什么」**，不能凭「通知一下更安全」的直觉加。
   Vue 的 emit 是**同步触发父组件回调**，代价完全由监听方决定。
2. 性能优化类改动，**任何新增的副作用调用都要先估算监听方开销**。
3. 已删除该行 + 写注释锁死，防止后人「补全通知」时重新加回来。

**同类风险点（供后续排查）**：`emit('changed')` → `loadAllLayersFromDB()` 这条链路
在**任何**高频交互里都要谨慎（它是全局 N+1）。回收站里只在「用户实际增删后」才触发。

## 六、待办

### 🚀 第 11 轮：回收站性能 + P1（DeepSeek 已裁决，分两批）

**第一批：回收站性能** ✅ 代码完成，**待用户实测**
- [x] 方案 2：`loadItems()` 7 库串行 → `Promise.all` 并发（逐库 catch 兜底）
- [x] 方案 3：新增 `removeItemLocally()`，恢复/彻底删除/清空改**缓存局部更新**（不再全量重载）
- [x] 方案 4：`getBounds`/`getCanvas` 合并并发读
- [x] 开窗无条件 `loadItems()` + 「关键，勿删」注释
- [x] 顺带修 `handlePurge`/`handleClearAll` 漏 `emit('changed')`
- [ ] **⏳ 待用户实测**：①开窗变快 ②连恢复多条不卡 ③恢复后刷新列表正确
      ④彻底删除/清空后信息数据库正确刷新

- [x] ✅ **【第 16 轮已修】清理按钮 bug 1 + 判据改为 wbElementId 桥接**（DeepSeek 裁决）
      · bug 1：删掉 `if (ghosts.length === 0) return;` → **幽灵判据与回收站清理解耦**
        （幽灵=0 时**不写** board.scene，只清回收站残留）
      · 判据：`sceneIds.has(record.layer.wbElementId)` ← **不可用 annotationId 直比 scene[].id**
      · 保留策略：不在 scene → 真·已删 → **保留**；无桥接 id → **保守保留**
      · 逐条 `purgeFromRecycleBin(WB_TOOL_ID, r.fileId || safeFileId(), r.annotationId)`
        ⚠️ 该函数签名是 (toolId, fileId, annotationId)，**不是**传记录对象
      · 验证：逻辑测试 **10/10**（含反证：annotationId 方案识别出 0 条）
        + `npm run build` ✅ 1.74s
- [x] ✅ **【第 17 轮已实施】缺陷 2 修复：方案 T（乐观并发控制）+ F（按 canvasDirty 分流）**
      **`boardStore.js`**：`saveBoard(board, opts)` 加 `opts.baseUpdatedAt`
        · 不传 = 旧行为（**向后兼容**，其余调用方零修改）
        · 传了且 `existing.updatedAt !== base` → **拒绝写入** `{saved:false, reason:'stale'}`
        · 返回值改为 `{saved, reason?, updatedAt?}`（旧调用方忽略即可）
        · 🐛 **单调修订号**：`now = Math.max(Date.now(), (existing.updatedAt||0)+1)`
          ⚠️ 用 `Date.now()` 会**毫秒碰撞**（读写是两个独立 await 事务、中间无锁）
            → CAS 误判「没变过」→ 静默失效（实测复现，见 `_verify` t1 首跑失败）
      **`WhiteboardTool.vue`** 三件套：
        · `lastKnownUpdatedAt`（onMounted 读后 / 每次写成功后刷新）
        · `canvasDirty`（handleChange 置 true / runSync 成功后 false / refreshDataFromDB 后 false）
        · `saving` 进程内写互斥（**只放组件内，不放 boardStore**）
        · `sceneApplyLock` + `SCENE_APPLY_LOCK_MS=300`：排除 setScene 回灌时的 onChange 回抛
          ⚠️ **没有它 t1 是假的**：回抛 → canvasDirty=true → 走权威写 → 旧快照照样覆盖
        · `onBeforeUnmount` 分流：false → 乐观写(传base，可被拒) / true → 权威写(不传base)
        · 新增 `persistBoardAuthoritative(sceneOverride)`：**先 getBoard() 取完整记录再覆写**
          ⚠️ 不能只传 scene —— `saveBoard` 的 `appState: board.appState || {}` **无 existing 兜底**，
            只传 scene 会把 appState 清成 `{}`
        · `lastKnownUpdatedAt === undefined`（基线未知）+ 画布无改动 → **直接跳过写入**
          （否则乐观写退化成旧的无条件覆盖，修复失效）
      **`refreshDataFromDB`**：改为**先权威回写、再 setScene**（否则恢复路径只刷画布没写库
        → 「库已更新→乐观写被拒」机制**不成立**，t1 修不掉）
      验证：逻辑测试 **15/15** + `npm run build` ✅ 1.88s；`elementSync` 零改动
      待确认：① 单调修订号（边界外必要修补）② refreshDataFromDB 先写库 ③ 300ms 窗口
- [x] ✅ **【第 19 轮已完成】缺陷 1 · 第 1 步 E1：消灭裸写**

      **① `elementSync.js` `finalizeRestore`（原 `:762-773`）删掉裸写**：
      · 原来 `if (revived>0 || rebuilt>0) await saveBoard({...scene})` —— **不传 baseUpdatedAt**
        ⇒ 绕过 boardStore 的 CAS（`boardStore.js:88` `opts.baseUpdatedAt !== undefined && existing`）
      · 现在只 `result.scene = scene; return result;` —— **本函数只算 scene、不落库**
      · `saveBoard` 的 import（`:26`）**保留**（已注释说明；Vite 会 tree-shake，零风险）
      · ⚠️ 新增**契约**：任何调用方都必须自行持久化 `result.scene`

      **② `RecycleBinModal.vue`（DeepSeek §二-2 未预见的第二处）**：
      · **关键发现**：`refreshDataFromDB` 是「**重新从库读**」型入口，
        `notifyWhiteboardRefresh()` 只调 `window.__wbRefreshHook()` **不传参**
        ⇒ 它**拿不到** restore 在内存算出的 scene
        ⇒ 若只删 `elementSync` 的裸写而不改这里 → **恢复结果永远不落库**（恢复完全失效）
      · 新增 `persistRestoredScene(boardId, scene)`：先 `getBoard()` 取全量 → **权威写**（不传 base）
        ⚠️ 必须 `getBoard()` 兜底：`saveBoard` 的 `appState: board.appState || {}` **无 existing 兜底**，
          只传 scene 会把 appState 清成 `{}`
      · **调序：先写库 → 再 `notifyWhiteboardRefresh()`**
        ⚠️ 顺序不可反：先 notify 的话，白板读出【旧 scene】灌进画布、
          且其内部权威写会用旧 scene **覆盖库** → 恢复白费
      · `handleRecover` 增加 `_persisted.saved === false` 提示「⚠️ 场景落库未成功」
      · import 增加 `getBoard, saveBoard`

      **正向收益（顺带解决）**：
      · 恢复**不再依赖「白板正开着」**（白板未挂载时库也已正确）
      · 消灭「库变、基线不变」窗口 ⇒ `onBeforeUnmount` 乐观写正确被拒
      · `appState` 不再被清空

      **验证**：逻辑测试 **11/11**（含旧行为丢链复现 3 项 + E1 修复 3 项 + 对照组 1 项 +
        appState 3 项 + 白板未开 1 项）+ `npm run build` ✅ 1.86s；临时脚本已清理
      **全仓 saveBoard 调用点**：已无「非权威 + 不传 base」的裸写 ✅

      ⏳ 待裁决 4 项：① 第二处改动是否认可 ② 未使用 import 保留/删 ③ `_persisted` 命名 ④ 进第 2 步 D

- [ ] 📐【下轮·第 2 步 D】**缺陷 1 本体：让 scene 收敛**（等用户实测 E1 后再做）
      `runSync` 删除分支（`elementSync.js:260-295`）在 `saveAllLayers` 之后，
      把**已成功入档**的 `elementId` 从 `board.scene` 剔除
      ⚠️ ① **只在 `moveToRecycleBin` 成功后剔除**（现有 `catch {}` 吞错 → 剔了=数据凭空消失）
      ⚠️ ② **不只过滤 isDeleted**，只剔本轮确认已入档的（<800ms 防抖窗内未同步的不能动，
        否则下次 `runSync` 找不到它、`rawById` 取不到）
      ⚠️ 情况 1 代码（`:532-541`）**保留** —— D 之后它自然失效、无输入（零成本兼容层）

- [ ] 📐【第 3 步】**军规哨兵**：`finalizeRestore` 的 `result.missing` 必须**可见**
      （warn + 在 `refreshDataFromDB` 上报），让「老数据恢复不了」从静默变成有声


- [x] ✅ **【第 18 轮已交付设计·已获裁决通过】缺陷 1 修法 = G 方案（E1 + D + 情况 2 军规）**

      🔑 **三条「读代码后修正认知」的事实**（第 18 轮核出，推翻我自己的旧判断）：
      1. **`wbElementRaw` 每次删除都必然有值**（我上轮说「可能缺失」是错的）
         · `elementSync.js:265-266` `rawById` 由**当前 scene 全量**建立
         · `:281` `moveToRecycleBin(..., rawById.get(elementId) || null)`
         · 删除只打 `isDeleted` 标记、**不物理移除** → 元素必然还在 `list` 里 → 必然命中
         · ⇒ 「老记录无 raw」只指**补丁上线前**的历史记录（本轮清理的 2 条就是）
         · ⇒ **情况 2 从此「除历史遗留外永远可靠」**
      2. **畸形 text 不是「情况 1 物理移除」造成的**（修正 MEMO 坑#14 的成因叙述）
         · `finalizeRestore` 降级重建（`:650-760`）**就在 `restoreElementsToBoard` 内部**
         · ⇒ 情况 1 是它的**前置兄弟分支**，二者**互不干扰**
         · ⇒ **删掉情况 1 不会让降级路径变多** → 「情况 2 替代情况 1」**零新增风险**
      3. **CAS 拦不住 `finalizeRestore` 的裸写**（`elementSync.js:764` 不传 baseUpdatedAt）
         · 实测时间窗：乐观写(CAS) **全偏移都拒**（0/1/50/199/200/201/500/1500ms）
         · 裸写在 **全偏移都回灌**
         · ⇒ 上轮我说「0ms 是漏洞」= **悲观误判，已撤回**（单调修订号已解决）
         · ⇒ 但**裸写必须消灭，否则 T 方案正确性不闭合**

      ⚠️ **危害 1（唯一致命）= 不可逆 + 静默的数据丢失**：
      `finalizeRestore` 不写库的路径（`result.missing` 分支）+ 基线未变
      → 乐观写**匹配成功** → 旧快照带 `isDeleted=true` 覆盖 → 元素永久消失，
      且 UI 显示「恢复成功」⇒ **静默**。
      （注意：`revived>0 || rebuilt>0` 时会裸写 → 库变、基线不变 → 被拒；✅ 这条已被 T 修好。
        危险的是**不写库**的那条分支。）

      📋 **推荐 G 方案（三步，可独立验收）**：
      · **第 1 步 E1（优先级最高）**：`finalizeRestore` **不再写库**，只返回 `result.scene`；
        由 `refreshDataFromDB` 用**已有的 `persistBoardAuthoritative`** 统一权威写
        ⇒ 它是 restore 的**唯一**消费入口，且「先写库再 setScene」两动作在一起
        ⇒ **裸写漏洞从根上消失**
        （备选 E2 `bypassCas:true` 显式声明；E3 `writeEpoch` 不需要）
      · **第 2 步 D**：`runSync` 删除分支（`:260-295`）在 `saveAllLayers` 后，
        把**已成功入档**的 `elementId` 从 `board.scene` 剔除
        ⚠️ ① **只在入档成功后剔除**（`moveToRecycleBin` 抛错时 `catch{}` 吞掉 → 剔除=数据消失）
        ⚠️ ② **不只过滤 isDeleted**，只剔本轮已入档的（<800ms 防抖窗内未同步的不能动）
      · **第 3 步 军规哨兵**：`result.missing.length>0` 必须**可见**（warn + 上报），
        让「老数据恢复不了」从静默变成有声音

      ❌ **明确不做**：不动 `captureScene`（`:246`，策略不该写在通用桥接）·
        不做 C（物理移除，风险>收益）· 不做 B（载入即永久剔除 → **永久杀死**历史恢复能力）·
        不动 T / allowDelete / 闸门③ / A / C
      ✅ **情况 1 代码保留**（`:532-541`）—— 第 2 步后自然失效（无输入），
        留着是**零成本兼容层** ⇒ 目标是「让情况 2 承接主路径」，**不是「删掉情况 1」**

      🔎 **主动纠正上轮错误论断**：上轮我写「`restoreRecycledElements` 走情况 2 会静默丢文字」
        —— **是错的**。`elementSync.js:787-801` **明确构建了 `rawMap`** 并透传。
        全仓无一条路径丢 raw ⇒ 真正风险不是「丢 raw」，而是**「raw 缺失时静默降级」**
        （问题在**缺哨兵**，不在传递链）。

- [ ] ⏳ **【等用户确认】清理后三处一致**（画布 6 / 列表 6 / 回收站 0）
      DeepSeek §七：确认后才进下一任务

      `saveBoard(board, { baseUpdatedAt })` **乐观并发控制**
      · 核心：`saveBoard` 内部已 `await getBoard()` → `existing.updatedAt` 就是库版本
      · 调用方传「快照基于哪个版本」；库被别人改过 → **拒绝过期写入**
      · **权威写不传基线**（restoreElementsToBoard / 清理工具）→ 强制生效 → 不牺牲 T1 情况1
      · **乐观写传基线**（onBeforeUnmount 传 `lastKnownUpdatedAt`）→ 恢复后立刻关不再回灌
      · 覆盖 t1/t2/t3；**零新字段、零时间常量**（比 1.5s 保护窗硬）
      · 改动点：`boardStore.js` 一处 + `WhiteboardTool` 维护基线 + 进程内写互斥
      · 备选 **T+A+F**（A 快照比较 / F 脏标记，仅减 IO）；C 需时间常量不推荐
      · 待裁决：① 选哪个方案 ② 调用点改动是否批准 ③ 被拒写的边界取舍 (a)/(b)/(c) ④ 缺陷 1 是否一并做
- [x] ✅ **【第 16 轮已修】清理按钮 bug 1**（历史记录，详情见上方第 16 轮条目）
- [x] ✅ **【第 15 轮已解决】回收站 2 条记录的「活性」判定**（DeepSeek 用用户截图定案）
      **结论：那 2 条对应的元素确实活着**（在 annotations 里）
      → 病征 = 「**元素活着但回收站还有记录**」→ 可安全「彻底删除」
      → 判定脚本可省；第 16 轮已把判据落进临时清理工具（wbElementId 桥接）
- [x] 📌 **【第 15 轮已解决】bug 2 真身（目标状态选错）**：
      我的判据方向是「**scene 有、annotations 无**」（假幽灵），
      而病征是「**annotations 有、recyclebin 也有**」（回收站未清）→ **目标状态选错了**（第 16 轮已按裁决改为 wbElementId 桥接）
      ❗ 但修法**不能**照搬 DeepSeek §四：
        · 「物理移除」若用 `annotationId` 比 `scene[].id` → **恒不匹配，是 no-op**
        · 必须用 **`wbElementId`** 桥接（scene 存 nanoid，recyclebin 存 `WB.xxx`）
- [ ] 🚨 **【重要提醒】缺陷 2 不修，回收站脏数据会再生**：
      `onBeforeUnmount` 旧快照覆盖 board.scene → 元素回退成 isDeleted=true
      → 下次 runSync 又写一次回收站 → **清了还会再来**
      → **「清理完成」的判据必须包含「缺陷 2 已修」**
- [ ] 🧪 **【临时代码·待移除】白板「清理幽灵元素」按钮**（第 14 轮加，2026-10-07）


      `WhiteboardTool.vue`：状态栏按钮 + `handleCleanGhostElements` + `ghostCleaning` ref
      + 2 个导入（getAllLayers / clearRecycleBin）+ `.wb-btn-danger` 样式
      行为：读 board.scene → 与 annotations 的 id+wbElementId 双集合比对 → 找幽灵
      → **物理 filter 移除** → saveBoard 写回 → clearRecycleBin(WB) → refreshDataFromDB
      → **排查结束后必须整块移除**
- [x] ✅ **白板「画布 6 / 列表 4 / 回收站 2」根因已定案**（第 14 轮）
      🎯 **两个关键认知**：
      ① **`board.scene` 里的 id 是 Excalidraw nanoid，与 annotations 的 `WB.xxx` 不同源**
         —— 必须经 `wbElementId` 桥接比对（我上轮的「bound text」假设**已撤销**，用户是 6 个矩形）
      ② **`runSync` 从不写 `board.scene`**（只写 recyclebin/documents/annotations）
         → board.scene 落库只有两处：`onBeforeUnmount`(:855) 与 `restoreElementsToBoard`(:764)
      **真因（时序竞争）**：
      · t1 点恢复 → 情况1 擦 isDeleted → saveBoard(scene6) ✅ → refreshDataFromDB → setScene
      · t3 若 React **尚未消化 setScene** 时用户切走/刷新
        → `onBeforeUnmount` 取到**旧快照** → saveBoard(旧 scene) **覆盖** t1 的新数据 💥
      · 而 annotations/recyclebin 是即时写的、不被覆盖 → 三处失去统一
      **加重因素**：`captureScene`（excalidrawBridge.js:246-254）**不过滤 isDeleted=true**
        → 软删残留随每次关闭白板被反复持久化，**库永远清不掉**
- [ ] 🚨 **两个设计级缺陷待裁决（长期修法，勿擅自改）**：
      【缺陷 1】`isDeleted` 元素被持久化进 board.scene
        → 修法：写回前过滤；⚠️ **但会破坏 T1「情况 1」精确还原**
          （情况1 正是依赖「isDeleted 元素还在 scene 里」）→ **必须先补替代路径**
      【缺陷 2】`onBeforeUnmount` 用画布实时快照而非已落库的权威数据
        → 修法：版本化比较写入，或 refreshDataFromDB 后加 ~1.5s 保护窗
      → **两项均属「改既有逻辑」，等 DeepSeek 裁决**

      `WhiteboardTool.vue` L395-405：`refreshRegisteredList()` 末尾加 `if (window.__WB_MONITOR__)`
      打印 6 元素 wbX/wbY/wbW/wbH/lat/lng。**零逻辑改动**，开关默认关。
      → **6 元素排查结束后必须整块移除**（DeepSeek 已认可为临时代码）
- [ ] 🔍 **白板「画布 4 个 / 登记 6 个」排查**（进行中，观察阶段，禁止急着修/清）

**第二批：P1（AI 批量导入 + 富文本）** —— 等第一批实测 + 6元素排查收尾后开工

- [x] **P1.0 `node.type` 判断点清单已交付**（第 12 轮，只读）→ 见 `to-deepseek.md`
      结论：**传 `wb-*` 可行，无需映射裸 type**。全文件仅 4 处判断：
      · **L22** `node.type !== 'marker'` → 传 `wb-*` 走 true（样式面板内，被 hideStylePanel 覆盖）
      · **L27/L31** `=== 'polygon'||'rectangle'||'circle'||'ellipse'` → 传 `wb-*` 走 **false**
        （填充色/透明度控件不显示；仅当将来开放样式编辑才需映射）
      · **L102** `{{ node.type }}` 纯展示 → 会显示「wb-rectangle」
      ⚠️ L22 是 `v-if`/`v-else` 二选一，传 `wb-*` 会落入 **v-else（20 种地图图标）**分支
        → **`hideStylePanel` 必须用 `v-if` 整块移除，不能用 `v-show`**，否则白板元素会看到地图图标选择器
      ✅ **`docHtml` 路径完全不依赖 type**：`documentStore.js` 主键是 `${fileId}_${annotationId}`，
         `type` 从不参与 → `WB.00012` 编号正常存取，无需适配
- [ ] **⏳ 等 DeepSeek 确认第 12 轮 4 项问题**：
      ① 传 `wb-*` + `hideStylePanel`（v-if）是否同意
      ② `node.lat/lng` 的 `v-if` 收紧为双非空（**防 `undefined.toFixed` 崩面板**）是否批准
         —— 这是第 12 轮新发现的**真实风险**：白板元素 lat/lng 由 `canvasToLatLng` 反算，
         混合来源时可能只算出一个 → 现有 `v-if="node.lat"` **没挡 lng**
      ③ L102 显示内容是否改（改属「改既有逻辑」）
      ④ 选择回调用方案 X（复用 `onChange` + `appState.selectedElementIds`，零新增接口）
         还是方案 Y（新增 prop）
- [ ] P1.1 新建 `src/groups/whiteboard/utils/recordToElement.js`
      · 裁决 2：坐标语义选 **A（按 bounds 换算）**，`bounds` 缺失 → **拒绝导入 + 告警**（不做 B 兜底）
      · 裁决 3：统一生成 **`text` 元素**，三条防护：
        ① 复用 A 方案 **9 个 text 字段一个不少**（否则重演坑#14 毒元素）
        ② 生成后过 C 方案 `validateElement` 自检，不通过**拒绝写入 + 告警**
        ③ 打标记 `customData.fromAiImport: true`
- [ ] P1.2 `WhiteboardTool.vue` 挂 `AiImportPanel` + `handleWbAiImported`
      · 用 `inline` 内联在 `.wb-toolbar`，**不要照抄地图侧的 `Teleport to="#tool-header-slot"`**（白板无此 slot）
      · `toolId = WB_TOOL_ID`，`fileId` 用缺省 `'legacy-file'`
      · ⚠️ `setScene` 是**整体替换** → 必须 `当前 scene + 新元素` 合并
      · ⚠️ 导入元素**无 `wbElementRaw`** → 靠 `onChange → syncScene` 正常登记，**不要走恢复路径**
- [ ] P1.3 `ExcalidrawBoard.vue` 加 `onSelectionChange` 透出（裁决 4：白板自己的组件，允许）
- [ ] P1.4 `WhiteboardTool.vue` 挂 `MarkerDocPanel` + 加 `hideStylePanel` 显式 prop
- [ ] **P1.5（改进，非首版）**：AI 导入可选生成矩形/图形，而非全是 text（首版求简单稳）

### 🔜 施工顺序（用户已定，2026-10-06，按序推进）
- [x] **第 0 步：修「新画元素不被登记」bug —— ✅ 用户已验证生效**
      正确根因（**前两轮误判已作废**）：`canvasReady` 绑在 `api-ready` 上，
      但 `onExcalidrawAPI` 从未触发 → 守卫永远 false → 元素从不登记。
      修复内容见「三-0」的「🩹 白板主 bug 修复」+「🚨 闸门③」。
      ⚠️ `allowDelete` 门控曾于第 0 步在调用侧加 `alive.length > 0` 前置条件，
      **该条件已于第 6 轮证伪并改为 `firstNonEmptyChangeSeen`**（见坑#13）。
      ✅ 用户实测：状态栏「元素 1 · 已登记 1」、信息数据库出现 **WB.00012**。
- [x] **第 0.5 步：三项收尾（2026-10-06 完成，均已实测）**
      - [x] **残留① 字体 404**：`/gis/fonts/` → 已修为按协议分流（http 取 origin /
            file 取目录），实测 `/gis/fonts/` 请求 **0** 次。
      - [x] **残留② 问题 2**：根因 = prop 名应为 **`excalidrawAPI`**（非 `onExcalidrawAPI`），
            已修复；实测 `"should be a function!"` **0** 次。
      - [x] **残留③ 诊断日志分级**：`[诊断-API]` 全清；`[诊断-HT]` 24 条 →
            保留 3 条关键（canvasReady 打开 / 闸门③拦截 / onMounted 异常），
            其余降 `console.debug` 或删除；调试期临时兜底路径（api 数据替换 payload）已删。
      ✅ 验证：断言 **89/89** + `npm run build` 通过 + Electron/http 双模式运行时实测通过。
- [x] **待用户实测（两个场景）—— 用户已确认通过**（画矩形→登记；反复画删→不被误拦）
- [x] **问题 2：`onExcalidrawAPI` 为何从不触发 —— ✅ 已定位并修复，探针已清理**
      结论：**0.18.1 的 prop 名是 `excalidrawAPI`**，旧代码传 `onExcalidrawAPI`（0.17 旧名）
      → Excalidraw 只打一句 `excalidrawAPI should be a function!` 并跳过注入。
      详见「三-0」的「✅ 问题 2 根因修复」。
- [x] **第 2 步（P0 界面）—— 块 1/2/3/4 已完工 + 第 5 轮架构级修复，`npm run build` 通过，待用户实测三链**
      交付物：
      - 块 1：`LayerListPanel.vue` 加 `hideWindowHint` prop（默认 false，**纯增量**，
        不影响地图侧 8 个工具；唯一真实挂载点是 `BaseMapTool.vue:65`）
      - 块 2：新建 `src/groups/whiteboard/WhiteboardPanels.vue`（薄包装，90 行）
        · 图形列表 → `Teleport` 到 `#tool-header-slot`（与地图同一挂载点）
        · 信息栏 → 留工具内容区做浮层（InfoPanel 根节点就是 MapPanel，单根不能 Teleport）
      - 块 3：`WhiteboardTool.vue` 模板插入 `<WhiteboardPanels>`，
        **插入点 = `.wb-canvas-wrap` 内、与 `v-if="boardReady"` 同级**。
        🚨 关键：`.wb-canvas-wrap{position:relative}` 是最近的 positioned 祖先，
        MapPanel 非 inline 是 `position:absolute` → 只有放这里信息栏才落「画布左下角」。
        放 `.whiteboard-tool` 直接子级（无 position）会让包含块上溯到 GisApp 的
        `.tool-content`（position:relative + **overflow:hidden**）→ 既跑位又可能被裁。
        与 v-if 同级还能让 Teleport 不被 `boardReady` 延后。
      - 块 4：`WhiteboardTool.vue` script 新增
        `wbPanelLayers` / `wbPanelGroups` computed、`syncSelectedToInfoPanel`（画布点选→信息栏）、
        `whiteboardLocate`（列表→画布）、`handleWbUpdateGroup`（改 `customData.group`）、
        `handleWbDeleteElement`（**只打 `isDeleted` 标记**）、`handleWbLayerUpdate` / `noop` 系列。
      - **第 5 轮（核心修复）**：`elementSync.js` 更新分支补 `group` 同步（详见坑 #12）
        + 删除 `WhiteboardTool.vue` 的 `wbGroupOverride` 三件套（库值已正确，覆盖层成新隐患）。
      ✅ `npm run build` 通过
- [ ] **第 2 步实测（三条链，用户执行）** —— 第 5 轮修完后的验收
      - 链 A（删除/恢复，上轮失灵的）：画矩形 → 列表删除 → 回收站能看到 → 点恢复 → 元素回到画布
      - 链 B（改组，本轮关键）：列表改组 → 立刻显示新组 + 下拉出现新组 → **刷新后仍在新组**
      - 链 C（点选联动）：画布点选任一图形 → 左下角信息栏自动选中
- [ ] **第 2 步续：filter-group 选项 3**（DeepSeek 裁决：必须等上面三条链实测通过后才动）
      做法：`WhiteboardTool` 在把数据传给面板前先过滤 `wbPanelLayers`，
      **零改动面板本体**（避免影响地图侧）
- [ ] **遗留待办**：评估「字段级容错」是否值得保留
      （它现已证明与主 bug 无关；若无必要建议回退，避免留无用复杂度）
- [ ] **第 3 步（P1）**
- [ ] **第 4 步（P2）**

### 🧪【临时调试】用完必删清单（2026-10-07，TypeError 应急）

> 背景：画布因残缺元素渲染崩溃后，用户无法通过 UI 删除元素，故加了应急清空按钮。
> 用户清完 WB.00023/24 后**立即执行以下 4 项删除**（`grep -n '临时调试'` 定位全部 11 处标记）。

- [ ] **删①** 模板 `<button class="wb-btn wb-btn-debug" …>` 整块（含上方注释块）
- [ ] **删②** 脚本 `handleTempDebugClear` 函数 + `const debugClearing = ref(false)`（含上方大段注释）
- [ ] **删③** 样式 `.wb-btn-debug` / `.wb-btn-debug:hover` 两条
- [ ] **删④** 导入 `import { clearAllLayers } from '../geo/utils/annotationStore.js';`
- [ ] 删完 `grep -n '临时调试' src/groups/whiteboard/WhiteboardTool.vue` 应返回 **0 条**
- [ ] 删完 `npm run build` 必须通过

### ⏸️ 待 DeepSeek 裁决：TypeError 正式修法（2026-10-07，根因已确认）

> 根因见「五-14」。

- [x] **候选 A（最小）✅ 第 8 轮已完成**：降级重建按 `wbType` 分派模板
      —— text 补全 9 个必需字段；rect/ellipse/diamond 直接用；
      arrow/line 补 `points`；frame/image/embeddable/freedraw **拒绝重建**（落入 missing）
- [x] **候选 C（防御）✅ 第 8 轮已完成**：`validateElement` / `filterBrokenElements` 校验器
      + 两层接线（`WhiteboardTool.sanitizeSceneFromDB` + `ExcalidrawBoard.toSafeElements`）
- [ ] **候选 B（根治）⏸️ 已排期**：`wbElementRaw` **强制留档** —— 删除时若拿不到 raw 就不落回收站、
      结果报 `missing`，让降级路径**永不发生**
- [ ] ⚠️ 待 DeepSeek 裁决：A 中 `arrow`/`line` 我**额外补了 `points`**（原文只说「保持现有模板」），
      若认为应严格保持原样，可回退这两行
- [ ] ⚠️ 第 6 轮 A1~A4 删除链实测**须在清空坏数据之后**进行（画布已崩则删除链根本跑不到）

### ✅ 第 8 轮实测指引（C 生效后应可直接打开画布）

- [ ] **直接打开白板** —— 画布应正常显示，不再卡「正在加载绘图...」
- [ ] **看控制台** —— 应出现 `[白板] 🛡️ 已隔离 N 个残缺元素` + 逐个 `id/type/缺字段`
      （★ 预期会列出 WB.00023/24 对应元素）
- [ ] **从信息数据库删除 WB.00023/24** —— 走正常 UI 路径，**不需要**临时按钮
- [ ] 若画布**仍卡住** → 说明还有 C 未覆盖的崩溃源，把 `[白板] 🛡️` 日志 + 新 TypeError 堆栈发给 DeepSeek



> 前置：`npm run build` 已过（1.43s）。以下 4 项 AI 无法执行（MEMO 硬约定 #6），须用户实测。

- [ ] **实测 A1**：画 1 个 → 从图形列表删除 → 等 2 秒 → 打开回收站 → **应该有 1 条**
- [ ] **实测 A2**：画 2 个 → 删 1 个（剩 1 个）→ 回收站**应该有 1 条**
- [ ] **实测 A3（★本轮关键）**：画 2 个 → **删光** → 回收站**应该有 2 条**
      （这是旧 `allowDelete` 判据唯一漏掉的场景；若此项仍为空 → 说明还有第二处阻塞）
- [ ] **实测 A4（防回归）**：打开白板**不做任何操作** → 信息数据库条数**不该变**
      （验证闸门③ 仍拦得住首帧空回抛，没被本轮改动破坏）
- [ ] **恢复往返**：从回收站恢复 A3 的元素 → 关闭白板重开 → 元素**仍在**（验证 `wbElementRaw` 入档未失效）
- [ ] 控制台观察：场景 A3 **不应**出现 `[诊断-HT] 闸门③拦截`；
      应出现 `[elementSync] 白板元素软删除完成：2 个`

### 🚧 待用户实测（白板时序竞态 + 字体，2026-10-06）
- [ ] **实测 1（核心）**：回收站「恢复」白板元素 → **关闭白板再重新打开**（或刷新）
      → 元素**仍在**，控制台**不得**出现 `[elementSync] 白板元素软删除完成`
- [ ] **实测 2**：反复刷新 3 次，信息数据库条数不变、回收站无新增重复记录
- [ ] **实测 3（字体）**：白板中输入**中英文**文字，Excalifont（英文）与 Xiaolai（中文）
      均正常渲染；控制台无 `Failed to fetch font family` / woff2 404
- [ ] **实测 4（反向，防过度修复）**：手动删一个已登记元素 → 刷新 → 该元素**确实**
      进了回收站（不能因为加守卫把正常删除也拦掉）
- [ ] 若实测仍误删 → 按 MEMO 坑#16 末段排查 `sanitizeElements`（excalidrawBridge.js:57-70）


- [x] 采集通道恢复：Edge 调试实例 + edge-devtools（2026-10-06）
- [x] 4A 采集方案定型：百度百科 iframe 渲染后提取内嵌百度地图坐标，零高德消耗（2026-10-06）
- [x] 4A 北京首批 35 条已生成 `4a-batch-1.json` 并登记 manifest（2026-10-06，已导入）
- [x] 4A 天津 16 条已生成 `4a-batch-2.json`（2026-10-06，待导入）
- [x] 新建分组 `11月全国运动赛会` 19 条 `sports-nov-batch-1.json`（2026-10-06，待导入）
- [x] 新建分组 `贵州村超举办地` 12 条 `cunchao-batch-1.json`（2026-10-06，待导入）
- [x] 多平台地理编码器上线：`src/groups/geo/utils/geocoder.js`，高德→百度→天地图→Nominatim 自动降级（2026-10-06，build 通过）
- [x] 面板固定顶栏：MapPanel 加 inline 模式，三个面板 Teleport 到顶栏（2026-10-06，build 通过）
- [x] 新增设计 skill：`.agents/skills/geo-panel-ui-design/SKILL.md`（2026-10-06）
- [x] 赛事批次补 time 字段：19 条全部填写（2026-10-06，需删除旧数据后重导）
- [x] 分组联动地图显示：选中分组只显示该组图形（2026-10-06，build 通过）
- [x] 修复分组过滤导致图形跑位：改为始终通过 editableLayers 容器增删（2026-10-06）
- [x] 定位查找与信息栏默认折叠（2026-10-06）
- [x] 新增时间判断强制规则：写入 ai-import skill（2026-10-06）
- [x] AI 批量导入面板默认折叠（2026-10-06）
- [x] `matchLayers` 新增 group 分组匹配能力（2026-10-06，build 通过）
- [x] 生成删除指令 `delete-sports-nov.json`：按 group 删除「11月全国运动赛会」（2026-10-06，待用户执行）
- [x] 新增热点信息分组：鹰眼打开只渲染热点，每组随机 2-3 个，上限 49（2026-10-06，build 通过）
- [x] 多 AI 协作骨架落地：协作协议 + 分片目录 + 三采集员端口配置（2026-10-06）
- [x] 海量数据性能优化：分块加载 + 60 条显示窗口 + 30 秒轮换 + 图标缓存 + markRaw（2026-10-06，build 通过）
- [ ] 大数据量实测：导入万级数据验证流畅度
- [ ] 启动采集员实例（9223/9224/9225）并试跑一个片区
- [ ] 用户执行删除指令后，重新导入 `sports-nov-batch-1.json` 以显示 time 字段
- [ ] 百度/天地图 key 未配置：如需启用降级，在应用控制台执行 `localStorage.setItem('geo_baidu_ak','...')` 或 `localStorage.setItem('geo_tianditu_tk','...')`
- [ ] 赛事数据可继续扩量：11 月全国还有多项赛事未收录（如各地马拉松、单项锦标赛）
- [ ] 4A 继续扩量：全国 3000+ 家，分省分批，每批 4-6 家用 iframe 采集，写入 `4a-batch-N.json`
      - 已完成：北京 35、天津 16、河北 16（2026-10-06）
- [x] 4a-batch-3.json 坐标核验：用户经高德坐标拾取器人工核验（2026-10-06）
- [x] 待处理未放置信息库上线：数据文件 + 组件 + 顶栏入口 + skill 规则（2026-10-06，build 通过）
- [ ] 4a-batch-2.json 天津 16 条待导入
- [ ] 4a-batch-3.json 河北 14 条待导入
- [ ] 待处理库 2 条（紫云山、藤龙山）待补可信坐标后转正
- [ ] 紫云山：需从河北省文旅厅或景区官方渠道获取坐标
- [ ] 藤龙山：高德疑似同名误匹配，需人工在拾取器确认正确点位
      - 天津待补：天津之眼、天塔、极地海洋公园、精武门、萨马兰奇纪念馆、宝成博物苑、南湖、团泊湖、水高庄园、杨柳青庄园、瓷房子、天津港文旅区（词条无坐标或未收录）
- [ ] batch-1 的 35 条 intro 需补写到 100 字以上（当前仅一句话）
- [ ] 图片源待定：Wikimedia 不可用，暂留空，后续换国内可访问图床
- [ ] 部分景区百科词条无坐标（龙潭公园/北京动物园/什刹海/石景山游乐园/雁栖湖/龙庆峡），需单独处理
- [ ] 可选：重置图形编号（当前从 EH.00435 起）
- [x] 已把本文件包成 skill：`.agents/skills/项目上下文续接/SKILL.md`（2026-10-06 完成）
- [x] 新建 `.clinerules/00-index.md`：Cline 常驻薄索引，触发式加载 + 硬约定（2026-10-06 完成）
- [x] skill 去重：抽取 `.agents/references/common-verification.md`，import 与 recycle 两个 skill 移除重复验证命令与横切约定（2026-10-06 完成）
- [ ] 可选：把 `代码修改返还完整代码` skill 与 `.clinerules` 的重复表述进一步合并
- [x] 第三产品（Excalidraw Whiteboard +数据信息）**6 项施工任务全部完成**（2026-10-06，见
      `.agents/references/whiteboard-autonomous-plan.md` 勾选状态，共 4 次 commit）：
      - [x] 任务1 全登记：无名元素用 `element.id` 兜底参与指纹（17/17 断言通过）
      - [x] 任务2 字体自托管：`public/excalidraw-fonts/`（9 族 234 文件 12.5MB，含中文 Xiaolai）
      - [x] 任务3 懒加载：主包 739KB 无 React；excalidraw chunk 4805KB 点开才加载
      - [x] 任务4 R4：实测 0.18.1 **无 scrollConstraints**，改用读时归一化（8/8 断言通过）
      - [x] 任务5 `WhiteboardTool.vue` 主组件落地
      - [x] 任务6 富文本组件核实：确认为 `MarkerDocPanel.vue`（BaseMapTool.vue:92 挂载）
- [ ] 白板端到端实测（需在浏览器/Electron 手动验证，AI 无法直接操作 IndexedDB）：
      画未命名矩形 → 信息数据库可见 → 点开有富文本 → 删除进回收站可恢复 → 反复刷新不重复
- [x] 白板 BUG 修复 **T1**：恢复时同步还原元素到 scene（断「恢复后被自动删除第二遍」隐性循环）
      - `elementSync.js` 新增 `restoreElementsToBoard()` / `restoreRecycledElements()`
      - `WhiteboardTool.vue` `refreshDataFromDB` 增加 `boardRef.setScene()` 回灌画布 + 注册
        `window.__wbRefreshHook`（供回收站跨组件调用，不改 GisApp ref 传递链）
      - 20/20 逻辑断言通过（含「防过度修复」「幂等性」反向用例）（2026-10-06，build 通过）
- [x] 白板 BUG 修复 **T2**：回收站恢复补齐 scene 回写
      - `RecycleBinModal.vue` `handleRecover` 新增第 3 步 `restoreWhiteboardScene(item)`
      - 地图元素无 `wbElementId` → 自动跳过，地图行为零影响（2026-10-06，build 通过）
- [x] 补丁（用户裁决①）：`moveToRecycleBin` 第 5 参数 `wbElementRaw`
      - 删除时深拷贝原始 Excalidraw 元素；恢复时精确还原，避免「带文字的框恢复后文字丢失」
      - 无 raw 老记录降级近似重建（几何可恢复，元素带 `_rebuiltFrom: 'coordinate'` 标记）
      - 体积代价已写入代码注释（0.5–2 KB/元素，带文字容器 3–6 KB，可接受）
- [ ] ⏸️ 白板修复 **T3+T4**（面板）——**等用户确认 T1/T2 实测通过后再开工**
- [ ] T1/T2 端到端实测脚本（用户手动执行）：
      1. 白板画一个**带文字的矩形** → 2. 删除 → 3. 回收站点「恢复」
      → 4. 回到白板：元素与文字都在（提示「画布已精确还原」）
      → 5. **反复刷新 3 次**：信息数据库条数不变、回收站不新增、画布不重复
      → 6. 反向验证：删除后**不恢复**，刷新后仍应在回收站（不能过度修复）

---

## 七、每轮对话结束前 AI 必做

1. 更新本文件「四、数据现状」与「六、待办」
2. 若有新的踩坑，补进「五」
3. 确认所有改动已 `npm run build` 通过
