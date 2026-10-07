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

## 二·补、端口数量的科学（2026-10-07 实测结论）

**结论：6 个是甜点区，不建议无限扩展。**

### 实测成本（2026-10-07）

| 指标 | 数值 |
|---|---|
| 系统总内存 | 31.7 GB |
| 当时可用内存 | 8.1 GB |
| 单个调试实例（Edge） | 约 500MB-1GB |
| 单个 MCP server（node） | 约 80MB |
| **单端口合计** | **约 600MB-1GB** |

### 为什么不建议更多

1. **协调成本 > 并行收益**：单任务通常只需 1-2 个源，端口多了闲置。多省并行才值得开 3+。
2. **真正瓶颈不在端口数**：
   - 用户按「继续」的次数 —— 加端口治不了
   - 导入是串行的（AI 写不了 IndexedDB）—— 加端口治不了
3. **内存换不来速度**：7 个端口 ≠ 快 7 倍。真正的加速来自减少往返（collect 脚本、批量调用），不是堆端口。

### 推荐配置

| 用途 | 端口 | 说明 |
|---|---|---|
| 主 | 9222 | 常驻，已登录高德 |
| 采集员 | 9223-9225 | 3 路并行，够大多数场景 |
| 余量 | 9226-9227 | 已配置，偶尔用 |

### 确需更多时

- **按需临时开**：脚本支持 `-Ports 9228`，不必永久配置
- 硬上限：RAM 约可再容纳 5-8 个；每加一个需改 settings.json + 重载

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
