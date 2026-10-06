---
name: ai-recycle-bin-ops
description: 当用户要求 AI 删除地图上的特定数据、读取信息回收站内容、恢复被删除的数据、或彻底清理回收站时使用。适用于鹰眼公共平台及其他地图工具中的图形与富文本数据。触发词包括「删除某景区」「读取回收站」「恢复某数据」「清理回收站」「AI帮我删掉」。
---

# AI 回收站数据操作

让 AI 通过指令文件，对应用数据执行删除、读取回收站、恢复、彻底删除。所有操作在执行前都会弹确认框，用户确认后才生效。

## 触发场景

- 用户要求删除特定数据，如「删掉所有临时测试的标记」「删除颐和园」
- 用户要求查看回收站，如「回收站里有什么」「列出被删除的数据」
- 用户要求恢复数据，如「恢复刚才删掉的颐和园」
- 用户要求彻底清理，如「清空回收站」「永久删除某条」

## 架构位置（本工作区）

- 指令执行器：`src/groups/geo/utils/aiDataCommand.js`
- 回收站数据层：`src/groups/geo/utils/recycleStore.js`
- 回收站面板：`src/components/common/RecycleBinModal.vue`
- 指令投放目录：`public/ai-import/commands/`
- 回收站表：`recyclebin`（每工具库一张，keyPath 为 id）

## 指令格式

通用字段：

- `command` 必填。取值 delete / list-recycle / restore / purge
- `toolId` 可选。目标工具 id，如 geo-eagle-eye；省略表示全部工具
- `target` 可选。目标描述，含 `ids`（精确编码数组）、`nameKeyword`（名称关键词）、`group`（分组名，2026-10-06 新增，用于删除整个分组）、`fileId`
- `reason` 可选。AI 填写的执行原因，会展示给用户

## 四种指令语义

1. `delete` 删除特定数据。先移入回收站，可恢复。会从 annotations 与 documents 移除。
2. `list-recycle` 读取回收站内容。只读，不删不改，返回 id、名称、所属工具、删除时间。
3. `restore` 从回收站恢复。把图形与富文本搬回正式表，并从回收站移除。
4. `purge` 从回收站彻底删除。不可恢复。

## 工作流

1. 明确用户意图，映射到四种指令之一。
2. 定位目标：优先用精确 `ids`，其次用 `nameKeyword`。不确定时先用 `list-recycle` 读取现状。
3. 写指令 JSON 到 `public/ai-import/commands/<name>.json`。
4. 把文件名加进 `public/ai-import/commands/manifest.json`。
5. 告诉用户在「信息回收站 → 🤖 AI指令」面板选择该文件并点执行，确认后生效。

## 指令示例

按关键词删除：

    { "command": "delete", "toolId": "geo-eagle-eye", "target": { "nameKeyword": "临时测试" }, "reason": "用户要求清理测试数据" }

按分组删除整组：

    { "command": "delete", "toolId": "geo-eagle-eye", "target": { "group": "11月全国运动赛会" }, "reason": "数据需重导" }

按编码恢复：

    { "command": "restore", "toolId": "geo-eagle-eye", "target": { "ids": ["EH.00007"] }, "reason": "用户要求恢复颐和园" }

读取回收站：

    { "command": "list-recycle", "toolId": "geo-eagle-eye" }

彻底删除：

    { "command": "purge", "toolId": "geo-eagle-eye", "target": { "nameKeyword": "废弃" }, "reason": "用户要求永久删除废弃数据" }

## 硬性约束（补充项，通用约定见 `.clinerules/00-index.md`）

- 所有指令执行前都会弹确认框，用户不确认则不执行。
- 删除与彻底删除都会校验目标，匹配不到则影响 0 条，不会误删。
- 删除采用软删除（进回收站），只有 purge 与清空才是永久删除。

## 验证

通用检查（JSON 合法性、manifest 一致性、dev server 可达、落盘确认）见 `.agents/references/common-verification.md`。

本技能专属：执行完毕后删除对应指令文件，保持 `public/ai-import/commands/` 目录干净。
