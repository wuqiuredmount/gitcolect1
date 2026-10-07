---
name: project-context-resume
description: 当用户在本工作区（app100-multifunction 良件-空间信息共享与集成）提出任何开发、数据、代码、调试任务时，开始工作前必须先使用本技能。用于跨会话恢复项目上下文，解决 DeepSeek 网页版对话长度有限、会话中断导致的「失忆」问题。触发场景包括用户提到「继续」「接着做」「上次那个」「5A」「4A」「鹰眼」「景区」「指纹」「回收站」「导入」，或任何涉及本项目功能的请求。
---

# 项目上下文续接

本工作区使用**外置记忆文件**对抗会话长度限制与会话中断。

## 核心规则

**开始任何本项目任务前，前三步必须读取（顺序不可颠倒）：**

    .agents/PROJECT_MEMO.md                ← 项目「状态」（进度/数据/坑/待办）
    .agents/references/architecture-map.md  ← 项目「结构」（改哪个文件 + 定位流程）
    .agents/mailbox/to-deepseek.md          ← 协作信箱（Cline 的报告 / 指令）

- MEMO 恢复**上下文**（现在在哪、做过什么、还有什么没做）。
- 架构地图恢复**结构**（改任务时该读哪些文件，§六 定位流程表）。
- 信箱检查**Cline 有没有留言**（避免漏掉它的报告，也避免重复劳动）。
- 三份读完，**无需用户复述背景，也无需扫全仓**。

## 工作流

1. 读 `.agents/PROJECT_MEMO.md` + `.agents/references/architecture-map.md`。
2. **读协作信箱** `.agents/mailbox/to-deepseek.md`——若有 Cline 的报告，本轮优先处理；读后标注「（已读）」。通信规则见 `.agents/references/ai-mailbox-protocol.md`。
3. 若 MEMO 提到相关 skill（如 `ai-import-geo-markers`、`ai-recycle-bin-ops`），按需读取对应 `SKILL.md`；通用验证命令见 `.agents/references/common-verification.md`。
4. 按 architecture-map §六「定位流程」定位到具体文件，**只读需要的局部**。
5. 按 MEMO 第二节「协作硬性约定」执行任务。
6. 任务涉及代码修改时，同时遵守 `.agents/skills/代码修改返还完整代码/SKILL.md`。
7. **需要给 Cline 派活时** → 写 `.agents/mailbox/to-cline.md`（覆盖式，格式见协议文档）；**派活前先** `npm run watch-cline -- snapshot` 记基线。
8. **Cline 汇报后** → 先 `npm run watch-cline -- diff` 核验**磁盘事实**（**勿只信界面**），再读 `to-deepseek.md`；异常处理见 `.agents/references/cline-monitor.md`。
9. 本轮对话结束前，更新 MEMO 的「四、数据现状」与「六、待办」；若发现新坑，补进「五」。

## Token 分层（勿破坏）

- Cline 侧常驻规则只有 `.clinerules/00-index.md`，它是薄索引，不要往里面堆正文。
- 大段流程写在 `.agents/` 里，按需 read_file 加载。
- 同一约定不要在多处重复；重复即双份计费。

## 长任务跟踪（2026-10-08 新增）

**任何超过 3 步的任务**，必须用 `.agents/references/active-task.md` 实时跟踪。

- 任务开始：填「当前任务 + 目标 + 恢复指令」
- 每完成一步：**立即更新**「进度 + 断点」（不攒着，每步写一次）
- 关键决策：也写进本文件（切换对话后新 AI 知道"为什么"）
- 任务完成：**清空**，恢复空模板（内容如需留档 → 移进 `PROJECT_MEMO_ARCHIVE.md`）
- **永不累积** —— 它是临时便签，不是历史记录

**用户只发一个字「继续」时**：AI 立即读 `active-task.md`，从「下一步」续；若为空模板，问用户"要续哪个任务"。

**为什么**：对话中断 / 切换 AI 是无损续接的关键 —— 文件在，状态就在。

## 省 token 通用约定（2026-10-08 新增）

1. **本文件 + architecture-map 优先**：先读这两份，再决定要不要读局部，不要先扫全仓。
2. **不为已完成的规划再出方案**：白板 P0/P1/P2 已完成；除非用户明确要求，不再读
   `whiteboard-autonomous-plan.md`。
3. **小决策自己拍板**：prop 命名、日志措辞、注释风格等不必逐条问。
4. **不重复读同一文件**：同一对话内已读过的文件不再读，除非有理由怀疑已变化。
5. **报告精简**：写完 mailbox 后对话里只回一句「已完成，写入 mailbox」。

## 为什么这样做

DeepSeek 网页版上下文有限，长对话会卡顿或中断。把关键信息写进工作区文件，对话断了也无损；约定与踩坑留在文件里，不依赖 AI 记忆力。

## 维护要点

- MEMO 是**唯一权威记忆**，不要另建同类文件。
- architecture-map 是**唯一权威架构图**，结构变化时同步更新。
- 每次完成实质工作后立即更新，不要攒着。
- 更新时保持结构不变，只改内容，便于下次快速定位。
- 数据现状要写**具体数字**（如「5A 级景区 366 条」），不写模糊描述。
- 若存在赛事 / 活动等时间敏感分组，同时记录其时间字段是否已填齐。

## 验证

- `.agents/PROJECT_MEMO.md` 存在且非空。
- 更新后确认「最后更新」日期已刷新。
