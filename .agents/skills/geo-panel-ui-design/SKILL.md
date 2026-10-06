---
name: geo-panel-ui-design
description: 当需要新增或改造鹰眼公共平台（及其他地图工具）的界面面板、工具栏、顶栏按钮、浮层或下拉控件时使用。触发词包括「固定到顶栏」「工具栏」「面板」「折叠」「拖拽」「设计规范」「UI 改造」「加个按钮」「换个样式」。用于保证新面板与项目既有的 MapPanel 体系、顶栏 Teleport 插槽和配色风格一致。
---

# 地图工具面板与顶栏 UI 设计

本工作区的界面改造遵循统一的面板体系。新增或改动面板前，先按本流程确认落点与模式，避免自造一套并行结构。

## 一、现有面板体系

核心组件：src/components/tools/geo/panels/MapPanel.vue

它是所有小面板的外壳，提供两种模式：

1. **浮层模式（默认）** —— 绝对定位在地图左下，可点击标题折叠、可拖拽移动。
2. **inline 顶栏模式** —— 传 inline 属性后，变为顶栏上的「按钮 + 下拉」，不可拖拽，点击标题切换展开。

用 inline 模式的面板：定位查找、信息栏、AI 批量导入。
用浮层模式的面板：图层透明度、标记文档等。

## 二、顶栏插槽

顶栏结构在 src/views/GisApp.vue 的 active-tool-header 内，其中：

    <div id="tool-header-slot" class="header-slot"></div>

是要挂载顶栏控件的位置。样式为 flex: 1; display: flex; align-items: center。

面板要固定到顶栏时，用 Teleport 把组件投递进该插槽：

    <Teleport to="#tool-header-slot">
      <YourPanel inline ... />
    </Teleport>

图形列表（LayerListPanel）已是这种方式，可直接参考其写法。

## 三、新增面板的流程

1. 确认落点：是浮层还是顶栏？顶栏用 inline + Teleport；浮层直接放模板并用 MapPanel 包裹。
2. 复用 MapPanel 外壳，不要另写定位、折叠、拖拽逻辑。
3. 若需要新的开关项，在 BaseMapTool.vue 的 finalVisibleTools 中加键，并保持默认值保守（不擅自开启）。
4. 样式用 scoped，字号与既有面板对齐（标题 12px、正文 10px）。
5. 配色沿用：主色 #1890ff，边框 #e5e7eb，浅底 #f8f9fa，hover #eef1f5。

## 四、inline 模式样式约定

- 容器：position relative，flex 0 0 auto，右侧留 8px 间距，无阴影。
- 标题栏：cursor pointer，内边距 6px 12px，圆角 6px，hover 变浅灰。
- 下拉体：绝对定位到标题下方，z-index 2000，白底 + 边框 + 投影，最大高度 72vh 且可滚动。
- 展开时标题栏保留下边框；折叠时圆角回到 6px 全包。

## 五、层叠上下文陷阱（务必牢记）

Leaflet 内部窗格自带高层级：marker-pane 600、popup-pane 700。若承载地图的容器没有创建层叠上下文，这些层级会泄漏到上层，把顶栏和其它面板压住。

因此承载地图的容器（本项目的 .tool-content）必须写：

    isolation: isolate;
    z-index: 0;

顶栏与地图是兄弟节点时，顶栏 z-index 要显著高于地图容器（本项目取 1100）。调 z-index 前先用浏览器实测各元素的计算层级与 elementFromPoint 命中结果，不要凭猜。

## 六、硬性约束

- 只追加，不改既有面板的默认行为。改造共享组件（如 MapPanel）时必须新增可选属性，默认值保持原样，否则会波及其它工具。
- 不改动 IndexedDB 数据层与导入逻辑，纯 UI 改造不触碰数据。
- 新增 .js 或 .vue 文件后，Vite HMR 可能不生效，需 Ctrl+Shift+R 强刷验证。
- 改完必须跑 npm run build 确认通过。

## 七、验证清单

1. 目标面板出现在预期位置（顶栏或浮层），展开与折叠正常，下拉内容不被裁剪。
2. 其它工具的面板未受影响（切到中国卫星地图等工具抽查）。
3. 浮层面板拖拽仍可用，inline 面板不被误拖。
4. npm run build 通过。
