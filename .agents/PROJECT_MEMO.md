# 项目记忆与上下文交接（PROJECT_MEMO）

> **用途**：DeepSeek 网页版上下文有限、会话可能中断。
> 本文件是**跨会话的唯一权威记忆**。新会话开始时，AI 必须先读它。
> **每轮对话结束前，AI 必须更新本文件的「数据现状」与「待办」两节。**

最后更新：2026-10-06（白板 6 项施工任务全部完成：全登记 / 字体自托管 / 懒加载 / R4读时归一化 / 主组件 / 富文本核实；build 通过，4 次 commit）

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

---

## 六、待办

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

---

## 七、每轮对话结束前 AI 必做

1. 更新本文件「四、数据现状」与「六、待办」
2. 若有新的踩坑，补进「五」
3. 确认所有改动已 `npm run build` 通过
