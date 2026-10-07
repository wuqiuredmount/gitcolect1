# 浏览器自动启动指南

> 目的：让 AI 在收到「采集 / 收集信息」命令时，**自动确保浏览器端口就绪**，无需用户手动操作。
> 建立：2026-10-07

---

## 一、AI 执行时机

**每次开始采集任务前（尤其是新会话 / 关机重启后）**，AI 应先执行：

    powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1 -All -Quiet

- `-All`：启动全部已配置端口（9222-9227）
- `-Quiet`：只输出一行 `READY=9222,9223,...`，便于解析
- **幂等**：已在运行的端口自动跳过，可安全重复执行

预期输出：

    READY=9222,9223,9224,9225,9226,9227

若出现 `FAILED=...`，说明对应端口未能就绪，AI 应仅使用 `READY` 中的端口。

---

## 二、端口规划

| 端口 | 角色 | user-data-dir | MCP server 名 |
|---|---|---|---|
| 9222 | 主 | `%USERPROFILE%\edge-debug-profile` | `edge-devtools` |
| 9223 | 采集员 A | `%USERPROFILE%\edge-debug-a` | `edge-devtools-a` |
| 9224 | 采集员 B | `%USERPROFILE%\edge-debug-b` | `edge-devtools-b` |
| 9225 | 采集员 C | `%USERPROFILE%\edge-debug-c` | `edge-devtools-c` |
| 9226 | 采集员 D | `%USERPROFILE%\edge-debug-d` | `edge-devtools-d` |
| 9227 | 采集员 E | `%USERPROFILE%\edge-debug-e` | `edge-devtools-e` |

---

## 三、扩展端口（需要用户操作，一次）

MCP server 配置在 `.vscode/settings.json` 的 `webcodeGateway.servers`。
**新增端口必须在配置里注册，且重载 webcode 后才生效。**

新增一个端口的配置模板：

    "edge-devtools-d": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9226"
      ]
    }

步骤：
1. 编辑 `.vscode/settings.json`，在 `webcodeGateway.servers` 下新增条目
2. **重载 VS Code**（`Ctrl+Shift+P` → `Developer: Reload Window`）
3. 重载后，AI 即可使用新 server 名

---

## 四、并行采集原则

- **一端口一任务**：同一端口不要同时跑两个采集任务，会互相抢页面
- **一轮并发**：同一轮内对不同端口发起调用（如 9222 开百度、9223 开 Bing）
- **合并读取**：导航与读取可合并到同一轮，减少往返

---

## 五、故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `list_pages` 报连接失败 | 该端口 Edge 未启动 | 跑启动脚本 |
| 端口在监听但 MCP 连不上 | MCP server 未配置 / 未重载 | 检查 settings.json，重载 |
| 坐标精度只有 2 位 | 该端口未登录高德 | 手动登录一次（登录态会保留） |
| 脚本报端口失败 | 端口被占用 / Edge 路径变化 | 检查端口占用，确认 msedge.exe 路径 |

---

## 六、登录态说明

- 登录态存在各自的 `user-data-dir` 里，**只要该目录不删就保留**
- 高德登录后坐标精度 6 位（未登录只有 2 位）→ 建议 9222 保持登录
- 其他采集端口是否需要登录，视采集源而定
