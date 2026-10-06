# 通用验证命令（被多个 skill 共享）

需要验证数据类改动时按需读取本文件，不要在各自的 SKILL.md 里重复这些命令。

## 1. JSON 合法性

    node -e "const d=require('./public/ai-import/xxx.json'); console.log(d.items?.length ?? 'ok')"

指令文件同理：

    node -e "console.log(require('./public/ai-import/commands/xxx.json'))"

## 2. manifest 与文件一致

清单里列出的每个文件都必须真实存在，反之新增文件必须登记进 manifest：

    ls public/ai-import/*.json
    ls public/ai-import/commands/*.json

## 3. dev server 可达

    curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ai-import/manifest.json
    curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ai-import/commands/manifest.json

均应返回 200。

## 4. 落盘确认

调用写入类工具后，用 search_code 或文件时间戳确认改动已真实写入，不要凭记忆声称已改。
