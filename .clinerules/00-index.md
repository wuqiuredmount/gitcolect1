# 项目规则索引（Cline 常驻）

项目：app100-multifunction（良件-空间信息共享与集成）
技术栈：Vue 3 + Vite 8 + Vue Router 4 + Leaflet 1.9 + Electron
唯一记忆文件：`.agents/PROJECT_MEMO.md`

> 本文件只放「触发条件 + 硬约定」，保持精简常驻。
> 大段流程说明一律不写在这里，改为命中时用 read_file 按需读取。

---

## 零、新对话启动清单（每个新对话第一步，不用人提醒）

1. **先读** `.agents/PROJECT_MEMO.md`（唯一记忆文件，必读，无例外）。
2. **白板任务**再读（存在才读，不存在则跳过并在报告里说明）：
   - `.agents/references/whiteboard-integration.md`（路线 A 交接：目标/约束/数据映射）
   - `.agents/references/whiteboard-autonomous-plan.md`（自主执行指南：任务清单/红线）
   - `.agents/references/whiteboard-full-capability-plan.md`（**当前不存在**，属预期；
     若用户后续创建，白板任务必须读）
3. **地图数据任务**按需读下表对应 skill（见「一、触发式加载」）。
4. **动手前先复述**：「上次进度 + 本轮要做什么」，等用户确认后再改代码。
5. 复述内容以 MEMO 的「六、待办」为准，不要凭记忆。

---

## 一、触发式加载（不要预先读取，命中才读）

| 命中条件 | 必须先读取 |
|---|---|
| 任何开发 / 数据 / 代码 / 调试任务 | `.agents/PROJECT_MEMO.md`（见「零」启动清单） |
| **白板 / Excalidraw / wb- 相关任何改动** | `.agents/references/whiteboard-integration.md`<br>+ `.agents/references/whiteboard-autonomous-plan.md`<br>+ `.agents/references/whiteboard-full-capability-plan.md`（存在才读） |
| 修改、新增、删除代码文件 | `.agents/skills/代码修改返还完整代码/SKILL.md` |
| 批量导入点位（5A/4A/景区/文保/门店等） | `.agents/skills/ai-import-geo-markers/SKILL.md` |
| 删除数据 / 回收站 / 恢复 / 清理 | `.agents/skills/ai-recycle-bin-ops/SKILL.md` |
| 创建或更新 skill | `.webcode/builtin-skills/create-skills/SKILL.md` |

加载方式：用 read_file 读取对应文件后，再按其中流程执行，不要凭记忆操作。

---

## 二、硬约定（必须常驻遵守）

1. **只追加，不改既有逻辑**——除非用户明确要求改动。
2. **改代码返回完整文件代码**，不输出片段。
3. **高德额度零消耗**——坐标由采集阶段提供，导入器不调用 geocode。
4. **图片用外链**（Wikimedia 等），不使用 base64。
5. **IndexedDB 不换存储系统**。
6. **AI 无法直接写浏览器 IndexedDB**，只能通过指令文件间接操作。
7. **语言中文；风格直接给结果，少铺垫。**

---

## 三、每轮任务结束前必做

1. 更新 `.agents/PROJECT_MEMO.md` 的「四、数据现状」与「六、待办」，并刷新「最后更新」日期。
2. 若发现新坑，补进 MEMO 的「五、踩过的坑」。
3. 确认改动已 `npm run build` 通过。
4. 调用写入类工具后，用 search_code 或文件时间戳确认已落盘。

---

## 四、环境提醒

- 新增 `.js` 文件后 Vite HMR 可能不生效，需 **Ctrl+Shift+R** 强制刷新验证。
- IndexedDB 按域名隔离，只能在应用页面（localhost）调试，勿在 AI 页面控制台读取。

---

## 五、本文件（`.clinerules/`）的生效方式

**结论：自动加载，无需手动开启。** 官方文档确认（docs.cline.bot/features/cline-rules）：

- 工作区规则目录：`.clinerules/` 或 `.cline/rules/`，**两者都会被搜索并合并**为一个规则集
  （本项目只用 `.clinerules/`，不必复制到另一处）
- **多文件支持**：同一目录下所有 `.md` 都会被读取合并；数字前缀（如 `00-index.md`）
  **只用于排序、可选**，不影响是否加载
- 默认**全部规则常驻自动加载**；不需要 YAML frontmatter
- 本文件**不加** frontmatter ⇒ 常驻生效（符合「薄索引常驻」设计）
- 若某条规则要**只在特定路径下生效**，才加 frontmatter：
  ```md
  ---
  paths:
    - "src/groups/whiteboard/**"
  ---
  ```
  注意：`paths` 会变成**条件规则**，只在命中路径时才加载——本索引是全局风格，**不加**。
- 开关位置：VS Code 侧边栏 **Cline → Rules 面板**，可逐条 toggle；
  关掉即本次会话不加载，**不影响文件本身**（所以改规则永远比改面板可靠）
- 兼容来源（自动识别，不用配置）：`.cursorrules`、`.windsurfrules`、
  `AGENTS.md` / `~/.agents/AGENTS.md`
- ⚠️ 规则变更后：**新对话自动生效**；当前对话可能仍用旧规则，
  若发现没生效，**开一个新对话** 即可
