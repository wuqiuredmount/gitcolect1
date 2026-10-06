# 白板接入（路线 A）交接文档

> 用途：换模型/换会话后读本文件继续施工。决策日期 2026-10-06。
> 前提：先读 .agents/PROJECT_MEMO.md 第十四条。

## 一、目标

Excalidraw 白板上每个图形元素，要和地图里的图形元素享受完全相同的待遇：编号、指纹去重、富文本详情、软删除进回收站、AI 指令操作、进入信息数据库。

## 二、用户敲定的四条约束（不得更改）

1. 走路线 A：白板元素必须带地理坐标 lat/lng
2. 白板是地图的补充视图（不是独立产品）
3. 不能改指纹算法（fingerprint.js 保持 v4 原样）
4. 元素点开要有富文本详情

## 三、核心机制：白板元素如何获得地理坐标

指纹算法 buildFingerprint 硬性要求 name + lat + lng + toolId + type，缺任一维度指纹为空，待遇全挂。所以必须做坐标换算：

1. 白板绑定一个地理范围 bounds（minLat/maxLat/minLng/maxLng）
2. 白板画布有像素尺寸 canvasWidth x canvasHeight
3. 元素画布坐标 (x, y) 换算经纬度：
   lng = minLng + (x / canvasWidth) * (maxLng - minLng)
   lat = maxLat - (y / canvasHeight) * (maxLat - minLat)
   （y 轴向下、纬度向上，要反向）

bounds 存白板工具库 meta 表，键 whiteboard_bounds。

## 四、数据映射

| annotation 字段 | 来源 |
|---|---|
| id | formatGraphicId('wb-whiteboard', seq)，用 reserveSequence 预留 |
| type | 'wb-' + element.type（如 wb-rectangle），加前缀防与地图元素指纹碰撞 |
| name | element.customData.name，无则视为无效不注册指纹 |
| lat/lng | 由 element.x/y 经 bounds 换算 |
| toolId | 'wb-whiteboard' 固定 |
| fileId | 白板文件编号，或 'legacy-file' |
| group | element.customData.group 或空 |
| fingerprint | buildFingerprint(layer) 计算后写入 |
| wbX/wbY/wbW/wbH | 保留原始画布几何，方便回写 |

富文本：用 documentStore.saveDocument('wb-whiteboard', fileId, annotationId, docHtml)，与地图同一套表。

## 五、改动清单

已改（本轮完成）：
- src/groups/geo/utils/toolRegistry.js 新增 wb-whiteboard 到 TOOL_PREFIX / TOOL_META / TOOL_ORDER
- .agents/PROJECT_MEMO.md 记录路线 A 决策

待改（下一个模型执行）：
1. src/views/GisApp.vue：groups 数组新增 whiteboard 组，引入新组件，onMounted 分支处理 groupId==='whiteboard'
2. 新建 src/groups/whiteboard/WhiteboardTool.vue：挂载 Excalidraw + bounds 换算 + 与 IndexedDB 同步
3. 新建 src/groups/whiteboard/utils/coordinate.js：canvasToLatLng 及逆函数
4. 新建 src/groups/whiteboard/utils/elementSync.js：onChange 增量对比，调 appendLayers / saveAllLayers，删除走 moveToRecycleBin
5. 新建 src/groups/whiteboard/utils/excalidrawBridge.js：Vue 挂 React 适配层

## 六、Excalidraw 接入方式

Excalidraw 是 React 组件，本项目是 Vue 3，二选一：
- B1 自托管：npm i @excalidraw/excalidraw react react-dom，用 createRoot 在 Vue 里挂载。功能完整，但包体积大、构建要配 JSX。推荐。
- B2 iframe 内嵌 excalidraw.com：最简单，但离线不可用、拿不到 onChange，无法同步数据，不满足完整待遇需求，不建议。

B1 构建改动：vite.config.js 加 @vitejs/plugin-react；注意 Vue 与 React 共存的版本冲突。

## 七、指纹约束（关键）

- 不要动 src/groups/geo/utils/fingerprint.js
- 白板元素指纹 = buildFingerprint({ objectName/name, lat, lng, toolId: 'wb-whiteboard', type: 'wb-xxx' })
- toolId 或 type 前缀是白板专属，即使与地图元素同名同坐标也不碰撞
- 无 name 或无 lat/lng 的元素指纹为空，不要登记

## 八、验收标准

1. npm run build 通过
2. 白板画矩形，命名 + 定位，刷新后仍在
3. 信息数据库能看到该白板元素（toolId = wb-whiteboard）
4. 点开元素看到富文本详情
5. 删除元素进回收站，可恢复
6. 反复刷新导入不重复（指纹生效）

## 九、已知风险

- 白板元素必须有 name + lat/lng，否则待遇不全，需 UI 引导补全
- bounds 未设置时无法换算坐标，需绑定地理范围引导
- Vue + React 共存有踩坑史，先跑通最小 demo 再接入业务
- 本轮只注册工具基础设施，未创建组件，/gis/whiteboard 仍落默认欢迎页（正常占位状态）
