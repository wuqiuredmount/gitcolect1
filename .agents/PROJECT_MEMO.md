# 项目记忆与上下文交接（PROJECT_MEMO）

> **用途**：DeepSeek 网页版上下文有限、会话可能中断。
> 本文件是**跨会话的唯一权威记忆**。新会话开始时，AI 必须先读它。
> **每轮对话结束前，AI 必须更新本文件的「数据现状」与「待办」两节。**

最后更新：2026-10-06（**用户已确认主 bug 修复生效**：状态栏「元素 1·已登记 1」、信息数据库出现 WB.00012 记录。本轮完成三项收尾：① 字体路径 `/gis/fonts/` 404 已修（按协议分流取 origin / 目录前缀，实测 `ASSET_PATH=http://localhost:5173`、`/gis/fonts/` 请求 **0** 次）；② **问题 2 根因锁定并修复** —— 0.18.1 的 prop 名是 `excalidrawAPI` 而非 `onExcalidrawAPI`，实测 `"should be a function!"` **0** 次、`canvasReady` 正常打开；③ 诊断日志分级清理（保留 3 条关键，其余降 debug/删）。断言 89/89，build 通过）

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

6. **维基百科与 Wikimedia 被网络封锁**
   本机百度/高德可达，但 zh.wikipedia.org 与 upload.wikimedia.org 不可达，浏览器也救不了。
   → 4A 及后续数据必须改用国内源（文旅部、各省文旅厅、百度百科），图片也要换国内图床。
   → 5A 批次里用的 Wikimedia 外链在 4A 不要再沿用。

7. **Edge 采集通道需要独立调试实例**
   日常 Edge 没开远程调试端口，edge-devtools 连不上。
   恢复方法见 `.agents/references/browser-channel.md`。

8. **大段 edit_file 匹配失败会静默缺函数**
   一次 edit 若 oldText 匹配到多处会整体失败，但 build 仍能通过（模板引用未定义函数不报编译错）。
   → 改完大段代码后必须用 search_code 核验关键函数是否真的落盘，不能只看 build 成功。

9. **图层必须始终在 editableLayers 容器内增删**
   所有图形加载时都通过 `editableLayers.addLayer(layer)` 挂到 FeatureGroup。
   任何显示/隐藏操作（如分组过滤）都必须用 `editableLayers.addLayer/removeLayer`，
   **绝不能直接 `map.addLayer/removeLayer`**。
   - 后果：图层脱离容器 → 与底图投影关系错乱 → 图形跑到太平洋/南海等错误位置。
   - 判断是否在容器内用 `editableLayers.hasLayer(ref)`，不要用 `map.hasLayer(ref)`。
   - 已修：`handleFilterGroup`（BaseMapTool.vue:733）。

10. **Excalidraw 0.18.1 没有 scrollConstraints**（2026-10-06 实测）
    网上大量资料提 `initialData.appState.scrollConstraints`，但该 API 在 0.18.1 中
    **类型声明与构建产物均为 0 处**。可用入口只有 `Props.viewModeEnabled`（会连画图一起禁掉）、
    `Props.onScrollChange` / `api.onScrollChange`（均只读）。
    且 Excalidraw 把滚动钳制在「内容包围盒」内，`scrollX/scrollY` 无法被程序固定为常数。
    → 本版本改用**读时归一化**：直接用 `element.x/y`（世界坐标）换算 lat/lng。
      平移只改 `appState.scrollX/scrollY`，不改 `element.x/y`，故坐标与指纹天然稳定。
    → 结论已写死进 `elementSync.js` 注释（toWorldPoint / worldToScreen）。

11. **用 insert_line 在 .vue 文件插入代码极易错位**（2026-10-06）
    行号会随着前一次插入漂移，且若不巧落在 `computed(...)` / `</template>` 中间，
    会截断语句导致 `Unexpected token` 或 `Element is missing end tag`（本次连踩 3 次）。
    → 大文件分块写：优先用 `old_text/new_text` 锚定**唯一文本**做替换，
      或先 `Get-Content | Select-Object` 核实行号与上下文再插入；
      写完后务必 `Select-String '</?template|</?script|</?style'` 校验 SFC 结构完整。

12. **Node ESM 跑源码验证脚本需补 .js 后缀**（2026-10-06）
    项目源码按 Vite 习惯省略 import 后缀，`node xxx.mjs` 直跑会 ERR_MODULE_NOT_FOUND。
    → 临时写一个 `register('./.js-resolver.mjs')` 解析钩子补后缀，验证完即删，不留在仓库。

13. **白板「恢复后被自动删除第二遍」隐性循环**（2026-10-06 发现并修复）
    成因：Excalidraw 删除元素只是打 `isDeleted: true`，**元素物理上仍留在 scene 数组里**。
    恢复流程旧版只把记录搬回 annotations/documents，**没碰 scene** →
    下次 `syncScene` 用 `aliveIds = !e.isDeleted` 判断，该元素不在集合内 →
    被当作「已删除」**二次写进回收站并再次移出 annotations**。
    表现：恢复成功 → 刷新/触发同步 → 元素又没了，回收站出现重复记录。
    修复：`elementSync.js` 新增 `restoreElementsToBoard()`，恢复时按 `wbElementId`
    擦除 scene 中的 `isDeleted`（精确还原），并回灌画布 + 重建 idMap。
    ⚠️ 排查同类问题的通用思路：**任何"软删除 + 外部索引"双写结构都可能存在这种
       「索引恢复了、数据源没恢复」的不一致**，要两边一起验。

14. **`moveToRecycleBin` 第 5 参数 wbElementRaw**（2026-10-06，用户裁决①补丁）
    白板元素删除时把 Excalidraw 原始元素对象**深拷贝**存进回收站记录，
    恢复时若有 raw 则原样塞回 `board.scene`（精确还原，带文字的框不丢文字）；
    无 raw（老记录）降级为按 lat/lng 近似重建（几何可恢复、**文字会丢**，重建元素带
    `customData._rebuiltFrom = 'coordinate'` 便于排查）。
    体积代价：每个元素多 0.5–2 KB，带文字容器约 3–6 KB，回收站常态几十条，可接受。
    兼容性：新增**可选**参数，地图元素不传 → 记录体积不变（符合「只追加」约定）。

15. **Vite `INEFFECTIVE_DYNAMIC_IMPORT` 警告**（2026-10-06）
    在 `elementSync.js` 里写 `await import('./boardStore.js')` / `('./coordinate.js')`
    会触发该警告——因为这两个模块早已被 `WhiteboardTool.vue`、`boardSettings.js` 等
    **静态引用**，动态 import 不产生分块收益。→ 直接改回静态 import 即可，build 恢复干净。

16. **🚨 白板「首帧 onChange 空数组 → 全员假删除」时序竞态**（2026-10-06，五层防御已修）
    根因（**代码逻辑已证明，非猜测**）：子组件 `ExcalidrawBoard.vue` 的 `onMounted` 是
    **同步**执行，而父组件 `WhiteboardTool.vue` 的 `onMounted` 里有两个 `await`
    （`ensureCoordinateBasis` / `ensureDefaultBoard`）。于是：
    ① 画布先挂载，`initialData.elements = []`（此时 `initialScene` 还没读到）
    ② 画布首帧 `onChange` 回抛**空数组**
    ③ `syncScene` 用 `aliveIds = list.filter(!isDeleted)` 做集合差 → 空集
    ④ `idMap` 里每个已登记 id 都判为「已消失」→ **全量软删除进回收站**
    五层防御（缺一不可）：
    - **层1** `WhiteboardTool.vue` 新增 `canvasReady` ref + `pendingElements` 暂存；
      `scheduleSync` 未就绪只暂存不调度，`runSync` 入口硬守卫直接 return。
    - **层2** `elementSync.js` 的 `syncScene` 新增第 7 参 `allowDelete=true`，
      把整块「集合差 → 软删除」逻辑包进 `if (allowDelete)` 门控。
    - **层3a** 模板 `<template v-if="boardReady">` 延迟挂载画布，
      保证 `initialScene` 有值之后才创建 React 画布（从根上杜绝首帧空场景）。
    - **层3b** `ExcalidrawBoard.vue` 的 `onApiReady` 里**无条件** `applyScene`
      重放 `props.initialScene`；`watch` 在 api 未就绪时改为打 `sceneDirty` 标记
      （旧代码 `if (!api) return` 会把这次变更**永久丢弃**）。
    - **层4** `syncNow`（手动「立即同步」）同样加 `canvasReady` 守卫，
      防止首帧期点按钮绕过整个防线。
    ⚠️ **若后续仍误删**，第一嫌疑是 `sanitizeElements` 静默丢弃含循环引用的元素
    （`excalidrawBridge.js:57-70`），可先用 `syncNow` 手动同步对照验证。

17. **🚨 白板「新画元素不被登记、状态栏恒为 0 个」（2026-10-06 已定位，未修）**
    **现象**：白板画任何元素，状态栏永远「元素 0 个 · 已登记 0 · 待换算 0」，
    信息数据库看不到白板元素。**不是**数据丢失（五层防御的 allowDelete 门控挡住了删除面）。
    **根因（源码级实证，非猜测）**：链路上有两个「静默丢弃」串在一起。
    - ① `@excalidraw/excalidraw@0.18.1` 的 `componentDidUpdate`
      **首行**就是 `let n = this.scene.getElementsIncludingDeleted();`，
      末尾 `this.props.onChange?.(n, this.state, this.files)` —— 传给宿主的
      elements 就是这批**元素对象本体**（活对象，非纯数据）。
    - ② `excalidrawBridge.js:101` 在回调里调 `sanitizeElements(elements)`，
      而它是 `JSON.parse(JSON.stringify(el))`，**失败即 catch 后丢弃该元素**
      （只 console.warn，不打断）。元素对象带不可序列化字段 → 逐个抛错 →
      **整批被丢光** → `onChange` 永远把 `[]` 交给上层。
    - ③ 于是 `WhiteboardTool.runSync` 里 `alive = [].filter(...)` = 空数组
      → `stats.total = 0`；`syncScene` 的 alive 集合也为空 → 什么都不登记。
    **为什么现在才暴露**：上轮修「首帧空数组误删」时给 `syncScene` 加了
    `allowDelete` 门控，**恰好挡住了这个 bug 的删除面**，于是现象从「全量误删」
    退化成「安静地不登记」——bug 没消失，只是换了个更隐蔽的表现。
    ⚠️ **修的时候不要把 allowDelete 门控一起拆掉**，否则立刻回到全量误删。
    📌 教训：**`catch + console.warn + 静默跳过` 是最难查的一类 bug**。
    凡是「净化/过滤」函数，宁可返回失败标记让上层可见，也不要悄悄丢数据。

18. **Excalidraw 字体 `normalizeBaseUrl` 源码复核（与坑#17 互补）**
    从 `node_modules/@excalidraw/excalidraw/dist/prod/chunk-K2UTITRG.js` 逐字复核，
    **印证坑#19 的结论**（此前是推断，现为源码实证）：
    - 字体 URI 常量确为 `"./fonts/Xiaolai/…woff2"` 形态（`./` 自带）
    - `createUrls`：`if (t.startsWith("http")) return [new URL(t)];`
      → 只有**完整 http(s) URL** 才会被直接采用；随后是
      `let n = t.replace(/^\/+/, "")`，**只剥开头 `/`，`./` 原样保留**
    - `normalizeBaseUrl(t)`：`/^\.?\//.test(n)` 命中则
      `new URL(n.replace(/^\.?\/+/, ""), window?.location?.origin)`，
      最后**无条件** `` n = `${n.replace(/\/+$/, "")}/` `` ← **恒追加尾斜杠**
    - HTTP 404 日志字符串为 ``Failed to fetch font family "${family}"``（与坑#17 一致）
    → 结论不变：只能传「**目录前缀且去尾斜杠**」的 base，由 Excalidraw 自己补 `/`。
    📌 可靠替代方案（若动态前缀再出问题）：把 `EXCALIDRAW_ASSET_PATH` 设成
    **完整 `http(s)://` URL**，可绕过 `normalizeBaseUrl` 全部改写；
    但 Electron `file://` 下无 http origin，**不适用**，故仍采用目录前缀方案。

19. **🚨 Excalidraw 自托管字体「双重嵌套 / 尾斜杠」路径陷阱**（2026-10-06，已修）


    **先纠一个假结论**：上一轮曾怀疑 `.woff2` 损坏（HTML/404/LFS 指针）。
    实测**230 个被引用字体字节头均为 `wOF2` 魔数、且与 npm 包内原件 MD5 逐一相同**
    → **文件是好的，纯粹是 URL 解析问题**。
    真根因（读 `chunk-K2UTITRG.js` 源码 + Node 复算双重验证）：
    - 字体 URI 为 `'./fonts/Excalifont/xxx.woff2'`（**自带 `./`**）
    - `createUrls`: `n = uri.replace(/^\/+/, '')` → **只剥开头 `/`，`./` 原样保留**
    - `normalizeBaseUrl`: base 以 `./` 或 `/` 开头 → `new URL(base.replace(/^\.?\//,''), origin)`；
      最后**恒追加尾斜杠** `base.replace(/\/+$/,'') + '/'`
    - `file://` 下 `window.location.origin === 'null'`（**不可解析**）→ 浏览器退化为页面 URL
    → 结果矩阵（旧值 `'./excalidraw-fonts/'`：**两种模式都双重嵌套、全坏**）：

    | base | dev | 打包 |
    |---|---|---|
    | `'./excalidraw-fonts/'`（旧） | ❌ `/excalidraw-fonts/fonts/` | ❌ 同左 |
    | `'/'` | ✅ | ❌ `…/dist/index.html/fonts/`（**index.html 被当目录**） |
    | `'/fonts/'` | ❌ `/fonts/fonts/` | ❌ `/fonts/fonts/` |
    | **目录前缀（正解）** | ✅ `…/fonts/` | ✅ `…/dist/fonts/` |

    ✅ **正解**（`index.html`）：取「文档所在目录」并**去掉尾斜杠**，交给 Excalidraw 自己补回：
    ```js
    window.EXCALIDRAW_ASSET_PATH =
      window.location.href.replace(/[?#][\s\S]*$/, '').replace(/[^/]*$/, '').replace(/\/+$/, '');
    // dev → 'http://localhost:5173'        打包 → 'file:///…/dist'
    ```
    ⚠️ 配套：字体目录必须是 `public/fonts/`（**不能**叫 `excalidraw-fonts`）；
    因为 URI 里已写 `fonts/`，目录名再叠一次就是 `fonts/fonts/`。
    📌 教训：**下「文件坏了」结论前先验魔数 + 与原件哈希比对**，否则白花时间重拷文件。

20. **🚨 「守卫拦住了」≠「守卫写错了」—— 诊断方法论的坑（2026-10-06，连错两轮）**

    现象：白板新画元素不登记，状态栏恒「元素 0 个」。
    **两轮误判**：
    - 第 1 轮：读源码看到 `onChange` 收到活对象 + `sanitizeElements` 用
      `JSON.parse(JSON.stringify)` 且 `catch` 静默丢弃 → 断定"净化丢元素"。
    - 第 2 轮：看到 `canvasReady` 守卫挡住 `runSync` → 断定"守卫写过头了"。

    两次都是**从现象往下游/上游单向猜**，没先测断点。加日志一测即明：
    ```
    [诊断] onChange.elements: 1 | api.getSceneElements(): -3 | sanitize 后: 1
    ```
    → 净化**没问题**、`onChange` **收到了**；真正断点是 `canvasReady` 恒 false，
    因为**它依赖的 `api-ready` 信号从未到达**（`onExcalidrawAPI` 从未触发）。

    📌 **教训（方法论，比 bug 本身更值钱）**：
    1. **先用日志划定断点区间，再读代码解释断点** —— 不要反向。
    2. **区分「逻辑错」与「输入缺失」**：守卫拦住了，可能不是守卫的判据错，
       而是它等的信号根本没来。查守卫前先查**它依赖的输入是否到达**。
    3. 对比日志要找**独立取数路径**（如 `onChange.elements` vs `api.getSceneElements()`），
       同一路径的自证没有价值。
    4. 报"没触发"类问题时，**在触发点本身埋探针**（如 `onExcalidrawAPI` 首行），
       而不是在它下游猜。

21. **🚨 Excalidraw 0.18.x 的 API prop 叫 `excalidrawAPI`，不是 `onExcalidrawAPI`（2026-10-06）**

    现象：`onExcalidrawAPI` **从不触发**（`api.getSceneElements()` 恒 `-3`），
    但 `onChange` 一切正常 —— 组合很诡异。

    根因：**prop 名错了**。0.18.1 源码
    （`node_modules/@excalidraw/excalidraw/dist/prod/index.js`）：
    ```js
    let { excalidrawAPI: n, viewModeEnabled, … } = t;      // t = props
    typeof n == "function" ? n(d)
                           : console.error("excalidrawAPI should be a function!")
    ```
    传错名**不抛错、不警告**，只在控制台留一句
    `excalidrawAPI should be a function!` —— 极易被刷屏埋掉。

    📌 **教训**：
    1. `onChange` 正常 **不代表** 其他 props 名字对 —— 它们是**各自独立**的 props。
       「一个回调工作、另一个从不触发」时，第一嫌疑就是**名字写错**（版本改名）。
    2. 报"某 prop 从不触发"，**先去 `node_modules` 的 `dist/prod` 搜真实的 prop 解构**，
       不要只信文档/记忆。搜索关键词用**报错文案**（这里 `should be a function`
       一次命中），比搜 prop 名更快（minified 后可能被改写成局部变量名）。
    3. 升级 Excalidraw 主版本时，**逐个核对 props 名**（0.17 `onExcalidrawAPI` →
       0.18 `excalidrawAPI` 是破坏性改名）。

22. **🚨 静态服务器 / 预览服务器的「目录兜底」会掩盖 404，误导验证（2026-10-06）**

    现象：`/fonts/…` 与 `/gis/fonts/…` **都返回 HTTP 200**，
    于是「验证通过」——但真实浏览器里 `/gis/fonts/` 实际是 404。

    根因：`vite preview` / 许多静态服务器对未知路径会**回退到 `index.html`**（SPA fallback），
    于是 `/gis/fonts/x.woff2` 返回的是 **HTML 而不是字体** → 200，
    但浏览器 `<font>` 解析失败 → `Failed to decode downloaded font`。

    📌 **教训**：
    1. **用 HTTP 状态码验证静态资源 404 是不可靠的**（SPA fallback 会兜底成 200）。
       要看**响应体**（是不是 `<!doctype html>`）或 **Content-Type**。
    2. 验证这类问题应当**跑真实浏览器**（本项目用 Electron 作无头宿主，
       `session.webRequest` 记录实际 `.woff2` 请求 URL + 页面里 `window.EXCALIDRAW_ASSET_PATH`
       的真实取值）—— 这才是一手证据。

23. **🚨 SPA 路由前缀 ≠ 静态资源目录（2026-10-06，字体 /gis/fonts/ 404 的根因）**

    现象：`Failed to decode downloaded font: http://localhost:5173/gis/fonts/…`
    —— URL 里莫名多了一层 `/gis/`。

    根因：`EXCALIDRAW_ASSET_PATH` 由「页面 URL 所在目录」推算，但本项目用
    `createWebHistory()`，白板页是 `…/gis/whiteboard` → 取目录得 `…/gis`。
    **`/gis` 是路由前缀，不是真实目录**；而 `public/` 下的静态资源恒定挂在**站点根**。

    📌 **教训**：
    1. **静态资源基准与「当前路由」无关**，别用 `location.pathname` 推算资源目录。
       `http(s)` 下应直接用 `location.origin`。
    2. `file://` 下 `location.origin` 是 `file://`（不可解析），**必须单独分流**
       （退化为「文档所在目录」）—— 「一种算法打天下」在这里行不通。
    3. 本项目 `vite.config.js` 是 `base: './'`，但 `public/` 资源在 dev 下仍在根 ——
       **`base` 只影响打包产物引用，不影响 `public/` 的 dev 挂载点**。



---

## 六、待办

### 🔜 施工顺序（用户已定，2026-10-06，按序推进）
- [x] **第 0 步：修「新画元素不被登记」bug —— ✅ 用户已验证生效**
      正确根因（**前两轮误判已作废**）：`canvasReady` 绑在 `api-ready` 上，
      但 `onExcalidrawAPI` 从未触发 → 守卫永远 false → 元素从不登记。
      修复内容见「三-0」的「🩹 白板主 bug 修复」+「🚨 闸门③」。
      ⚠️ **`allowDelete` 门控一行未动**（只在调用侧加了 `alive.length > 0` 前置条件）。
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
- [ ] **第 2 步（P0 界面）← 下一步开工**：图形列表 + 信息栏，对齐鹰眼完整度
      （鹰眼侧有 `InfoPanel.vue` / `BaseMapTool.vue` 的分组列表 + 信息栏，白板侧要对等）
- [ ] **遗留待办**：评估「字段级容错」是否值得保留
      （它现已证明与主 bug 无关；若无必要建议回退，避免留无用复杂度）
- [ ] **第 3 步（P1）**
- [ ] **第 4 步（P2）**

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
