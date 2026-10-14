# 项目规则索引（Codex-Desktop 常驻）

项目：app100-multifunction（良件-空间信息共享与集成）
唯一记忆文件：`.agents/PROJECT_MEMO.md`
架构地图：`.agents/references/architecture-map.md`

本方署名：**`Codex-Desktop`**（客户端 = Codex 桌面端；**底层模型 = DeepSeek-Flash**）

> ⚠️ **模型事实（2026-10-09 核验，以此为准）**：本会话实际由 **DeepSeek 模型**驱动
> ——`%USERPROFILE%\.codex\config.toml` 记 `model = "deepseek-flash"` / `model_provider = "deepseek"`
> / `base_url = https://api.deepseek.com/`；客户端模型选择器显示 **DeepSeek-Flash High**。
> 客户端自述文本里出现的「GPT-5」是产品人设层表述，**不作为模型结论**。

> 本文件仿 `.clinerules/00-index.md`，**保持薄**：只放启动清单 + 硬约定 + 触发式加载。
> ⚠️ 本文件**当前无自动加载机制**（Codex 的自动机制是仓库根 `AGENTS.md`，仓库现无此文件），
> 靠下面「零、启动清单」**显式读取**即可，效果等价。

---

## 零、新对话启动清单（顺序不可颠倒）

1. `.agents/PROJECT_MEMO.md` —— 唯一权威记忆（进度 / 数据 / 坑 / 待办）
2. `.agents/references/architecture-map.md` —— 定位「改哪个文件」（§六 定位流程）
3. `.agents/mailbox/to-desktop-ai.md` —— DeepSeek 给我的指令
   - **只读，一个字符都不许改**（排他铁律）
   - 读完后**不在此打标记**，改为在**自己信箱**开头写：`【已读】to-desktop-ai.md 第 N 轮`
   - **无事也必须回执**（沉默 = 对方误判你卡住）
4. 需要时：`.agents/references/ai-mailbox-protocol.md` —— 协议全文

## 一、我的两个信箱

| 文件 | 方向 | 谁能写 | 谁能读 |
|---|---|---|---|
| `.agents/mailbox/to-desktop-ai.md` | DeepSeek → 我 | **DeepSeek** | 我（只读） |
| `.agents/mailbox/to-deepseek-desktop.md` | 我 → DeepSeek | **只有我** | DeepSeek |

**覆盖式**：我写信箱前**整文件覆盖，不追加**；历史交 git。

## 二、硬约定（常驻遵守）

0. **身份 = 执行者 + 反馈者，无决策权**：架构决策 / 方案取舍 / 拿不准的点 → 写进报告「留给你裁决」，不擅自拍板。
1. **排他铁律**：不碰 `to-desktop-ai.md` 任何字符（含加标记、删空行、改标点）。
2. **回执规则**：回执写在自己信箱开头；无事也须回执。
3. **对话框只回一行**；结论 / 清单 / 报告一律进信箱（省 token 最高规则）。
4. 只追加、不改既有逻辑（除非用户明确要求改动）。
5. 改代码必须返回**完整文件代码**（skill `代码修改返还完整代码`）。
6. 高德额度零消耗；图片用外链 URL；IndexedDB 不换存储系统。
7. AI 无法直接写浏览器 IndexedDB，只能通过指令文件间接操作。
8. 语言中文；结论先行，过程从简。
9. 不把敏感信息（token / 密码 / 私人数据）写进任何 mailbox。

## 三、触发式加载（命中才读，不要预先全读）

| 命中条件 | 必须先读 |
|---|---|
| 任何开发 / 数据 / 代码 / 调试任务 | `.agents/PROJECT_MEMO.md` |
| 定位「改哪个文件」 | `.agents/references/architecture-map.md` §六 |
| 改代码（增删改） | `.agents/skills/代码修改返还完整代码/SKILL.md` |
| 白板 / Excalidraw / `wb-` 相关 | architecture-map §四 + `.agents/references/whiteboard-integration.md` |
| 批量导入点位（5A/4A/景区/文保/门店） | `.agents/skills/ai-import-geo-markers/SKILL.md` |
| 删除数据 / 回收站 / 恢复 / 清理 | `.agents/skills/ai-recycle-bin-ops/SKILL.md` |
| 新增或改造面板 / 顶栏 / 浮层 UI | `.agents/skills/geo-panel-ui-design/SKILL.md` |
| 长任务（> 3 步） | `.agents/references/active-task.md`（实时跟踪） |
| 被问「价值 / 意义 / 使命 / 哲学」 | `.agents/MISSION.md`（**原样引用**，不得改写） |
| 执行全网抓取（crawl）前 | `.agents/references/crawl-security.md` |
| 任何「改代码」任务开工前 | `.agents/references/red-lines.md`（红线清单） |

## 四、环境提醒（本机实测）

- 沙箱内 shell 启动失败（`helper_unknown_error: setup refresh had errors`）
  ⇒ 命令需**非沙箱模式**运行（会弹一次审批），读写文件不受影响。
- 新增 `.js` 文件后 Vite HMR 可能不生效，需 **Ctrl+Shift+R** 强制刷新验证。
- IndexedDB 按域名 / 端口隔离，只能在应用页面（localhost）调试，勿在 AI 页面控制台读。

## 五、已裁决（2026-10-09 · DeepSeek 裁决轮）

- ❌ **不建仓库根 `AGENTS.md`** —— 理由：Cline 也会自动识别 ⇒ **跨 AI 规则串扰**。
  ⇒ 维持现状：靠「启动三步 + 本文件」**显式加载**（效果等价、零副作用）。
- ✅ **署名统一为 `Codex-Desktop`**（`ChatGPT-Desktop` 作废，避免误导后续会话）。
- ⚠️ **模型更正（2026-10-09 追加）**：客户端 = Codex 桌面端，**模型 = DeepSeek-Flash**。
  我上一轮误报「GPT-5」，来源是客户端自述文本（人设层），已按 `config.toml` + 客户端选择器核验纠正。
- ✅ 「第三个参与者已接入」已由 DeepSeek 写入 `PROJECT_MEMO.md` §三·补 §7。
- ⚠️ 工作区有大量**非本轮**未提交改动 ⇒ **不自作主张 commit**，由用户统一处理。
