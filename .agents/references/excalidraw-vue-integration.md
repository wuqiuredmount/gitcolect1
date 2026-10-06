> 来源：Excalidraw 官方仓库导出 `migrated-project-design.md` 内嵌的 `TARGET_INTEGRATION_VUE.md`（原文件 4.70 KB，修改时间 2026-10-06T12:25:25Z）。
> 抽取时间：2026-10-06。抽取方式：原文逐行照搬，未改写内容，仅去除外层 `` `markdown `` 围栏。
> 关联：`excalidraw-migration-guide.md`（Excalidraw 架构与集成面）、`whiteboard-integration.md`（本项目路线 A 设计）。

---

# Excalidraw 到 Vue 目标项目 集成补充

> 本文件补充 MIGRATION_GUIDE.md，解决一个关键事实：**迁移目标（app100-multifunction）是 Vue 3 + Vite，而 Excalidraw 是 React 组件**。框架不同，Excalidraw 不能直接当 Vue 组件用。

## 0. 核心结论

- 目标：Vue 3 + Vite + TS。
- 源：@excalidraw/excalidraw 是 React 组件库（peer：react / react-dom ^17 || ^18 || ^19）。
- 正确做法不是把 Excalidraw 源码改成 Vue，而是**在 Vue 里挂载一个 React 根**（Vue 与 React 桥接）。
- 两条路线：
  - 路线 A（推荐）：npm 依赖。npm i @excalidraw/excalidraw react react-dom，再写一个 Vue 包装组件。工作量小、可升级。
  - 路线 B：vendor 整个 monorepo 源码。仅在需要深度改造 Excalidraw 内部时选；工作量大，且仍然是 React。
- 两条路线都需要 React 运行时 + 桥接层。

## 1. 路线 A 实现要点（Vue 组件内挂载 React root）

Vue 包装组件要做的：
- onMounted：用一个 div 作容器，用 react-dom/client 的 createRoot 渲染 <Excalidraw />。
- onBeforeUnmount：调用 root.unmount()，清空容器，避免内存泄漏。
- props 传 initialData / theme / UIOptions；onExcalidrawAPI 拿 imperative API，emit 给父组件或存 ref。
- 样式：引入 @excalidraw/excalidraw/index.css。
- 容器必须有**非零高度**（flex:1 或 height:100vh），否则画布空白。

示意（缩进为代码，非正式，以实际 React 版本 API 为准）：

    // ExcalidrawBoard.vue
    <script setup lang="ts">
    import { onMounted, onBeforeUnmount, ref } from "vue";
    import { createRoot } from "react-dom/client";
    import { createElement } from "react";
    import { Excalidraw } from "@excalidraw/excalidraw";
    import "@excalidraw/excalidraw/index.css";

    const host = ref<HTMLDivElement | null>(null);
    let root: ReturnType<typeof createRoot> | null = null;
    const emit = defineEmits<{ (e: "api", api: unknown): void }>();

    onMounted(() => {
      if (!host.value) return;
      root = createRoot(host.value);
      root.render(createElement(Excalidraw, {
        onExcalidrawAPI: (api: unknown) => emit("api", api),
      }));
    });
    onBeforeUnmount(() => { root?.unmount(); root = null; });
    </script>

    <template>
      <div ref="host" style="width:100%; height:100%;"></div>
    </template>

## 2. 懒加载（重要）

React + Excalidraw 体积大，务必做成独立 chunk，只在该功能打开时加载：用 Vue 的 defineAsyncComponent 或路由懒加载包一层。这样 geo 等其他模块不会被强制加载 React。

## 3. 数据持久化

- Excalidraw 用 .excalidraw JSON（serializeAsJSON）。用 imperative API 的 getSceneElements / getAppState / getFiles，或 onChange 拿数据。
- 存到本项目现有存储，不要引入 Excalidraw app 的 IndexedDB / Firebase 层（除非要协作）。
- 加载用 restoreElements / restoreAppState 或 initialData。

## 4. 不要做的事

- 不要把 packages/excalidraw 逐文件改成 Vue。
- 不要引入 excalidraw-app 的协作 / 分享 / PWA / Firebase（除非明确需要）。
- 不要设 window.EXCALIDRAW_ASSET_PATH（除非自托管字体）。

## 5. 可直接粘贴给目标 AI 的指令

任务：把 Excalidraw 集成为本项目「功能区名称」里的白板功能。

先读资料：
- MIGRATION_GUIDE.md（Excalidraw 架构与集成面，重点 0 / 2 / 5 / 6 节）
- TARGET_INTEGRATION_VUE.md（Vue 桥接补充）

硬性约束：
1. 本项目是 Vue 3 + Vite + TS；Excalidraw 是 React 组件。用「Vue 组件内挂载 React root」桥接，不要改写 Excalidraw 为 Vue。
2. 用 npm 依赖：npm i @excalidraw/excalidraw react react-dom（先确认版本与现有依赖不冲突）。
3. 引入 @excalidraw/excalidraw/index.css；容器非零高度。
4. 白板代码懒加载（独立 chunk），不影响 geo 等现有模块。
5. 分阶段执行，每阶段先给方案，经我确认再改代码。

阶段：
1. 只读 + 方案（不改代码）：集成点（哪个 Vue 组件 / 路由 / 菜单）、React 版本影响、依赖清单、风险。
2. 实现 Vue 包装组件（挂载 / 卸载 + props / API）。
3. 接入功能区入口 + 样式 + 懒加载。
4. 接入持久化（用本项目现有存储）。
5. 验证：dev 启动、绘制、导出、卸载、其他模块不受影响。

动手前先回答：用 npm 依赖还是 vendor？集成点是哪个文件？React 版本是否冲突？

## 6. 验收清单

- dev 启动无 React 版本冲突 / 重复 React 警告。
- 打开功能区能看到画布（非空白）。
- 能绘制 / 删除 / 导出。
- 关闭 / 切换后 React root 已 unmount，无内存泄漏。
- 首屏未加载 Excalidraw chunk，其他模块不受影响。
