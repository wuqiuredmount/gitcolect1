# scripts/start-edge-debug.ps1
# Launch Edge instances with remote debugging ports for webcode edge-devtools.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1
#       -> launch 9222-9225 (default configured set)
#   powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1 -All
#       -> launch 9222-9227 (all)
#   powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1 -Ports 9222,9223
#       -> launch only the given ports
#   powershell -ExecutionPolicy Bypass -File scripts/start-edge-debug.ps1 -Quiet
#       -> only print one summary line (for AI parsing)
#
# Features:
#   - Idempotent: ports already listening are skipped
#   - Isolated user-data-dir: does not touch your daily browser; keeps login state
#   - Batch launch: multiple ports in one run

param(
  [string]$Ports = '',
  [switch]$All,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

# port -> user-data-dir mapping (register new ports here)
$ProfileMap = @{
  9222 = 'edge-debug-profile'
  9223 = 'edge-debug-a'
  9224 = 'edge-debug-b'
  9225 = 'edge-debug-c'
  9226 = 'edge-debug-d'
  9227 = 'edge-debug-e'
}

# resolve target ports (split on comma/space to survive -File arg passing)
if ($Ports) {
  $targets = $Ports -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [int]$_ }
} elseif ($All) {
  $targets = $ProfileMap.Keys | Sort-Object
} else {
  $targets = @(9222, 9223, 9224, 9225)
}

# locate msedge.exe
$exe = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
  Write-Error 'msedge.exe not found. Is Edge installed?'
  exit 1
}

$started = @()
$already = @()
$failed = @()

foreach ($port in $targets) {
  $profile = if ($ProfileMap.ContainsKey($port)) { $ProfileMap[$port] } else { "edge-debug-$port" }
  $dir = Join-Path $env:USERPROFILE $profile

  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    $already += $port
    if (-not $Quiet) { Write-Host "Port $port already listening, skipped." -ForegroundColor Yellow }
    continue
  }

  try {
    Start-Process -FilePath $exe -ArgumentList @(
      "--remote-debugging-port=$port",
      "--user-data-dir=$dir",
      '--no-first-run',
      '--no-default-browser-check'
    )
    if (-not $Quiet) { Write-Host "Started: port $port -> $dir" -ForegroundColor Cyan }
    $started += $port
  } catch {
    $failed += $port
    if (-not $Quiet) { Write-Host "Port $port failed to start: $($_.Exception.Message)" -ForegroundColor Red }
  }
}

if ($started.Count -gt 0) { Start-Sleep -Seconds 5 }

$ok = @()
foreach ($port in ($started + $already)) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/json/version" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok += $port }
  } catch { $failed += $port }
}

if ($Quiet) {
  Write-Output "READY=$($ok -join ',')"
  if ($failed.Count -gt 0) { Write-Output "FAILED=$($failed -join ',')" }
} else {
  Write-Host ''
  Write-Host "OK ports: $($ok -join ', ')" -ForegroundColor Green
  if ($already.Count -gt 0) { Write-Host "already running: $($already -join ', ')" -ForegroundColor DarkGray }
  if ($failed.Count -gt 0) { Write-Host "FAILED ports: $($failed -join ', ')" -ForegroundColor Red }
}

if ($ok.Count -eq 0) { exit 1 }
exit 0
