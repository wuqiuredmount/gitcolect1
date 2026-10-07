# 项目规则索引（Cline 常驻）

项目：app100-multifunction（良件-空间信息共享与集成）
技术栈：Vue 3 + Vite 8 + Vue Router 4 + Leaflet 1.9 + Electron
唯一记忆文件：`.agents/PROJECT_MEMO.md`

> 本文件只放「触发条件 + 硬约定」，保持精简常驻。
> 大段流程说明一律不写在这里，改为命中时用 read_file 按需读取。

---

## 零、新对话启动清单（每个新对话第一步，不用人提醒）

1. **先读** `.agents/PROJECT_MEMO.md`（唯一记忆文件，必读，无例外）。
2. **再读协作信箱** `.agents/mailbox/to-cline.md`
   （若存在且非空 → 那是 DeepSeek 写给你的指令，优先处理）。
   ⚠️ **读完后不要在本文件打「已读」标记**（这是 DeepSeek 的地盘）——
   改为在你下次写 `to-deepseek.md` 时开头声明「【已读】to-cline.md 第 N 轮」。
   通信规则详见 `.agents/references/ai-mailbox-protocol.md`（双读单写、覆盖式、角色分工）。
3. **定位文件用架构地图**（2026-10-08 新增）：`.agents/references/architecture-map.md`
   —— 一站式架构图 + 「改任务时的定位流程」表。**先读它、再决定要不要读局部**，不要先扫全仓。
4. **白板任务**再按需读（**P0/P1/P2 已完成**，不再主动读已完成的规划）：
   - `.agents/references/whiteboard-integration.md`（路线 A 原始约束，**已实施完**）
   - ⚠️ `whiteboard-autonomous-plan.md` **已归档**，除非用户在改遗留 bug，不再读
5. **地图数据任务**按需读下表对应 skill（见「一、触发式加载」）。
6. **动手前先复述**：「上次进度 + 本轮要做什么」，等用户确认后再改代码。
7. 复述内容以 MEMO 的「六、待办」为准，不要凭记忆。
8. **每完成一个任务，报告写进** `.agents/mailbox/to-deepseek.md`（覆盖式，只留本轮），
   对话里简短说一句「报告已写入 mailbox」即可，不必在对话里重复全文。
9. **长任务（超过 3 步）必须用** `.agents/references/active-task.md` **跟踪**：
   - 任务开始 → 填「当前任务 + 目标」
   - 每完成一步 → 立即更新「进度 + 断点」（不攒着）
   - 关键决策 → 也写进去
   - 任务完成 → 清空，恢复空模板
   - 用户发「**继续**」时 → 读本文件从「下一步」续

---

## 一、触发式加载（不要预先读取，命中才读）

| 命中条件 | 必须先读取 |
|---|---|
| **每个新对话（无例外）** | `.agents/mailbox/to-cline.md`（存在且非空 = DeepSeek 的指令，优先处理；**读完后不去本文件打标记**，改为在自己信箱回执）<br>+ `.agents/references/ai-mailbox-protocol.md`（通信协议：**双读单写**、覆盖式、格式、分工） |
| 任何开发 / 数据 / 代码 / 调试任务 | `.agents/PROJECT_MEMO.md`（见「零」启动清单） |
| **定位「改哪个文件」** | `.agents/references/architecture-map.md`（一站式架构图 + 定位流程表） |
| **白板 / Excalidraw / wb- 相关任何改动** | `.agents/references/whiteboard-integration.md`（原始约束，已实施完）<br>+ `.agents/references/architecture-map.md` §四（白板模块现状） |
| 修改、新增、删除代码文件 | `.agents/skills/代码修改返还完整代码/SKILL.md` |
| 批量导入点位（5A/4A/景区/文保/门店等） | `.agents/skills/ai-import-geo-markers/SKILL.md` |
| 删除数据 / 回收站 / 恢复 / 清理 | `.agents/skills/ai-recycle-bin-ops/SKILL.md` |
| 创建或更新 skill | `.webcode/builtin-skills/create-skills/SKILL.md` |
| **执行 npm run crawl（全网抓取）前** | `.agents/references/crawl-security.md`（安全策略 + AI 8 条硬规矩） |
| **任何「改代码」任务开始前** | `.agents/references/red-lines.md`（红线清单：绝对禁止 / 谨慎改动 / 架构 / 数据库 / 命令） |
| **用户只发一个字「继续」时** | `.agents/references/active-task.md`（读「下一步」从断点续；若为空模板则问用户要续哪个任务） |
| **被问及「价值 / 意义 / 哲学 / 使命 / 为什么做这个项目」** | `.agents/MISSION.md`（项目使命与哲学原典；必须**原样引用**，不得改写或稀释） |

加载方式：用 read_file 读取对应文件后，再按其中流程执行，不要凭记忆操作。

---

## 二、硬约定（必须常驻遵守）

0. **身份声明（最先遵守）**：你是 **Cline = 执行者 + 反馈者**。
   - 你能执行（改代码、跑命令、build），但**决策权在 DeepSeek**——架构决策、方案取舍、拿不准的点，**写进 `to-deepseek.md` 留给它裁决**，不要擅自拍板。
   - DeepSeek 与你是**平级的执行者**（它也能改代码），区别只在它多一个**决策权**。
   - 完整分工见 `.agents/references/ai-mailbox-protocol.md` §六。

0.5 **信箱权限（双读单写 · 绝对排他）**：
   - **可读 2 个**：`.agents/mailbox/to-cline.md`（DeepSeek 给你的指令）+ `.agents/mailbox/to-deepseek.md`（你自己的报告）。
   - **只能写 1 个**：**只有 `to-deepseek.md` 是你的地盘**，你可自由覆盖。
   - **绝对禁止**：修改 `to-cline.md` 的**任何字符**（含加标记、删空行、改标点）。
   - **读完对方信后不要打「已读」标记**——改为**在自己下次写 `to-deepseek.md` 时，开头声明「【已读】to-cline.md 第 N 轮」**。
   - 依据：`.agents/references/ai-mailbox-protocol.md` §2.1–2.3。

0.6 **★ 对话框禁写总结（最高规则 · 省 token）**：
   - **任务完成后，不要在对话框里写长篇总结/报告/清单**——那是在重复输出，**浪费 token**。
   - **所有总结只写进你的信箱** `.agents/mailbox/to-deepseek.md`（覆盖式）。
   - **对话框里只回一行**，例如：`任务 A 完成，报告已写入 mailbox`。
   - **理由**：① DeepSeek 通过监控脚本 `npm run watch-cline` 读你的信箱，**不需要你在对话框重复**；② 对话框内容会进入上下文，越长越贵；③ 信箱是唯一权威产出。
   - **例外**：需要用户当场决策/确认的**提问**可放对话框；但**结论、清单、报告**一律进信箱。
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
