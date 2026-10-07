# scripts/start-edge-debug.ps1
# 一键启动带远程调试端口的 Edge 实例（供 webcode 的 edge-devtools 采集使用）
#
# 用法：右键「使用 PowerShell 运行」，或在终端执行：
#   powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1 -Port 9223 -Profile edge-debug-a
#
# 为什么需要独立实例：日常在用的 Edge 没开调试端口，直连会失败。
# 独立 user-data-dir 保证：① 不影响你正在用的浏览器 ② 登录态（如高德）可保留

param(
  [int]$Port = 9222,
  [string]$Profile = 'edge-debug-profile'
)

$ErrorActionPreference = 'Stop'

$exe = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
  Write-Error '未找到 msedge.exe，请确认 Edge 已安装。'
  exit 1
}

$dir = Join-Path $env:USERPROFILE $Profile

# 已在监听则不重复启动
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "端口 $Port 已在监听，无需重复启动。" -ForegroundColor Yellow
} else {
  Write-Host "启动 Edge 调试实例：端口 $Port，数据目录 $dir" -ForegroundColor Cyan
  Start-Process -FilePath $exe -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$dir",
    '--no-first-run',
    '--no-default-browser-check'
  )
  Start-Sleep -Seconds 4
}

# 验证连通
try {
  $ver = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 5
  Write-Host "✅ 已就绪：$Port" -ForegroundColor Green
  Write-Host $ver.Content
} catch {
  Write-Error "端口 $Port 未就绪：$($_.Exception.Message)"
  exit 1
}
