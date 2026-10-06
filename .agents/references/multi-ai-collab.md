# 多 AI 协作协议（主 AI + 信息采集员）

## 一、角色

| 角色 | 职责 | 浏览器端口 |
|---|---|---|
| 主 AI | 制定方案 / 分配片区 / 质检 / 汇总 manifest / 维护 MEMO / 协调导入 | 9222 |
| 采集员 A | 按分配片区采集，只写自己的分片文件 | 9223 |
| 采集员 B | 同上 | 9224 |
| 采集员 C | 同上 | 9225 |

主 AI 是唯一负责人；采集员只做「信息采集」，不参与架构决策，不碰 manifest，不碰 MEMO。

## 二、隔离铁律（缺一不可）

1. **一 AI 一浏览器** —— 共用端口会互相抢页面、互相导航，采集必然失败。每个采集员必须独占自己的端口。
2. **一 AI 一片区** —— 采集员只写自己片区，绝不跨区采集，避免重复。
3. **只有主 AI 写 manifest** —— 采集员完工后只产出分片文件，由主 AI 统一登记。多人同写 manifest 必丢登记。
4. **采集员不碰 MEMO / skill / 业务代码** —— MEMO 是唯一权威记忆，单点维护。

## 三、端口与浏览器实例

每个采集员需要独立的 Edge 调试实例（独立用户数据目录，互不干扰）：

    $exe = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    # 采集员 A
    Start-Process $exe -ArgumentList '--remote-debugging-port=9223', "$env:USERPROFILE\edge-debug-a", '--no-first-run'
    # 采集员 B
    Start-Process $exe -ArgumentList '--remote-debugging-port=9224', "$env:USERPROFILE\edge-debug-b", '--no-first-run'
    # 采集员 C
    Start-Process $exe -ArgumentList '--remote-debugging-port=9225', "$env:USERPROFILE\edge-debug-c", '--no-first-run'

对应的 MCP server 配置见 `.vscode/settings.json`：
edge-devtools(9222) / edge-devtools-a(9223) / edge-devtools-b(9224) / edge-devtools-c(9225)。

采集员在自己的 VS Code 窗口里使用与自己端口对应的 server 名。

## 四、文件分片规范

**采集员写入**：`public/ai-import/shards/<类别>-<片区>-<采集员>.json`

示例：

    public/ai-import/shards/4a-hebei-a.json
    public/ai-import/shards/4a-hebei-b.json

**格式**：与正式批次文件完全一致（batchName / group / markerColor / items）。

**编号**：采集员不要自己编 `EH.xxxxx`，导入器会统一预留。

**禁止**：采集员不得改 `manifest.json`，不得写入 `public/ai-import/` 根目录。

## 五、主 AI 汇总流程

1. 采集员完工后回报：片区、条数、分片文件名。
2. 主 AI 用 `node -e` 校验分片（JSON 合法性、坐标完整性、intro 字数 100-1000）。
3. 主 AI 把分片路径登记进 `public/ai-import/manifest.json`（写 `shards/xxx.json`）。
4. 主 AI 更新 MEMO 数据现状与待办。
5. 用户在面板导入（人工步骤，无法并行）。

## 六、汇报格式

采集员完工后按此格式回报，便于主 AI 快速核验：

    采集员: A
    端口: 9223
    片区: 河北-冀北
    分片文件: shards/4a-hebei-a.json
    条数: 42
    坐标缺失: 0
    intro 字数区间: 135-280
    异常说明: 张家口某景区词条无坐标，已跳过

## 七、已知限制

- **导入永远是串行的** —— AI 写不了浏览器 IndexedDB，所有产出最终由用户手动点导入。并行只加速采集。
- **热点信息功能影响** —— 鹰眼平台打开时默认只渲染热点（上限 49 条），导入大量数据后不会立刻全部显示。
- **导入面板默认折叠** —— 操作时需先展开。

## 八、当前推进建议

先落地「单采集员」跑通一个片区，确认链路无误后再扩展到三个。三采集员适合多省并行，单省推进时协调成本高于收益。
