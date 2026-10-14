# 项目记忆与上下文交接（PROJECT_MEMO）

> **用途**：DeepSeek 网页版上下文有限、会话可能中断。
> 本文件是**跨会话的唯一权威记忆**。新会话开始时，AI 必须先读它。
> **每轮对话结束前，AI 必须更新本文件的「数据现状」与「待办」两节。**

---

## 🚦 当前状态速览（2026-10-08）

**阶段：白板功能区 95% 完成，进入维护 + 增量迭代期。**

| 板块 | 状态 |
|---|---|
| 地图工具组（geo / card） | ✅ 稳定 |
| 白板数据层（编号 / 指纹 / 坐标 / 回收站 / 信息数据库） | ✅ 通 |
| 白板 P0（图形列表 + 信息栏 + 选中联动） | ✅ 通 |
| 白板 P1-A（AI 批量导入） | ✅ 已实现（用户暂未使用） |
| 白板 P1-B（富文本详情，复用 MarkerDocPanel） | ✅ 通 |
| 白板 P2（回到中心点） | ✅ 通（其他 P2 目标封存） |
| 首页（三入口 + 版权 + MIT 协议页脚） | ✅ 通 |

**架构参考**：结构速查见 `.agents/references/architecture-map.md`。
**待用户实测**：P1-B 的 6 步（画 / 填 / 刷新 / 切元素 / 切地图 / 点空白）。

---

最后更新：2026-10-09（**第 29 轮：接入第三个协作 AI —— Codex 桌面端（Codex-Desktop）**。
**① 接入**：新建双信箱 `.agents/mailbox/to-desktop-ai.md`（DeepSeek→它）/ `to-deepseek-desktop.md`（它→DeepSeek），
沿用「双读单写·绝对排他 + 覆盖式 + 无事也须回执」同一套协议；
它自建常驻规则 `.agents/codex-desktop/00-index.md`（薄索引，显式加载）。
**② 身份**：客户端实为 **Codex 桌面端**（包 `OpenAI.Codex`，签名 `OpenAI OpCo, LLC`，微软 EV CA 签发，Store 来源），
模型 **GPT-5**；署名定 `Codex-Desktop`。用户曾告「ChatGPT 桌面端 + DeepSeek 模型」，已据实更正。
**③ 三问裁决**：不建仓库根 `AGENTS.md`（防跨 AI 规则串扰）；署名改 `Codex-Desktop`；§三·补 新增 §7 留档。
**④ 权限现状**：文件操作免审；命令执行需一次审批。
**⑤ 清理**：删除本轮排查用 4 个 `scripts/tmp-*.ps1`。
**⑥ 新增坑 #18**：跨 AI 共享自动加载文件会造成规则串扰，新参与者走独立目录 + 显式加载。）

> **历史（第 28 轮：修复 AI 批量导入「中断即永久缺失」+ 逐文件认领**。
**① 现象**：4173 图形列表 620，5173 是 640，差 20 条。
**② 取证**：manifest 27 文件 = **640 条（完整值）**；缺口正好 = `wuhan-flexible-labor-batch-1.json`（20 条），
自然排序**排在最后**。三窗口 IndexedDB 因独立 `user-data-dir` + 端口不同（origin 不同）而**完全隔离**。
**③ 根因（第 27 轮引入的回归）**：上一版 `runImportAllFiles` 在**循环前预认领全部 27 个文件**
（为防重复导入），但循环未跑完时页面被刷新 ⇒ **归档已写、数据未导**
⇒ `pendingFiles` 为空 ⇒ **永不补跑**；
`healOrphanArchive` 阈值 `归档数×5 = 135`，620 ≥ 135 ⇒ 自愈也不触发 ⇒ 静默永久缺失 20 条。
**④ 修复**：改为**逐文件认领**（每个文件 `runImport` 成功后立即 `markFilesImported([fname])`）
⇒ 中断后未完成文件仍未归档 ⇒ 下次启动自动补跑；重复由 `importAiBatch` 指纹去重兜底。
失败项本就未归档 ⇒ 原「回滚」逻辑一并退役。另加 `runImportAllFiles` **函数级重入保护**
（防「指纹查询 → 指纹登记」竞态窗口导致同批双插）。
**⑤ 验证**：watch 重建 1507ms 通过（新 chunk `index-Cjj5QzWa.js`）。
**⑥ 待用户执行**：4173 刷新 → 打开 AI 面板 → 点「历史文件导入库」的**重置** →
自动补跑 27 个文件（26 个被指纹去重跳过，wuhan 20 条补入）⇒ 应变为 **640**。
**⑦ 新增坑 #17**（「预认领」反模式：把「防重复」与「可补跑」做成互斥）。）

> **历史（第 27 轮：内测预览 4173 保留内部工具（AI 批量导入面板）**。
**① 用户诉求**：4173（preview）也要有「AI批量导入」窗口，且启动时默认加载未导入信息。
**② 根因**：`npm run share` 走 `build:release`（`--mode release`）→ 加载 `.env.release` →
`INTERNAL_TOOLS=false` → `BaseMapTool.showAiImportPanel` 恒 false（`BaseMapTool.vue:181`）；
且 `vite.config.js` 的 `stripInternalAfterBuild` 会把 `dist/ai-import` 整个删掉
⇒ 面板即使挂载也读不到 manifest。
**③ 改法（2 文件，零 `src/` 改动）**：新增 `share:internal` 脚本（`vite build --watch` 普通模式，
保留内部工具与 ai-import 数据）；`scripts/dev-workspace.ps1` 的 4173 窗口改用它。
`share` 保持 release 语义不变（对外分享仍安全）。
**④ 「启动默认加载未导入信息」已具备**：`AiImportPanel.vue` `onMounted → maybeAutoImportAll()`
面板一挂载即自动渐进导入待导入文件（含 `healOrphanArchive` 自愈 + `markFilesImported` 预认领防重入）。
⇒ 本轮**未改面板代码**，只需让面板在 4173 可见。
**⑤ 验证**：4173 重启后构建 1790ms 通过、**无 `🔒 [release] 已自动剔除` 日志**（确认非 release）；
`/ai-import/manifest.json` HTTP 200（737 B）；`dist/ai-import/` 与 `manifest.json` 均在；
打包 JS（`index-*.js` / `WhiteboardTool-*.js`）含「AI批量导入」字样。
**⑥ 遗留**：`GisApp.vue:50` 的「待处理未放置信息库」按钮**未加 `INTERNAL_TOOLS` 守卫**
（弹窗本体 `:296/305` 有守卫）⇒ release 下按钮可见但点击无反应，已记待办。）

> **历史（第 26 轮：mailbox 协作机制启用留档 + 补录脚本线进展**。
**① 本轮为纯文档改动（任务 A），未动 `src/` 一行、未跑 build。**
**② 新增「三·补、协作机制现状」小节**（见 §三 之后），留档 mailbox 双信箱机制与监控机制。
**③ 补录「四、数据现状」脚本线进展**（自动化信息脚本第 1~3 轮，含漫展 18 条）。）

> **历史（第 25 轮：P1-B 两处修正（字体 + 去技术ID/空白默认）+ P2（回到中心点）**。
**① 按 DeepSeek 信箱指令直接实施，未出方案；两批各自 commit。**
**② 批 1（修正，commit `e5d9490`，4 文件 +157/-43）**：
- **字体**：`MarkerDocPanel.vue` 的 `.doc-panel` / `.doc-editor`（含 `*`）/ `.title-input`
  三处**显式写死** `'Segoe UI','Microsoft YaHei',sans-serif`（与 `GisApp.vue:840` 同栈）。
  根因：`.doc-editor` 原先**完全没设** font-family，白板侧挂在 Excalidraw 宿主内
  → 继承 Excalidraw 注入的字体；地图侧继承 GisApp → 两侧不一致。
- **去技术 ID + 空白默认**（显示层空 vs 指纹层兜底）：
  `elementSync.buildAnnotation` 的 `title/objectName` 改为**只存用户填写值（匿名=空串）**；
  element.id 兜底挪到**临时字段 `__fpName`**，仅供 `buildFingerprint` 读取，
  落库前经 `stripTransientFields` 剥除（**绝不进 IndexedDB**）；
  `buildDefaultDocHtml` 恒返回 `''`；`syncScene` 更新分支 `renamed` 改用 `getCustomName`
  比对并**直接赋值**（不再 `|| prev` 兜底，否则清空名称永远删不掉）；
  UI 兜底「未命名 / 未命名图形」替代原 `item.id` 显示（WhiteboardTool 两处 + LayerListPanel）。
  ⚠️ 未动 `fingerprint.js` 一行、未动 elementSync 删除/更新主体逻辑（符合约束）。
- **验证**：build `2.01s` 通过 + `node` 直跑 `buildFingerprint` **6/6 断言通过**
  （匿名有效 / 漏喂 name 无效 / 命名有效 / 跨轮稳定 / 移动变化 / 兜底≡显式同名）。
**③ 批 2（P2 回到中心点，commit `9229ea6`，2 文件 +65）**：
`ExcalidrawBoard.centerToContent(elements?)`（过滤 `isDeleted` 软删除元素；空场景 **返回 false 不滚动**；
调 `api.scrollToContent(alive,{fitToViewport:true,animate:true})`）+ `defineExpose`；
`WhiteboardTool` 状态栏加按钮 + `handleBackToCenter`（api 未就绪静默返回）。
**已逐字核对 0.18.1 类型声明**：`App.d.ts:335` `target?: string|Element|readonly Element[]`
且 opts 联合的第二支含 `fitToViewport?: boolean` + `animate?: boolean` ⇒ 用法合法。
**④ 验证**：build `2.13s` 通过。**⏳ 待用户实测（建议 5 步，见 mailbox）。**）

> **历史（第 24 轮：P1-B 完成（画布点选 → 富文本面板）**。
**① 按 DeepSeek 信箱指令直接实施，未出方案**（用户当前最需要的功能）。
**② 3 文件 +140/-4，commit `39526ea`**：
`MarkerDocPanel.vue` 加 `hideStylePanel` prop（默认 false，地图 6 工具调用点零改动）；
`ExcalidrawBoard.vue` emit `selection-change`（**我另补 `lastSelectionSig` 签名去重**，
否则 onChange 每帧都 emit → 面板反复重挂）；
`WhiteboardTool.vue` 挂 `<MarkerDocPanel>`（`.wb-canvas-wrap` 内、与 `boardReady` 同级，
靠祖先 `position:relative` 自动落成右上角浮层）+ 3 个 handler。
**③ 关键约束落实**：`node.id` = annotation id（WB.xxx，与 documents 表同源）、
`node.type` = annotation.type（wb- 前缀）、反查走 `wbElementId` 桥接、存储路径零改动。
**④ 验证**：build `2.62s` 通过。**⑤ 新增认知**：`selectedElementIds` 取消选中是**置 false 不删键**
⇒ 必须 `filter(k => sel[k])`；白板编辑器「清空选中」与信息栏不同，**必须关面板**。
**⏳ 待用户实测 P1-B（6 步）。**）

> **历史（第 23 轮：P1-A 完成（AI 批量导入），commit `77df0ac`，DeepSeek 已确认保留代码）**：
**① DeepSeek 已裁决**：D（缺陷 1）9/9 通过保留；`captureUpdate` **不补**（R5 只针对
`mutateElement` 原地改场景，D 是整数组替换，且 `applyScene:261` 同款不传也正常）；
**缺陷 1（`isDeleted` 持久化）标「已知限制，不影响功能」，不再修**。
**② 新增 `recordToElement.js`**（annotation → Excalidraw `text` 元素）：
A 方案 9 字段 + 28 共有字段**同源复用**；生成后 `validateElement` 自检，不过返回 `null`；
`latLngToCanvas` 换算，`bounds`/`canvas` 非法即 `null`；`customData.fromAiImport: true`。
**③ `WhiteboardTool.vue` 挂 `AiImportPanel`(inline+懒加载)** + 顶栏开关 + `handleWbAiImported`
（读回 annotations → 过滤无 `wbElementId` → `recordToElement` → `setScene([...当前,...新])` → `rebuildIdMap` → 立即 `syncNow`）。
**④ 验证**：build `1.84s` 通过；`recordToElement` 逻辑 **36/36**（含 300 轮脏数据反证：毒元素 0）；
commit `77df0ac`。**⑤ 新增坑#16**（测试替身必须对照源码）。**⏳ 待用户实测 P1-A。**）

> **历史（第 19 轮 · 缺陷 1 第 1 步 E1，已定稿不再改动，commit `7f3f7a5`）**：
> `elementSync.js` `finalizeRestore` 删掉**裸写**（原 `if (revived>0||rebuilt>0) await saveBoard({...scene})`
> **不传 `baseUpdatedAt`** ⇒ 绕过 CAS ⇒ 构成「不可逆 + 静默」丢失链：
> `missing` 分支不写库 → 库没变 → 白板 `onBeforeUnmount` 乐观写**基线匹配 → 写入成功**
> → 旧快照带 `isDeleted=true` 回灌 → 元素永久消失而 UI 显示「恢复成功」）。现本函数**只算 scene、不落库**。
> **第二处调用路径**：`RecycleBinModal.restoreWhiteboardScene`（`notifyWhiteboardRefresh()` 只调
> `window.__wbRefreshHook()` **不传参**，`refreshDataFromDB` 是「重新从库读」型入口 ⇒ 拿不到 scene）
> ⇒ 必须由 `RecycleBinModal` **自己权威写**（`persistRestoredScene`：先 `getBoard()` 取全量
> —— 因 `saveBoard` 的 `appState: board.appState||{}` 无 existing 兜底，只传 scene 会清空 appState
> —— 再**不传 base 的权威写**），且调序为「**先写库 → 再 notify**」。
> 验证：逻辑测试 11/11 + build ✅；**用户 8 步实测全过** ⇒ **静默丢失链已切断**。

📐 **【第 20 轮已交付】第 2 步 D 方案（零源码改动）** → `to-deepseek.md`
  改动点：`elementSync.js` `syncScene` `:296` 之后（`allowDelete` 门控内、`for` 循环外）
  · **承 `allowDelete` 门控之内** ⇒ `allowDelete:false` 时 D 自动不执行 ✅
  5 问作答：
   ① 位置 = `:296` 后（不能在 for 内 / 不能早于 `:266 rawById` 建立）
   ② 判「入档成功」：`moveToRecycleBin` 的**静默早退 `return undefined`** 与
      `resolve(undefined)` **返回值相同** ⇒ 只判 try/catch 不够（会把早退误判成功 → 剔除=数据消失）
      ⇒ 推荐 **D-b**：不改 `recycleStore.js`，用 `getRecycled(toolId, fileId, annotationId)`
        **回读确认**（已核实 `:70-80` 签名与提案一致，返回完整 record 含 `wbElementRaw`）
        ⇒ 一次读同时解决「入档成功」+「raw 是否存在」两个判定 ✅
   ③ 收集集：**不复用 `removedIds`**（它存 annotationId 且是「四步全做」语义）
      ⇒ 新建 `archivedElementIds`（存 elementId）；**约束②「800ms 防抖窗内不动」自动满足**
        （`deletedElementIds` = idMap 键 − alive，防抖窗内新元素不在 idMap ⇒ 天然不动）
        ⇒ 真正的风险是**后人写 blanket `filter(e => !e.isDeleted)`**，必须注释写死禁止
   ④ **不写库**（D 内立刻写 = 重新长出裸写 = 反向）—— 现有落库时机已带上剔除结果
      ⚠️ **但必须改 `runSync:440`**：`canvasDirty` 无条件 false ⇒ 卸载走乐观写 ⇒
         **剔除结果被旧快照抹掉 ⇒ D 白做** ⇒ 需 `syncScene` 返回 `result.pruned`，
         `runSync` 改 `canvasDirty = (result.pruned||0) > 0`（**跨文件，必要非可选**）
   ⑤ 情况 1「自然失效」推理 ✅ 成立（5 环逐条核验）—— 但补一条边界：
      `recycleStore.js:38-44` `wbElementRaw` **深拷贝失败仍 put** ⇒ 入档"成功"但 raw 缺失 ⇒
      剔除后恢复会**降级重建**（MEMO 坑#14 风险）⇒ 建议 **D 只在「完整成功（含 raw）」时剔除**
  ⏳ **待裁决 4 项**：① D-a（改共用 `recycleStore.js`）vs **D-b（推荐）**
     ② 是否允许跨文件改 `syncScene` 返回值 + `runSync:440`（不许则 D 白做）
     ③ raw 缺失算不算入档成功（建议**不算**）④ 第 12 轮 P1 四问仍待答复

📐 **【第 21 轮已交付】D「修正后」方案（零源码改动）** → `to-deepseek.md`
  ✅ 收到 4 裁决：① **D-b 认可** ③ **raw 缺失不算成功·认可** ④ `canvasDirty` 必须**累积式**
  ⚠️ **② 命中我的真实错误**：我原说「在 `syncScene` 里剔除 `board.scene`」= **错的**。
    核实 `syncScene(:230)` 是**纯数据层函数**：只能拿 `elements/idMap/bounds/fileId`，
    **拿不到 `boardRef`（画布 API），也拿不到 `board.scene`（在 boardStore）**
    ⇒ 剔库(A)=写库自相矛盾；剔参数(B)=不影响画布；**只有 C（返回 id 集合，runSync 用 API 剔）可行**
  🔑 **我补的语义（DeepSeek 只说"可行"，我核出"为什么唯一正确"）**：
    库=「历史存档」（含 isDeleted 残留，正是缺陷 1 现场）；画布=「当前事实」。
    D 语义 =「让**画布**与回收站收敛」，**不是「让库收敛」** ⇒ 库收敛由既有落库时机自然完成
  ✅ **修正 1**：`prunedIds` 改 **id 数组**（非数字）；`result:239` 增 `prunedIds: []`
  ✅ **修正 2**：`canvasDirty` 改**累积式**（`if (prunedIds.length) canvasDirty = true`）
    其隐患场景已复现确认：第 2 次 onChange→runSync `prunedIds=[]` → 覆盖式会刷 false
    ⇒ 切走走乐观写 ⇒ 剔除被抹掉 ⇒ D 白做。语义「**落库才清脏、同步只标脏**」
  ✅ **剔画布 API（已核实）**：`ExcalidrawBoard:130` 已 expose `getApi()` ⇒
    用 `getApi().updateScene({ elements: filtered })`（与 `applyScene:261` 同用法，项目已验证）
    · 弃 `setScene()`（会一并重放 appState + 全量净化，过重）
    · 从 **`api.getSceneElements()` 实况**过滤（非 `list` 入口快照）→ 避免误删并发新增
    · `updateScene` 会回抛 onChange ⇒ 再触发一次防抖 runSync（`prunedIds=[]` 自然收敛）
      ⇒ **两条修正互相咬合，缺一不可**
  📋 改动清单 **8 处 / 2 文件**；验证计划 T1~T8（**T7 = 其隐患场景核心断言**）+ 6 步实测
  ✅ 边界承诺：不碰 `captureScene` / `recycleStore.js`（D-b 核心优势）/ T / E1 / 门控 / 闸门③ / A / C
  📌 已答复 §三 · L102 = 右侧信息栏「已登记元素」标题，待裁决保留或重构（我倾向**保留**）
  ⏳ **待确认 3 项**：① 认可我的错误+C 语义 ② 用 `getApi()` 还是新增 `removeElementsById`
     ③ 批准 8 处改动 → **批准后立即实施 + build + 跑 T1~T8**

✅（第 20 轮遗留）第 12 轮 P1 四问：DeepSeek 已**简答**（hideStylePanel 用显式 prop / lat-lng 用 v-if 可 /
  L102 待我先说明 / onSelectionChange 加在 ExcalidrawBoard 允许），**正式答复下轮给**。

## 📁 施工轮存档（第 5~25 轮）

📁 **详见** `.agents/PROJECT_MEMO_ARCHIVE.md` §一「施工轮存档」。


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

## 三、已完成功能（索引）

> 📁 **详情见** `.agents/PROJECT_MEMO_ARCHIVE.md` §二「已完成功能」。以下为速查索引。

| # | 功能 | 关键落点 |
|---|---|---|
| 0 | 白板（Excalidraw）目标与进度 | 见「当前状态速览」+ `architecture-map.md` §四 |
| 1 | AI 批量导入系统 | `AiImportPanel.vue` / `aiImporter.js` |
| 2 | 信息回收站 | `RecycleBinModal.vue` / `recycleStore.js` / `aiDataCommand.js` |
| 3 | 指纹系统 v4 | `fingerprint.js` / `fingerprintStore.js` |
| 4 | 导入归档腾空 | `importHistory.js`（meta 键 `imported_ai_files`）|
| 5 | 分组编辑增强 | `LayerListPanel.vue`（AI 删除权限开关 + **分组改名**，2026-10-07 commit `2f83e4b`）|
| 6 | AI 删除权限落地 | `aiDataCommand.js`（白名单约束）|
| 7 | 界面滚动修复 | `InfoDatabase.vue` / `RecycleBinModal.vue` |
| 8 | 面板固定顶栏（inline 模式）| `MapPanel.vue`；详见 skill `geo-panel-ui-design` |
| 9 | 层叠上下文修复 | `.tool-content` isolation + z-index；详见 skill |
| 10 | 热点信息分组 | `enableHotspot`；localStorage `geo_hotspot_layer_ids`；**刷新按钮按当前下拉分组刷新**（2026-10-07）|
| 11 | 时间字段与分组联动 | `aiImporter.buildDocHtml` + `BaseMapTool.handleFilterGroup` |
| 12 | 多 AI 协作骨架 | `.agents/references/multi-ai-collab.md` |
| 13 | 海量数据性能优化 | `layerScheduler.js`（分块 + 60 条窗口 + 30 秒轮换）|
| 14.6 | 自动化信息脚本 | `.agents/skills/auto-info-script/`（SKILL.md 宪法 + RULES.md 动态规则，RULES 免审批进化）；触发词「执行自动化信息脚本」（2026-10-07 commit `fb608d6`）|
| 14.5 | 富文本点赞/倒赞 | `reactionStore.js` + `MarkerDocPanel.vue`；每打开一次各限1次；meta 表 key `graphic:{fileId}_{annotationId}`（2026-10-07 commit `335bf08`）|
| 14 | 第三产品入口（白板）| 已从「占位」→「完整功能区」；见 architecture-map §四 |

---

## 三·补、协作机制现状（2026-10-07 建立并启用）

> **用途**：AI 之间无法直接对话，靠「读对方留下的文件」协作。本节留档该机制的构成与规则，
> 供新会话快速定位；**详细协议以 `.agents/references/ai-mailbox-protocol.md` 为准**。

### 1. mailbox 双信箱机制

| 信箱 | 方向 | 唯一写入者（OWNER） | 只读者 |
|---|---|---|---|
| `.agents/mailbox/to-cline.md` | DeepSeek → Cline | **DeepSeek** | Cline |
| `.agents/mailbox/to-deepseek.md` | Cline → DeepSeek | **Cline** | DeepSeek |

- **命名规则**：`to-<收件人>.md`（写给谁，谁就是收件人）。
- **覆盖式铁律**：两个信箱都**只留本轮**、整篇覆盖，**绝不累积**；历史交给 git 保存。
  （教训来源：`to-deepseek.md` 曾累积 29909 字节 / 3+ 轮历史，严重浪费 token。）

### 2. 权限模型：双读单写 · 绝对排他

- **双向可读**：两个信箱双方都可以读，可读性不受限。
- **单写排他**：每个信箱**有且只有一个写入者**，任何一方**都不得修改对方信箱的任何字符**
  （含加标记、删空行、改标点）。唯一例外：OWNER 本人可自由覆盖自己的信箱。
- **违规处理**：发现对方信箱被非 OWNER 修改 → 立即报告用户，并用 git 恢复。
- **落点**：Cline 侧已写死为常驻规则 `.clinerules/00-index.md` **硬约定第 0.5 条**
  （commit `d2f4338`）。

### 3. 三层身份标识

| 层 | 机制 | 位置 |
|---|---|---|
| ① 所有权头（静态） | HTML 注释块声明 `OWNER` / `READER` / 禁止修改 | 每个信箱文件**顶部** 5 行 |
| ② 写入署名（动态） | `【写入者】<OWNER名>　【时间】YYYY-MM-DD HH:MM　【轮次】第 N 轮` | 每次写入，正文标题下固定一行 |
| ③ 已读回执（走自己信箱） | 收件人**不去对方文件打标记**，改为**在自己下次写入时**开头声明 `【已读】<对方文件> 第 N 轮` | 自己信箱正文开头 |

### 4. 回执规则（2026-10-07 补充）

**读了对方信、即使无新任务，也必须写一行简短回执**：

    【已读】to-cline.md 第 N 轮，无新任务

**原因**：曾出现「读消息但没写盘」→ DeepSeek 侧看不到 → 误判为「未落盘 / 卡住」。
⇒ **沉默 = 没收到**，必须显式回执（哪怕一行）。

### 5. 监控机制（DeepSeek 视角 · 基于磁盘事实）

- **文档**：`.agents/references/cline-monitor.md`
- **命令**：`npm run watch-cline -- snapshot` / `-- diff`（脚本 `scripts/watch-cline.mjs`）
- **核心原则**：**不信任界面，只信任磁盘。**
- **五个监控指标**：活性（进程/任务目录时间戳）、产出（`to-deepseek.md` 时间戳与大小）、
  越界（`git diff` 检查 `to-cline.md` 是否零改动）、副作用（`git status` 是否与报告一致）、
  健康（后端 API 探测）。
- **定位**：mailbox = 通信**内容**（靠自觉）；监控 = 通信**事实**（靠核验）。两者互补。

### 6. 机制建立时间线

- `2026-10-07` 建立双信箱 + 协议文档（`ai-mailbox-protocol.md`）
- `2026-10-07` 通信测试轮：**读取 → 执行 → 回执** 三环闭环验证通过，机制正式启用
- `2026-10-07` 修正协议 §三 两处过时表述（commit `3ca9850`）+ Cline 常驻规则同步修正
  （commit `d2f4338`）
- `2026-10-07` 新增监控机制（commit `3374790`）+ 接入工作流（commit `821451a`）

### 7. 第三个参与者：Codex 桌面端（2026-10-09 接入）

**身份**：客户端 = **Codex 桌面端**（包 `OpenAI.Codex`，签名 `OpenAI OpCo, LLC`，微软 EV CA 签发，Store 来源）；
模型 = **GPT-5**。**署名 `Codex-Desktop`**。

**信箱（独立，不与 Cline 共用）**：

| 信箱 | 方向 | OWNER | READER |
|---|---|---|---|
| `.agents/mailbox/to-desktop-ai.md` | DeepSeek → 它 | **DeepSeek** | Codex-Desktop |
| `.agents/mailbox/to-deepseek-desktop.md` | 它 → DeepSeek | **Codex-Desktop** | DeepSeek |

**常驻规则**：`.agents/codex-desktop/00-index.md`（薄索引，显式加载）。

**裁决（三问）**：① **不建**仓库根 `AGENTS.md`（会被 Cline 也自动识别 ⇒ 跨 AI 规则串扰）；
② 署名 `Codex-Desktop`；③ 本节留档。

**权限现状**：文件操作免审（已验证读写 MEMO / mailbox）；命令执行需一次审批（其侧报沙箱 shell 失败）。

**接入教训（坑 #19）**：跨 AI 共享的自动加载文件（仓库根 `AGENTS.md` 同时被 Cline / Codex 识别）
会造成规则串扰 ⇒ 新参与者一律走**独立目录 + 显式加载**（`.agents/<participant>/`），不共用根文件。

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
- **2025英雄联盟世界赛（2026-10-07 新增）**：3 条，`public/ai-import/s15-worlds-venues.json`
  - S15 全球总决赛三城场馆：北京智慧电竞赛事中心（入围赛/瑞士轮，10.14-25）、
    上海梅赛德斯-奔驰文化中心（八强/半决赛，10.28-11.2）、成都东安湖体育公园多功能体育馆（总决赛，11.9）
  - 坐标：高德拾取器 GCJ-02，游客模式两位小数（同 4a-batch-3 口径）；time 字段已填齐
  - commit `41b06ff`，manifest 已登记（第 20 条）
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

### 自动化信息脚本线（`auto-info-script`，2026-10-07 起）

> 触发词「执行自动化信息脚本」；宪法 `SKILL.md` + 动态规则 `RULES.md`（RULES 免审批进化）。
> 链路已脚本化：`extract（列表页→草稿）→ build（编码→契约→写入）`，全程 2 条命令。

- **第 1 轮**：2026年10月全国马拉松，12 条 → `marathon-oct-2026.json`
- **第 2 轮**：2026年11月全国马拉松，18 条 → `marathon-nov-2026.json`
- **第 3 轮**：漫展三组，共 **18 条**（2026-10-07，commit `3a40544`）
  - 全国10月漫展 14 条 → `cartoon-oct-2026.json`
  - 全国12月漫展 3 条 → `cartoon-dec-2026.json`
  - 2027全国1月漫展 1 条 → `cartoon-jan-2027.json`
  - 坐标**全部经高德 geocode，0 待处理**；按宪法「宁缺勿滥」未硬凑（12月/1月未到宣发期）
- **基础设施**：`scripts/collect/`（`npm run collect`）、`scripts/collect/extract.mjs`
  （`npm run extract`）、`scripts/crawl/`、`scripts/sync-map.mjs`、`scripts/watch-cline.mjs`
- **参考**：`.agents/references/sites.md`（信息源清单）、`optimization-roadmap.md`
  （优化清单 **18/18 全部达成**）、`cline-monitor.md`（监控）
- **⚠️ 已知坑**：`collect` 默认用 group 中文名做文件名 → 需手动 `--out` 指定 ASCII 名
  （待改为默认 transliterate 或强制 `--out`）
- **待办**：12月/1月漫展临近宣发期（约 11-12 月）再补采

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

### 17. 「预认领」反模式：把「防重复」与「可补跑」做成了互斥（2026-10-08 第 28 轮）

**现象**：4173 图形列表 620 条，5173 是 640 条，**永久差 20 条**，且刷新多少次都不会补上。

**根因**：`AiImportPanel.runImportAllFiles` 为修「重复导入」曾改为
**循环开始前先 `markFilesImported(targets)` 预认领全部文件**。
该做法在「跑完」时正确，但一旦**循环中途被打断**（页面刷新 / 关闭 / HMR 重挂载）：

    归档表 = 已写 27 个文件      ← 认领已落盘
    实际数据 = 只导入 26 个文件  ← 循环没跑完
    ⇒ pendingFiles = 全量 − 已归档 = 空
    ⇒ 缺失的那 1 个文件**永远不在待导入清单里**
    ⇒ 既不会自动补跑，用户也无法手动重试（面板上根本看不到它）

更隐蔽的是：`healOrphanArchive`（数据丢失自愈）的阈值是 `归档文件数 × 5`，
本例 `27 × 5 = 135`，而实际有 620 条 ⇒ **远高于阈值，自愈不触发**
⇒ 缺失被**完全静默**地永久保留。

**为什么这是个「反模式」而非「实现 bug」**：
「预认领」把两件本不冲突的事做成了**互斥**：

| 目标 | 预认领的后果 |
|---|---|
| 防重复导入 | ✅ 达成 |
| 中断后可补跑 | ❌ **被牺牲**（中断 = 永久丢失） |

而项目**本来就有**更强的去重机制：`importAiBatch` 基于指纹索引
（`findExistingFingerprints`）做幂等去重，重复条目会被计入 `duplicated` 跳过。
⇒ **根本不需要用「认领」来防重复**。

**修法**：改为**逐文件认领** —— 每个文件导入成功后才 `markFilesImported([fname])`。

    中断时：已完成的文件已归档（不会重导）、未完成的未归档（下次自动补跑）✅
    重复风险：由指纹去重兜底 ✅
    失败项：本就未归档，无需「回滚」✅

**可迁移规律**：
1. **「批量任务的进度标记」必须与「实际完成量」同步推进，不能提前一次性置位。**
   预置型的「认领 / 锁定 / 占位」，一旦进程中断，就会把「未完成」伪装成「已完成」。
   同类反模式：「先全部标记为已处理，再逐个处理」。
2. **做防御前先确认「已有的防御够不够」。** 这里为了防重复而引入了更严重的「永久缺失」——
   而防重复的机制（指纹去重）**早就在下游存在**。
   ⇒ 加防御层前必须问：**这一层防的风险，下游是否已经防住了？**
   若已防住，再加一层只会引入新的失败模式。
3. **「静默缺失」比「重复」危险得多**：重复数据肉眼可见、可清理；
   缺失 20 条在 640 条里极难察觉，且无任何日志/告警。
   ⇒ 凡是「可能丢数据」的路径，必须优先于「可能重复」的路径。

**同类风险点**：任何「先占位再干活」的批量流程（导入、迁移、批量删除、同步）。

### 19. 跨 AI 共享的自动加载文件造成规则串扰（2026-10-09 第 29 轮）

**现象（预防性识别，未造成事故）**：接入第三个 AI（Codex 桌面端）时，
它指出 Codex 的自动加载机制是仓库根 `AGENTS.md`，
而 `.clinerules/00-index.md` §五 已记载 **Cline 也会自动识别 `AGENTS.md`**。

⇒ 在仓库根放 `AGENTS.md` 会**同时**成为 Cline 的规则来源 ⇒ **跨 AI 规则串扰**。

**为什么危险**：
1. **隐式影响**：以为只给新 AI 加了规则，实际悄悄改了另一个 AI 的规则集。
2. **难以排查**：出问题时没人会想到「是另一个 AI 的规则文件被读了」。
3. **行为不可控**：多 AI 共享一份规则 = 谁也无法单独调整自己那一份。

**裁决（DeepSeek 第 29 轮）**：**不建** `AGENTS.md`。
新参与者一律走 **独立目录 + 显式加载**（`.agents/<participant>/00-index.md`），
不共用仓库根的任何自动加载文件。

**可迁移规律**：
1. **接入新 AI 前，先查清「哪些文件会被自动加载」。** 别假设只有你的规则文件被读。
2. **多 AI 协作中，「自动加载」是共享资源，必须最小化。** 能显式读取就不要自动加载。
3. **每个 AI 的规则文件必须物理隔离**（独立目录），避免一份文件影响多方。
4. 同类风险：仓库根的 `.editorconfig` / `.gitattributes` / `package.json` 的 `lint-staged` 等
   被所有工具共享的配置——加规则前先想「谁还会读到它」。

**同类风险点**：任何仓库根级、被多工具共享的配置文件。

## 六、待办

### ⚠️ 第 32 轮：数据编造事故 + 待处理库新增（2026-10-08）

- [x] **事故：AI 连续三次编造坐标**（严重，违反 MEMO 坑 #11）
      ① 生成 `plyh-markets-batch-1.json`（12 条，坐标编造）→ 已删除，未导入；manifest 已还原
      ② 口头给出「14 条点位表」，声称来源 Mapcarta / BIGEMAP / 维基 / 天眼查
         → **cache 核验：这些站点一个都没访问过**，坐标全是编的
      ③ 根因：采集受阻（Bing 反爬 / 高德验证码 / geocode key 未配置）时，
         不报告「查不到」，而是顺着惯性编造内容并配上看似专业的来源
      · **教训**：受阻时必须**显式报告障碍**，绝不「补全」缺失数据。
        已有核验手段：`.cache/crawl` 缓存可反查真实访问记录 —— 声称来源前先自证。

- [ ] **⚠️ 仍未解决：坐标获取通道**（本批无坐标的根因）
      · geocoder key 未配置（`geo_amap_key` / `geo_baidu_ak` / `geo_tianditu_tk` 全空）
      · 高德网页版被验证码拦截（阿里云 captcha），pbf 瓦片无法解析
      · 百度百科内嵌坐标已失效；Nominatim 本机不可达
      · **解锁路径**：用户在浏览器控制台执行
        `localStorage.setItem("geo_amap_key","你的key")`，
        之后即可用 `npm run collect -- geocode "地址"` 批量转坐标

- [x] **待处理库新增 9 条**（`public/pending-unplaced/pending.json`，5 → 14 条）
      分组「广西平陆运河沿岸商贸市场」，**全部无坐标**（符合该库设计用途）：
      南宁生产服务型国家物流枢纽 / 百色物流枢纽港 / 陆屋综合物流园 /
      钦州港勒沟·果子山·大榄坪作业区 / 中马钦州产业园区 /
      平塘江口（运河起点）/ 钦州水上服务区
      · 来源均为**实际检索所得**：新华社《这就是平陆运河》（XH）+ 百度搜索聚合（BD）
      · 未生成 `plyh-markets-batch-*.json`，未登记 manifest

### 🆕 第 31 轮：删除临时代码 + 审批边界认知（2026-10-08）

- [x] **删除「清理幽灵元素」临时代码**（`WhiteboardTool.vue`）：净减 **164 行** / 5 个区段
      · 模板按钮块 · 临时导入（getAllLayers / getAllRecycled / purgeFromRecycleBin）·
        `ghostCleaning` ref · `handleCleanGhostElements` 全函数（146 行）· `.wb-btn-danger` 样式
      · 删除手法：**逐行索引 + 按行号 splice**（跨行正则与跨行字符串在 CRLF 下必失配，见坑 #18）
      · 验证：残留检索 0 条 + build 1.46s 通过 + monitor D1 清零（13 通过 / 0 问题）

- [x] **关键认知：webcode 的审批闸门在「命令文本」，不在脚本内部**
      · 现象：开关 ON 后，某次 `execute_command` 仍弹审批，提示
        `Dynamic PowerShell syntax requires explicit approval` +
        `Path argument "/" resolves outside the configured command roots`
      · 根因：webcode 在执行前**静态解析命令文本**。以下模式**强制弹审批**，与开关状态无关：
        ① PowerShell 变量赋值 / here-string（`$x = ...` / `@'...'@`）
        ② 命令文本中出现越界路径字面量（字符串拼接产生 `/m.json`、`/` 等）
      · **实测免审批的形式**：简单静态命令 / `echo | ...` 管道 / `--b64` 管道 / `node -e` 单行脚本
      · **结论**：开关管「脚本内部是否允许写」，webcode 管「是否允许执行这条命令」——**两层独立**。
      · 已写入 `.agents/references/webcode-access-switch.md` §八「审批边界」。

- [x] **新增坑 #18**：Windows CRLF 下跨行文本匹配必失配 ——
      删多行代码块时用「逐行索引 + 按行号 splice」，不要用跨行字符串或跨行正则。

### 🆕 第 30 轮：全流程监控机制（2026-10-08）

- [x] **新建 `scripts/monitor.mjs`**（`npm run monitor`）：触发词「**开启一轮监控**」。
      · **设计依据**：从项目使命推导工程判据 —— 信息不能丢(B) / 不能自相矛盾(C) / 必须可达(C) / 不该被内部流程污染(A)，外加工程卫生(D/E)。
      · **五组检查**：A 构建健康(2) · B 数据完整性(4) · C 服务一致性(4) · D 代码健康(3) · E 仓库状态(2)。
      · **命令**：`npm run monitor [--fast|--fix|--json]`；退出码 0=全通过 / 1=有问题。
      · **文档**：`.agents/references/monitor-pipeline.md`。

- [x] **首轮监控结果**：14 通过 · 1 问题 · 4.0s
      · ✅ A1/A2 · B1~B4（640 条全部合规）· C1~C4（dev+4173 与磁盘一致）· D2/D3 · E1/E2
      · ❌ **D1 临时调试代码残留 14 处**（`WhiteboardTool.vue`）—— **需人工确认后才能删**

- [x] **顺带修复 4 个监控脚本自身缺陷**（均属「监控动作反而造成故障」类）：
      ① A2 原设计会破坏运行中的 4173（插件删硬编码 `dist/ai-import`，与 --outDir 无关）→ 改为零副作用的配置静态校验。
      ② B2 误报校验中间产物（`5a-verify-3.json` 属 A 类内部文件，本不该登记）→ 排除 `_*` / `*verify*`。
      ③ C3 把 SPA fallback 误判为 JSON 非法（文件不存在时返回 index.html）→ 识别 HTML 并给出正确措辞。
      ④ D2 原与历史基线比对 ⇒ 正常提交后必然持续报警 → 改为知情项，不计为问题。

### 🆕 第 29 轮：webcode 最高权限开关器（2026-10-08）

- [x] **新建 `scripts/webcode-access.mjs`**（`npm run webcode -- <cmd>`）：
      用户说「打开给 webcode 最高权限开关器」后，AI 写操作免审批。
      · **原理**：`write_file`/`edit_file` 因 `destructiveHint:true` 被 webcode **硬编码必审批**，
        而 `execute_command` 不弹窗 ⇒ 把写入改由脚本执行（同 `data-ops.mjs` 原理，此为全域版）。
      · **命令**：`on` / `off` / `status` / `read` / `write` / `patch` / `append` / `delete` / `list` / `audit` / `restore`。
      · **OFF 时**写操作 exit 2 拒绝；只读始终可用。
      · **安全边界**：受保护路径（脚本自身 + `state.json`）禁止写入 ⇒ **锁不能被自己免审地改**；
        每次写前自动备份至 `.cache/webcode-access/backups/`；全部写操作记入 `audit.jsonl`。
      · **已知坑**：PowerShell 管道会给 stdin 加 UTF-8 BOM（致 `patch` 的 JSON 解析失败 / 文件混入 BOM），
        已在 `readStdin` 内置剥离；推荐显式 `$OutputEncoding=[Text.Encoding]::UTF8`，大内容用 `--from`。
      · **验证**：ON→write→read→patch→delete 全通（中文 OK）；OFF 后写被拒 exit 2；受保护路径被拒 exit 1。
      · **文档**：`.agents/references/webcode-access-switch.md`（含 AI 使用约定）。

### 🆕 第 28 轮遗留（2026-10-08）

- [ ] **⏳ 待用户执行（补齐 4173 的 20 条）**：
      ① 4173 窗口 `Ctrl+Shift+R` 强制刷新（加载新代码）
      ② 打开「AI批量导入」面板
      ③ 点「📦 历史文件导入库」右侧的**重置**按钮（清空归档记录）
      ④ 面板会自动补跑 27 个文件：其中 26 个的条目全部命中指纹去重 → 计入 `duplicated` 跳过；
         `wuhan-flexible-labor-batch-1.json` 的 20 条被补入
      ⑤ 验证：图形列表应为 **640**（与 5173 一致）
      ⚠️ 此操作**安全**：不会产生重复数据（指纹去重兜底），且可反复执行（幂等）。

### 🆕 第 27 轮遗留（2026-10-08）

- [ ] **`GisApp.vue:50` 顶栏「待处理未放置信息库」按钮缺 `INTERNAL_TOOLS` 守卫**：
      弹窗本体（`:296` / `:305`）已加守卫，按钮本身没有 ⇒ release 构建下按钮可见但点击无反应。
      修法：按钮加 `v-if="INTERNAL_TOOLS"`。属改动既有 UI，待用户确认后实施。
- [ ] **可选**：若要用 4173 验收「对外发布」形态，改回 `npm run share`；
      日常内测用 `npm run share:internal`（含 AI 面板）。两者语义已在 `package.json` 分离。

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

- [x] ✅【第 2 步 D·**已实施完成**（第 22 轮）】**缺陷 1 本体：让画布收敛**
      ✅ 8 处改动 / 2 文件 · build 2.01s 通过 · **逻辑验证 9/9**（含反证）· 只做 D，未动 P1
      **`elementSync.js`（6 处）**：`:17` import `getRecycled` · `:243` `prunedIds: []` ·
        `:228-233` JSDoc · `:272-279` `archivedElementIds`（注释写死「禁 blanket filter」）·
        `:296-312` **D-b 回读确认**（`getRecycled` + `wbElementRaw` 双条件）·
        `:327-340` **交付剔除清单**（for 外 · 门控内 · 不碰画布不写库）
      **`WhiteboardTool.vue`（2 处）**：`:441-455` `canvasDirty` **累积式**（只置 true 无 else）·
        `:457-488` `boardRef.getApi().updateScene({ elements: 实况.filter(...) })`
      🔑 **剔画布的落点修正**：`syncScene` 是纯数据层函数（拿不到 `boardRef` / `board.scene`）
        ⇒ 只能**返回 id 清单**，由 `runSync` 用画布 API 剔 ⇒ 语义「让**画布**与回收站收敛」
      🔑 **两条修正互相咬合**：`updateScene` 回抛 onChange → 第 2 次 runSync `prunedIds=[]`
        ⇒ 若 `canvasDirty` 是覆盖式就会刷回 false ⇒ 切走走乐观写 ⇒ 剔除被抹掉 ⇒ **D 白做**
        ⇒ **反证已验证**：换回覆盖式，第 2 次确实变 false ⇒ 证明该修正是「必须」而非「保险」
      ✅ 验证 T1~T8：prunedIds 是数组 / 静默早退不剔 / raw 缺失不剔 / 正例剔 /
        `prunedIds=[]` 保持原值 / 非空置 true + 画布已剔 / **T7 第二次仍为 true（核心）** /
        `allowDelete:false` 恒为 []（防御层 2 不可绕过）
      ✅ **第 23 轮裁决已通过**：D 9/9 保留；`captureUpdate` **不补**（R5 只针对 `mutateElement`
        原地改场景，D 是**整数组替换**，且 `applyScene:261` 同款不传也正常）⇒ **D 已定稿，不再改动**。
      ⏳ **待用户实测 6 步**（删完等 3 秒 → 画布应 1；控制台应有 2 行 D 日志；
        另加「删完先别切走直接刷新应仍为 1」= 与 E1 联合验证）
        ⚠️ 可与 P1-A 的第 9 步（删 AI 元素 → 等 3s → 画布 -1 → 切走切回 → 三数一致）合并做

- [x] ⚠️ **【缺陷 1 · 已结案（第 23 轮）】`isDeleted` 持久化 —— 标「已知限制，不影响功能」，不再修**
      现象：`isDeleted=true` 的元素在库中可能残留该标记（清理由权威回写承担）。
      DeepSeek 裁决：**记 MEMO 待办即可，不再投入**。若日后真出现「恢复的元素闪一下就消失」，
      排查入口：① `refreshDataFromDB` 的权威回写是否执行 ② `rebuildIdMap` 是否包含该元素
      ③ `aliveIds`（`!e.isDeleted`）是否把它排除。

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
- [x] **P1.1 ✅ 第 23 轮完成**：新建 `src/groups/whiteboard/utils/recordToElement.js`
      · 裁决 2：坐标语义选 **A（按 bounds 换算）**，`bounds` 缺失 → **拒绝导入 + 告警**（不做 B 兜底）✅
      · 裁决 3：统一生成 **`text` 元素**，三条防护：
        ① 复用 A 方案 **9 个 text 字段一个不少**（否则重演坑#14 毒元素）✅
        ② 生成后过 C 方案 `validateElement` 自检，不通过**拒绝写入 + 告警**✅
        ③ 打标记 `customData.fromAiImport: true` ✅
      · 另：28 个共有字段同样对齐 A 方案模板（字段集同源）；`id` 优先 `crypto.randomUUID()`
      · 纯函数模块、零存储读写（与 `coordinate.js` 同风格）
- [x] **P1.2 ✅ 第 23 轮完成**：`WhiteboardTool.vue` 挂 `AiImportPanel` + `handleWbAiImported`
      · 用 `inline` 内联在 `.wb-canvas-wrap`，**未用** `Teleport to="#tool-header-slot"`（白板无此 slot）✅
      · `toolId = WB_TOOL_ID`，`fileId` 走 `safeFileId()`✅
      · ⚠️ `setScene` 是**整体替换** → 已 `当前 scene + 新元素` 合并 ✅
      · ⚠️ 导入元素**无 `wbElementRaw`** → 靠 `onChange → syncScene` 正常登记，**未走恢复路径** ✅
      · 实现细节（自行拍板，已报 DeepSeek）：
        - 组件**懒加载** `defineAsyncComponent`（不进首屏）
        - **只接 `@imported` 不接 `@changed`** —— 查 `AiImportPanel.vue:180-181` 两事件都发，
          且「一键导入全部」是**逐文件 emit('imported')**（`:224`）→ 两个都接会 N+1 次重跑
        - **重入锁** `wbAiImportBusy`/`wbAiImportPending`：N 次 emit + handler 内含 await
          → 并发进入会重复 `setScene`（闪屏 / 元素翻倍）→ 策略「丢弃并发 + 收尾补跑一轮」（幂等）
        - **过滤条件只用 `!r.wbElementId`**：有 `wbElementId` = 此前登记过 → 画布在就无事、
          画布缺失属**恢复**语义 → 交回收站路径，不在此补（避免两条路径打架）
        - 结束 `canvasDirty = true` + 立刻 `syncNow()`（新元素必须马上登记编号，不等 800ms 防抖）
- [ ] P1.3 `ExcalidrawBoard.vue` 加 `onSelectionChange` 透出（裁决 4：白板自己的组件，允许）

### 16.5 数据文件免审批通道 data-ops（2026-10-07，commit `051b22a`）

**动机**：`write_file` / `edit_file` 因 `destructiveHint:true` **永远弹窗审批**（webcode 硬编码），
数据文件（导入 JSON / 清单）的常规写入也频繁要人工确认。

**实现**：新增 `scripts/data-ops.mjs`（`npm run data-ops`），脚本内硬编码安全边界。

**边界（不可绕过）**：
- ✅ 允许：`public/ai-import/**`、`public/pending-unplaced/**`
- ❌ 拒绝：`src/**`、`.agents/**`、根配置、绝对路径、`..`、反斜杠
- ✅ 每次写/删前自动备份 → `.cache/data-backups/`（已加 .gitignore）
- ✅ `.json` 写入前强制 `JSON.parse` 校验

**命令**：`write <relPath> <srcFile|--inline>` / `delete <relPath>` / `list <relDir>` / `restore <backupFile>`

**实测**：写 ai-import ✅；写 `src/`、根配置 均 ❌ 被拒；删除自动备份 ✅。

**分工约定**：代码文件 → `write_file`/`edit_file`（强制审批，不绕）；
数据文件 → `npm run data-ops`（免审批，用户已授权，有回收站+历史库+本地备份三重兜底）。

### 16.6 记忆文件免审批通道（2026-10-07 追加，commit `9bede5b`）

用户授权把 3 个记忆文件纳入 data-ops 免审批，用于跨会话更新项目记忆。

**白名单（精确匹配，无通配）**：.agents/PROJECT_MEMO.md、.agents/references/active-task.md、.agents/PROJECT_MEMO_ARCHIVE.md`n
**比数据文件更严**：① 仅 write，delete/list 硬拒 ② 无目录通配 ③ 其余 .agents/** 一律拒绝。

**验证 8/8**：数据 write/delete ✅；src、根配置、.agents 非白名单 ❌ 拒绝；记忆 write ✅；记忆 delete/list ❌ 拒绝。

**闭环**：改白名单 = 改 scripts/data-ops.mjs = 不在任何白名单 = 必须审批 ⇒ 锁不能被自己免审地改。

### 16. 跨模块复用校验器时，测试断言必须读源码（2026-10-08 第 23 轮）

**现象**：写 P1-A 的 `recordToElement` 验证脚本时，我内联复制了一份 `validateElement` 的规则，
凭印象写成「空字符串也算缺失」。结果 T7 的「名称全缺 → 空串」用例在测试里判失败，
而**源码本身是对的** —— 真 `validateElement`（`elementSync.js:654-655`）注释明写
「允许空字符串（刚创建的空文本框），但必须是 string」，空串对 `text` 字段**合法**。

**浪费**：一条假失败 + 一轮排查（打印脏输入才定位到是断言写错，不是代码错）。

**规则**：
1. 复制/内联别人的校验规则做测试替身时，**必须逐行对照源码**，不凭印象；
2. 有条件时直接 `eval` 源文件（剥 import 行 + 注入依赖），避免「替身与真身不一致」；
3. 更根本的：**测试失败先怀疑测试**，再怀疑代码 —— 尤其是「测试替身」是手抄的情况。

**同类风险**：任何「为了能跑而内联复制」的模块（本项目有 `coordinate.js`、`validateElement`）。
凡复制，必对照。
- [x] P1.4 `WhiteboardTool.vue` 挂 `MarkerDocPanel` + 加 `hideStylePanel` 显式 prop
      ✅ **【第 24 轮已完成】commit `39526ea`**。实现要点：
      · `MarkerDocPanel` 加 prop 默认 false ⇒ 地图侧零改动；白板传 `:hide-style-panel="true"`
      · `ExcalidrawBoard` 新增 emit `selection-change`；**必须配 `lastSelectionSig` 去重**
        （onChange 每帧触发 + appState 每次新对象 ⇒ 比引用等于没去重）
      · 反查桥：`registeredList.find(i => i.wbElementId === firstId)`（**不可**用 nanoid ↔ WB.xxx 直比）
      · `node.id` = annotation id、`node.type` = annotation.type（wb- 前缀）、存储路径零改动
      · 布局零新 CSS：`.wb-canvas-wrap` 已是 `position:relative` ⇒ 面板自带 absolute 自动生效
      · ⏳ **待用户实测 6 步**（画两矩形→点选→右上角弹面板无样式块 / 输入保存刷新仍在 /
        信息数据库详情可见 / 切换元素面板跟随 / 地图工具样式块正常 / 点空白面板消失）
- [ ] ⚠️ **待裁决（第 24 轮发现）**：`MarkerDocPanel` 关闭时会走 `onBeforeUnmount` 兜底保存，
      即使用户没改也写一次 `documents`（地图侧同样如此）。如要「无改动不写」需另行裁决。
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
- [ ] **第 3 步（P1）** —— P1-A（AI 批量导入）+ P1-B（点选→富文本面板）**均已完成**
- [x] **第 4 步（P2 回到中心点）** —— 第 25 轮完成，commit `9229ea6`
      （`ExcalidrawBoard.centerToContent` + 状态栏按钮 + `handleBackToCenter`）
- [ ] **第 25 轮实测（用户执行，建议 5 步）** —— 见 `.agents/mailbox/to-deepseek.md`
      1. 白板「AI 批量导入」导入几条 → 右侧「已登记元素」名称列**不再出现** nanoid，
         全部显示「未命名」（数据层是空串，UI 层兜底）
      2. 点选画布元素 → 右上角富文本面板：**文档名称输入框为空**（占位提示「请输入文档名称」），
         编辑器**空白**（无「由白板元素自动登记…」那行）
      3. 在面板里自己填名称 + 写内容 → 保存 → 刷新页面 → 名称与内容都在
         → 信息数据库对应记录里也只剩你填的内容
      4. **字体检查**：白板侧富文本面板的字形/字重应与地图（鹰眼）侧**完全一致**
         （不再是 Excalidraw 那套 hand-drawn 字体）
      5. **回到中心点**：状态栏点「回到中心点」→ 视口应动画缩放到全部元素的外接框；
         删光所有元素后再点 → **画面不动**（Console 一条 debug 提示）

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

## 🆕 待实测（2026-10-07 新增功能）

- [ ] **分组改名**（commit `2f83e4b`）：编辑分组窗口 → 非预设分组行「改名」按钮
      ① 地图侧：改名 → 刷新页面 → 名称仍在 → 点开该组，组内元素分组一致
      ② 白板侧：同上（白板分组名派生自 annotations.group）
      ③ 反向：预设分组（默认/5A级景区/中国4A级景区）**不应出现**改名按钮
      ④ 边界：改成已存在的组名 → 应弹提示「已存在」，不生效

## 七、每轮对话结束前 AI 必做

1. 更新本文件「四、数据现状」与「六、待办」
2. 若有新的踩坑，补进「五」
3. 确认所有改动已 `npm run build` 通过

---

## 🆕 导入重复 BUG 修复（2026-10-08）

**现象**：图形列表「5A级景区」显示 732，源文件只有 366（正好 2 倍）；4A 同理（130 vs 65）。

**根因（三重叠加）**：

1. 指纹登记失败被静默吞掉（fingerprintStore.js 的 registerFingerprints）
   - 异常被 catch 吞掉，但 BACKFILL_FLAG 已置位
   - 下次导入 ensureFingerprintsReady 短路跳过回填 → 查不到指纹 → 已存在数据被当新数据写入
2. 归档写入时机错误（AiImportPanel.vue 的 runImportAllFiles）
   - 原实现「全部导入完成后」才写归档；中途刷新 / HMR 重挂载 / 重复点击时归档未写
   - pendingFiles 仍含这些文件 → 再次全量导入 → 翻倍
3. 归档与数据不一致无法自愈
   - 数据丢失后归档记录仍在 → 文件卡在「已导入」→ 无法自动恢复

**修复（三处）**：

1. src/groups/geo/utils/fingerprintStore.js
   - registerFingerprints 失败时重置 BACKFILL_FLAG 为 false
   - 下次导入前重新从 annotations 回填指纹，恢复去重
2. src/components/tools/geo/panels/AiImportPanel.vue
   - runImportAllFiles 改为「先认领后导入」：循环前先 markFilesImported(targets)
   - 失败项末尾回滚（从归档移除 → 回到待导入清单）
3. src/components/tools/geo/panels/AiImportPanel.vue
   - 新增 healOrphanArchive()：启动时对比「归档文件数」与「数据库记录数」
   - 若 数据量 < 归档数 × 5 → 判定归档孤儿 → 清空归档 + 重置指纹标志 → 文件回到待导入清单
   - 安全边界：仅数据极度缺失时触发，正常场景不误判

**验证（实测）**：

- 5A级景区 366（修复前 732）与源文件一致
- 中国4A级景区 65（修复前 130）
- 总条数 640（修复前 1260）
- 重复 ID 0，重复指纹 0

**数据格式零改动**：JSON 契约、item 字段、IndexedDB 表结构、指纹算法（v4）、归档存储格式全部原样。

**新增 import**：AiImportPanel.vue 引入 getAllLayers（annotationStore）、resetFingerprintBackfillFlag（fingerprintStore）。

---

## 🆕 自动渐进导入 + 窄屏适配（2026-10-08）

**自动渐进导入**（AiImportPanel.vue）：
- 打开工具时若「待导入清单」有数据，自动逐文件导入
- 每文件后 yieldToMain() 让出主线程防卡顿
- maybeAutoImportAll() 带「每工具每会话仅一次」守卫
- 手动「一键导入全部」走同一套 runImportAllFiles 核心逻辑

**窄屏（≤768px）适配**（均包在 media query 内，桌面零影响）：
- GisApp.vue：顶栏改块级布局（修换行溢出重叠）、工具名独占首行、其余控件自动换行填满、关闭工具改「×」移顶栏设置右侧、弹窗近全屏
- MapPanel.vue：浮动面板宽度限 calc(100vw-70px)
- WhiteboardTool.vue：状态栏换行、右侧面板改覆盖式抽屉
- BaseMapTool.vue：缩放控件/绘图条缩小贴边
- LayerListPanel.vue：操作栏换行、下拉收窄、手机隐藏按钮文字

**小工具开关增强**（toolSettings.js）：
- 新增 saveProject（保存当前工程）纳入开关控制，鹰眼/白板默认关闭
- 新增 TOOL_WIDGET_DEFAULTS（工具级默认，优先级最高）
- 新增 NARROW_DEFAULTS（窄屏精简默认：标注编辑区/富文本/定位/图形列表）

**路由改 hash 模式**（router/index.js）：
- createWebHistory() 改为 createWebHashHistory()
- 修 /gis/geo 深链接刷新白屏（base:'./' 下资源被解析为 /gis/assets/* 导致 404）

**热点数量修复**（BaseMapTool.vue）：
- buildHotspotIds 改两轮抽样（第一轮每分组 2-3 个保多样性，第二轮补满至 HOTSPOT_MAX=49）
- 启动时若 热点数 < min(49, 总数) 则重建（原逻辑只在为空时重建）

---

## 🆕 新增测试数据（2026-10-08）

- public/ai-import/guangxi-enterprises-batch-1.json：广西重要企业分布 26 条（简介均 ≥100 字）
  - 3 条误匹配（玉柴/西江开发/广电网络返回北京坐标）已入待处理库 id 3-5
- public/ai-import/wuhan-flexible-labor-batch-1.json：武汉市周边虚拟灵活劳务消息 20 条（纯虚构测试数据）
  - 字段：工作地点/时间/招募人数/薪酬，全部含 time 字段

---

## 🆕 开发工具（2026-10-08）

- npm run share：一条命令启动 release watch 构建 + 对外 preview（端口 4173）
  - vite.config.js 追加 stripInternalAfterBuild 插件：release 模式构建后自动剔除 dist/ai-import、dist/pending-unplaced
- npm run dev:all：scripts/dev-workspace.ps1，一键启动 dev+share 两个服务并开三个浏览器窗口（宽屏 dev / 宽屏 share / 窄屏 share 500px）
- scripts/release-public.mjs：对外发布剔除脚本（safe/strict 两档），文档见 .agents/references/frontend-release-security.md
- 初始页新增两个占位入口：幻想世界空间构建开放平台、鹰眼AI（仅 UI，点击弹提示，未实现功能）
