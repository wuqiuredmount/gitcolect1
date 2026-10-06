# 白板自主执行指南

> 用途：Cline 已获授权自主执行，本文件是唯一施工依据。
> 每完成一项，回来勾选。踩到红线立即停下报告。
> 决策日期：2026-10-06

---

## 一、目标

Excalidraw 白板上**所有**图形元素（用户画的每一样东西，不论有没有名字），
都要和地图元素享受完全相同的待遇：编号 / 指纹身份 / 富文本详情 / 软删除回收站 /
AI 指令可操作 / 信息数据库可见。

## 二、已确认决策（不得更改）

1. 路线 A：白板是地图补充视图，元素必须带 lat/lng
2. 不改指纹算法（fingerprint.js 一行不动，保持 v4）
3. 元素点开有富文本详情，复用 documents 表
4. **全登记（关键）**：白板所有元素都入库，不论有无名字
   - 无 customData.name 的元素，用 element.id 作为兜底名称参与指纹计算
   - 这样指纹算法本身不动，但每个元素都能拿到有效指纹
5. DB 版本：6 个老库保持 v3，WB 库升 v4（已实施，已验证通过）
6. 依赖 pin：react@18.3.1 / react-dom@18.3.1 / @excalidraw/excalidraw@0.18.1（去掉 ^）
7. R4 禁止平移：先跑最小 demo 验证 0.18 行为再定方案

## 三、待完成任务（按顺序）

### 任务 1：elementSync.js 改为全登记【最高优先】✅ 已完成（2026-10-06）
- 去掉 isRegisterable 里「必须有名字」的条件
- getElementName 空时返回 element.id 兜底
- buildAnnotation 的 name 字段用兜底值
- 保持：删除时显式 unregisterFingerprints、坐标换算失败不登记
- 验收：画一个不命名的矩形，打开信息数据库应能看到它
- 实测：17/17 断言通过（无名元素指纹有效 v4-xxx、不同 element.id 指纹不碰撞、bounds 缺失仍跳过）
- 提交：929ef6b

### 任务 2：字体自托管 ✅ 已完成（2026-10-06）
- 把 node_modules/@excalidraw/excalidraw/dist/prod/fonts 拷到 public/excalidraw-fonts/
- 在启动处设 window.EXCALIDRAW_ASSET_PATH = './excalidraw-fonts/'
- 9 个字体族全拷，中文依赖 Xiaolai 必须包含
- 验收：Electron 离线打开白板，中文文字能正常显示
- 实测：234 个文件 / 12.5 MB 全部就位（Xiaolai 209 个），build 后 dist/excalidraw-fonts 含全部 9 族；
        index.html 内联脚本已写入且相对路径未被 Vite 改写
- 提交：（见下一次 commit）

### 任务 3：GisApp.vue 懒加载接线 ✅ 已完成（2026-10-06）
- 保持 /gis/whiteboard 路由
- GisApp 内用 defineAsyncComponent 懒加载白板组件
- 白板不进 groups 静态数组
- 验收：首屏不加载 React，点开白板才加载
- 实测：主包 index-*.js = 739 KB（无 React）；excalidraw-*.js = 4805 KB、
        WhiteboardTool-*.js = 15.3 KB、ExcalidrawBoard-*.js = 3.2 KB 均为独立异步 chunk，
        点开白板才下载 → 懒加载达成
- 实现要点：新增 WHITEBOARD_GROUP_ID / WHITEBOARD_TOOL 虚拟分组（不进 groups）、
        findToolById 统一查找、allToolsWithWhiteboard 供信息数据库与小工具开关使用、
        onMounted 白板分支、loadAllLayersFromDB 纳入白板
- 提交：（见下一次 commit）

### 任务 4：R4 禁止平移（先验证后实施）
- 先跑最小 demo，验证 Excalidraw 0.18 的 initialData.appState.scrollConstraints 实际行为
- 确认能否做到画布固定；不行则改用读时归一化（公式补 scrollX/scrollY/zoom）
- 验收：白板缩放/平移后，元素坐标不漂移、指纹不变

### 任务 5：WhiteboardTool.vue 主组件 ✅ 已完成（2026-10-06）
- 承接 ExcalidrawBoard + elementSync + boardStore
- onChange 增量同步（新增走 appendLayers，删除走回收站，别用 saveAllLayers 全量）
- 验收：白板画图，刷新后仍在，元素在信息数据库可见
- 实测：组件已创建并通过 build；onChange 经 800ms 防抖调 syncScene（元素级增量），
        卸载时仅整体落库「场景」（saveBoard，不算元素级覆盖）
- 提交：（见下一次 commit）

### 任务 6：富文本详情组件核实与接入
- 先查清项目现有详情组件是哪个（InfoPanel.vue / MarkerDocPanel.vue / InfoDatabase 渲染路径）
- 确认后复用，不重造

## 四、红线（碰了立即停）

1. 绝不修改 fingerprint.js
2. 白板元素 type 一律加 wb- 前缀
3. 不破坏既有地图功能（改 GisApp 前先跑 build）
4. 不删除 public/ai-import/ 与 public/pending-unplaced/ 下的业务数据
5. 每个任务完成后 npm run build 必须通过
6. 每完成一个任务，git commit 一次，便于回滚

## 五、工作方式

- 每完成一个任务，回来更新本文件的勾选状态
- 遇到不确定的，先跑最小验证，不要猜
- 若发现本指南与实际情况冲突，停下报告，不要擅自改

## 六、验收总标准

1. npm run build 通过
2. 白板画多个元素（含未命名），全都能在信息数据库看到
3. 每个元素点开有富文本
4. 删除元素进回收站，可恢复
5. 反复刷新导入不重复（指纹生效）
6. 地图功能完全不受影响
