# 浏览器采集通道（Edge 调试实例）

## 为什么需要

webcode 的 edge-devtools 工具需要连到带远程调试端口的 Edge。日常在用的 Edge 没有开端口，直接连会失败（9222 无响应）。

## 恢复步骤

用独立用户数据目录启动一个并行调试实例，不影响用户正在用的浏览器：

    $exe = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    $dir = Join-Path $env:USERPROFILE 'edge-debug-profile'
    Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=$dir", '--no-first-run', '--no-default-browser-check'

等约 4 秒，确认端口监听：

    Get-NetTCPConnection -LocalPort 9222 -State Listen

然后用 edge-devtools 的 list_pages 验证连通。

## 采集用法

1. `navigate_page` 打开目标页（国内源：百度 / 文旅部 / 各省文旅厅）。
2. `evaluate_script` 读取 DOM，提取标题、链接、正文。
3. 逐条打开详情页，提取名称 / 坐标 / 简介。
4. 写入 `public/ai-import/<batch>.json` 并登记 manifest。

## 已知限制

- **维基百科、Wikimedia 图床：网络层封锁，浏览器也无法访问**。数据与图片都必须用国内可访问源。
- 百度搜索结果链接是跳转链接（baidu.com/link?url=...），需要跟随跳转才能拿到真实 URL。
- 大批量采集要分省分批，单次脚本读取不要过大，避免超时。

## 启动时机

- 会话开始若 list_pages 报连接失败 → 按上面命令重启调试实例。
- 采集任务结束后，这个调试实例可以保留，也可以手动关掉。
