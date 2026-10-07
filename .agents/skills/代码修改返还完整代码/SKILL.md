---
name: change-code-and-return-full-code
description: 当用户的意图是修改（增删改）代码文件时，无论用户有没有明确要求，都自动应用此技能。不输出片段，直接返回修改后的完整文件代码。
---

# 代码修改返还完整代码技能

当用户意图是增删改代码文件时，自动应用本技能。

## 定位优先（2026-10-08 新增，省 token 核心约定）

**读取文件前，先用最轻的工具定位，再精确读段。**

| 优先级 | 工具 | 何时用 |
|---|---|---|
| 1 | `npm run lookup -- symbol <name>` | 找函数 / 常量 / 类定义 |
| 2 | `npm run lookup -- section <name>` | 找 `// ===== [SECTION:xxx] =====` 标记 |
| 3 | `npm run lookup -- text <keyword>` | 找任意文本（最多 30 处 ±3 行） |
| 4 | `search_code` | 找代码内容（带行号） |
| 5 | `search_files` | 找文件名 / 路径 |
| 6 | `read_file` **带 start_line/end_line** | 只在已知行号范围时读段 |
| 🚫 | `read_file` **全文读 >300 行的文件** | **禁止**，除非用户明确要求 |

**硬规则**：
1. **同一对话内不重复读同一文件**——已读过的直接用记忆，除非有理由怀疑已变化。
2. **`read_file` 必须带 `start_line`/`end_line`**（目标 ±50 行）；不带的默认视为全文读，须有明确理由。
3. **大文件（elementSync.js / WhiteboardTool.vue / GisApp.vue / BaseMapTool.vue）优先用 lookup**。

**为什么**：webcode 的 `read_file` 结果会**永久注入后续每一轮上下文**。读 1 个 900 行文件 = 900 行永久占用。`lookup` 单次只回 ±3 行 × 命中数，通常 10 行内。

## 规则

1. **先定位（按上表），再读段**——不要一上来就全文读。
2. 通过 webcode 的 write_file / edit_file 把改动真实落盘。
3. 在回复中必须输出修改后完整的代码块，而不是片段或 diff。
4. 代码块用三个反引号开头，并标注语言（如 vue / js / css），同时写明文件路径。
5. 简要说明改了什么，核心是给出可直接复制的完整代码。
6. 落盘后按 .agents/references/common-verification.md 的「落盘确认」复核。
7. 改动前端代码后跑 npm run build 确认通过；纯样式或纯数据文件可豁免。
8. 遵循「只追加」：改造共享组件时新增可选参数、默认值保持原样，不破坏既有调用方。

## 边界

- 通用硬约定（只追加、返回完整代码等）见 .clinerules/00-index.md，本文件不重复。
- 本技能只管代码文件；纯文档 / markdown 不受此约束，按任务正常处理。
