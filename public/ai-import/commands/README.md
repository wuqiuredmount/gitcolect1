# AI 数据指令目录

AI 通过 webcode 把指令 JSON 写到这里，应用在「信息回收站 → 🤖 AI指令」面板读取并执行。

## 指令格式

通用字段：

- command：指令类型，取值 delete / list-recycle / restore / purge
- toolId：目标工具 id，如 geo-eagle-eye；省略表示全部工具
- target：目标描述，含 ids（精确编码数组）、nameKeyword（名称关键词）、fileId
- reason：可选，AI 填写的执行原因，会展示给用户

## 四种指令

1. delete —— 删除特定数据（先移入回收站，可恢复）
2. list-recycle —— 读取回收站内容（不删不改）
3. restore —— 从回收站恢复特定数据
4. purge —— 从回收站彻底删除（不可恢复）

## 示例

按关键词删除：

    { "command": "delete", "toolId": "geo-eagle-eye", "target": { "nameKeyword": "临时测试" }, "reason": "用户要求清理测试数据" }

按编码恢复：

    { "command": "restore", "toolId": "geo-eagle-eye", "target": { "ids": ["EH.00007"] }, "reason": "用户要求恢复颐和园" }

读取回收站：

    { "command": "list-recycle", "toolId": "geo-eagle-eye" }

## 规则

1. 所有指令执行前都会弹确认框，用户确认后才真正执行。
2. delete 与 purge 都会校验目标，匹配不到则影响 0 条，不会误删。
3. 新增指令文件后，把文件名加进本目录的 manifest.json。
4. 指令执行完建议删除对应指令文件，保持目录干净。
