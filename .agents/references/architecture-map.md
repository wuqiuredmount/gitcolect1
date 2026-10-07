# 架构地图（速查）

> 用途：接到任何任务，先读本文件定位「改哪个文件」，再按需读局部。省 token。
> 最后更新：2026-10-08

## 一、三个产品入口

| 入口 | 路由 |
|---|---|
| 信息分布共享与集成 | /gis/geo |
| 自由信息分布标注与发布 | /gis/card |
| Excalidraw 白板 + 数据信息 | /gis/whiteboard |

GisApp.vue 是总编排层。白板走懒加载，不进 groups 静态数组。

## 二、目录结构

- src/views/Home.vue —— 首页（三入口 + 版权协议页脚）
- src/views/GisApp.vue —— 总编排
- src/groups/geo/utils/ —— 共享数据层（23 模块）
- src/groups/whiteboard/ —— 白板（4 个 .vue + utils/6 个模块）
- src/components/common/ —— 跨工具组件
- src/components/tools/geo/ —— 地图组件（BaseMapTool + 5 个工具壳 + panels/）

## 三、共享数据层

<!-- AUTO:TOOL-REGISTRY START -->
| toolId | 库名 | 前缀 |
|---|---|---|
| `geo-custom-canvas` | `LiangJian_Tool_CC` | CC |
| `geo-china-map` | `LiangJian_Tool_CM` | CM |
| `geo-world-map` | `LiangJian_Tool_WM` | WM |
| `geo-china-standard-map` | `LiangJian_Tool_CS` | CS |
| `geo-province-map` | `LiangJian_Tool_PM` | PM |
| `geo-eagle-eye` | `LiangJian_Tool_EH` | EH |
| `wb-whiteboard` | `LiangJian_Tool_WB` | WB |
<!-- AUTO:TOOL-REGISTRY END -->

每库 8 表：annotations / documents / projects / meta / assets / recyclebin / fingerprints / whiteboard（仅 WB）

模块速查：
- toolDB / toolRegistry / migrationManager / toolDefaults —— 基础设施（慎改）
- annotationStore / documentStore / systemStore —— 元素与富文本
- fingerprint.js / fingerprintStore.js —— 指纹（禁改算法）
- recycleStore —— 回收站
- aiImporter / aiDataCommand / importHistory / dedup —— AI 通道
- geocoder —— 地理编码
- layerScheduler —— 地图专用（白板不用）

## 四、白板模块

主组件 WhiteboardTool.vue（编排）→ ExcalidrawBoard.vue（React 宿主）→ excalidrawBridge.js（桥接）
WhiteboardPanels.vue（面板薄壳），挂 LayerListPanel / InfoPanel / MarkerDocPanel / AiImportPanel
数据层：elementSync.js（同步核心）/ boardStore.js（场景 + CAS）/ coordinate.js / boardSettings.js / recordToElement.js

白板关键约束：
1. type 一律加 wb- 前缀
2. 不改 fingerprint.js
3. 全登记（无名元素走 __fpName 临时字段兜底）
4. 删除唯一入口 = runSync 的 allowDelete 门控
5. 写库唯一入口 = onBeforeUnmount 乐观写 + refreshDataFromDB 权威写
6. canvasDirty 累积式

## 五、地图模块

BaseMapTool.vue（6 工具共用），EagleEyeMapTool.vue（鹰眼配置壳）
面板：LayerListPanel / InfoPanel / MarkerDocPanel / AiImportPanel / MapPanel / LocatingPanel / OpacityPanel
关键：editableLayers 是唯一增删容器；loadHistoricalLayers 有并发合并锁。

## 六、定位流程（任务关键词 → 文件）

- 编号/指纹 → annotationStore.js、fingerprint.js（只读）
- 白板同步 → elementSync.js
- 白板画布 → ExcalidrawBoard.vue、excalidrawBridge.js
- 白板富文本 → MarkerDocPanel.vue
- 白板 AI 导入 → recordToElement.js、AiImportPanel.vue
- 地图面板 → LayerListPanel.vue、InfoPanel.vue
- 导入点位 → skills/ai-import-geo-markers
- 回收站 → skills/ai-recycle-bin-ops
- 顶栏 UI → skills/geo-panel-ui-design

## 七、自动同步（AUTO 块）

本文件中 `<!-- AUTO:xxx START --> ... <!-- AUTO:xxx END -->` 包裹的段落，**由 `npm run sync-map` 自动生成**，人工不要手改。

当前 AUTO 块：
- `TOOL-REGISTRY` —— 从 `toolRegistry.js` 提取（工具库注册表）
- `DEPS` —— 从 `package.json` 提取（依赖清单）
- `SYNC-STAMP` —— 最后同步时间

**触发时机**：
- 新增 / 删除工具库（改 `toolRegistry.js`）后
- 依赖版本变动后
- 定期（如每周一次）

**同步命令**：`npm run sync-map`

<!-- AUTO:DEPS START -->
**dependencies**
| 包 | 版本 |
|---|---|
| `@excalidraw/excalidraw` | `0.18.1` |
| `leaflet` | `^1.9.4` |
| `leaflet-draw` | `^1.0.4` |
| `react` | `18.3.1` |
| `react-dom` | `18.3.1` |
| `vue` | `^3.5.42` |
| `vue-leaflet` | `^0.1.0` |
| `vue-router` | `^4.6.4` |
| `xlsx` | `^0.18.5` |

**devDependencies**
| 包 | 版本 |
|---|---|
| `@vitejs/plugin-react` | `^6.1.2` |
| `@vitejs/plugin-vue` | `^6.0.8` |
| `concurrently` | `^10.0.5` |
| `cross-env` | `^10.1.0` |
| `electron` | `^44.5.1` |
| `electron-builder` | `^26.15.3` |
| `vite` | `^8.3.0` |
| `wait-on` | `^9.5.1` |
<!-- AUTO:DEPS END -->

<!-- AUTO:SYNC-STAMP START -->
> 自动同步于 2026-10-07（由 `npm run sync-map` 生成，勿手改本块）
<!-- AUTO:SYNC-STAMP END -->

---

## 八、Token 节约约定

1. 本文件优先，读完再决定要不要读局部，不要扫全仓。
2. 白板 P0/P1/P2 已完成，不再读已归档的规划文档。
3. 小决策自己拍板。
4. 报告精简：写完 mailbox 后对话只回一句「已完成，写入 mailbox」。
5. 同一对话内不重复读同一文件。
