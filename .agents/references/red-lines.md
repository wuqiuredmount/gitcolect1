# 红线清单（AI 绝对不能动）

> **用途**：防止 AI（含 Cline、DeepSeek 网页版、采集员）误改 / 越界改 / 破坏性改。
> **触发条件**：任何"改代码"任务开始前，先扫一眼本文件。**命中红线立即停，报告用户。**
> 最后更新：2026-10-08

---

## 一、绝对禁止（🔴 命中即停）

| 文件 / 目录 | 原因 |
|---|---|
| `src/groups/geo/utils/fingerprint.js` | 指纹算法 v4 是全系统身份基石，改动会导致**全量重复导入**（历史事故）|
| `src/groups/geo/utils/fingerprintStore.js` | 指纹索引层，改动会破坏 O(k log n) 去重 |
| `src/groups/geo/utils/toolDB.js` 的 `openToolDB` | 库版本升级逻辑，改动可能让**老数据打不开** |
| `src/groups/geo/utils/migrationManager.js` | 迁移链，改动可能让老数据损坏 |
| `src/groups/geo/utils/annotationStore.js` 的 `saveAllLayers` | 原子替换入口，**改动易引起数据丢失**（历史事故：426 条丢失）|
| `src/groups/whiteboard/utils/elementSync.js` 的**删除分支** | 唯一删除入口，改动会让删除失效或误删 |
| `src/groups/whiteboard/utils/boardStore.js` 的 `saveBoard` CAS | 并发控制，改动会重新引入"静默数据丢失" |
| `public/ai-import/5a-batch-*.json` | 已采集的 5A 数据，**只追加，不修改** |
| `public/ai-import/4a-batch-*.json` | 同上 |
| `package-lock.json` | 依赖锁定，**只有 `npm install` 能改** |
| `electron-main.cjs` | 打包入口 |
| `.clinerules/00-index.md` 的「硬约定」章节 | 项目级规则 |

**发现任务要求改上述文件**：
1. **停下**，不自行决定
2. 向用户说明：要改什么、为什么、风险是什么
3. **等用户明确批准**才动

---

## 二、谨慎改动（🟡 必须向用户说明后再动）

| 文件 / 目录 | 谨慎原因 |
|---|---|
| `src/groups/geo/utils/*` 其他文件 | 共享数据层，改一处影响所有工具 |
| `src/groups/whiteboard/utils/elementSync.js` 非删除分支 | 同步核心 |
| `src/views/GisApp.vue` | 总编排层，改错会让全应用崩 |
| `src/router/index.js` | 路由，改错会跳转异常 |
| `.agents/PROJECT_MEMO.md` | 唯一记忆，**只追加不重写** |
| `.agents/references/*.md` | 参考文档，**只追加不删除** |
| `public/ai-import/manifest.json` | 导入清单，**只追加新文件** |

---

## 三、架构红线（🔴 目录结构层）

**不得擅自改动**：

1. **`src/groups/` 的顶层结构**（geo / whiteboard 两个工具组）
2. **`src/groups/geo/utils/` 的模块名**（如 `fingerprint.js` 改名会让 import 断裂）
3. **每工具一库的 DB 命名规则**（`LiangJian_Tool_XX`）
4. **工具 id 前缀**（`geo-*` / `wb-*`），已硬编码在多处
5. **路由路径**（`/gis/geo` / `/gis/card` / `/gis/whiteboard`）

**新增文件是允许的**——但**不修改既有文件名**。

---

## 四、数据库红线（🔴 数据层）

| 规则 | 说明 |
|---|---|
| **不动 IndexedDB 库名 / 表名 / 版本号** | 改动会让已有数据打不开 |
| **不改指纹算法** | 见第一节 |
| **`saveAllLayers` 不能改成"合并"语义** | 它必须是原子替换 |
| **不在数据层加"自动清理"** | 会误删 |
| **AI 不写浏览器** | 硬约定（AI 无浏览器访问权）|

---

## 五、操作红线（🔴 命令层）

**以下命令，无用户明确批准一律不执行**：

- `git reset --hard`
- `git push -f`
- `git clean -fd`
- `rm -rf`（任何路径）
- `npm uninstall`（任何包）
- 修改 `.git/` 下的任何文件（除 hooks 由脚本生成）
- 修改 `.clinerules/`（除用户明确要求）
- 修改 `tsconfig.json` / `vite.config.js` 的 **插件列表 / 别名**（只允许追加插件）

---

## 六、允许的操作（白名单）

- **新增文件**（只要不改既有文件名）
- **追加行**（不改既有语义）
- **加可选参数**（默认值保持原样）
- **加注释 / 文档**
- **新增测试 / 脚本**
- **改样式文件**（CSS，且不影响功能）
- **改文案**（不动逻辑）

---

## 七、AI 自查清单（动手前问自己 5 句）

1. 我要改的文件在**红线清单**里吗？
2. 我的改动**改变既有函数语义**了吗？
3. 我的改动会影响**指纹 / 数据层 / 删除入口**吗？
4. 我的改动能让**老数据打不开**吗？
5. 我该**先向用户报告**吗？

**任一为"是"或"不确定"，停下报告。**

---

## 八、违反后的恢复

1. **立即停止所有写操作**
2. 报告用户：改了什么、什么时候、为什么
3. 用 `npm run integrity -- check` 定位变化文件
4. 用 `npm run backup` 的最近备份恢复
5. 若无备份：`git log` 找最近正确 commit → `git diff` 对比 → 手工回滚

---

## 九、变更历史

| 日期 | 变更 |
|---|---|
| 2026-10-08 | 首版：绝对禁止 + 谨慎改动 + 架构 + 数据库 + 命令五类红线 |
