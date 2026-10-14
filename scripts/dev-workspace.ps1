# scripts/dev-workspace.ps1
# One-command dev workspace: start 2 services + open 3 preview windows.
#
#   Window 1: npm run dev    -> http://localhost:5173  (dev, hot reload, wide)
#   Window 2: npm run share:internal -> http://localhost:4173  (internal build w/ AI panels, wide)
#   Window 3: same as 2 but narrow 500px                (mobile layout check)
#
# Usage:
#   npm run dev:all
#   npm run dev:all -- -NoBrowser   # start services only
#   npm run dev:all -- -Quiet
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads BOM-less .ps1 as ANSI,
#       non-ASCII text would be garbled and break string quoting.

param(
  [switch]$NoBrowser,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Write-Step($msg, $color = 'Cyan') {
  if (-not $Quiet) { Write-Host $msg -ForegroundColor $color }
}

function Test-Port($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# ---------- 1) dev (5173) ----------
if (Test-Port 5173) {
  Write-Step '[dev]   5173 already listening, skip.' 'Yellow'
} else {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; npm run dev"
  Write-Step '[dev]   started npm run dev  -> http://localhost:5173' 'Cyan'
}

# ---------- 2) share (4173) ----------
if (Test-Port 4173) {
  Write-Step '[share] 4173 already listening, skip.' 'Yellow'
} else {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; npm run share:internal"
  Write-Step '[share] started npm run share:internal -> http://localhost:4173 (internal build)' 'Cyan'
}

if ($NoBrowser) {
  Write-Step '' ; Write-Step 'Services started (browser skipped).' 'Green'
  exit 0
}

# ---------- 3) wait for ports ----------
Write-Step '' ; Write-Step 'Waiting for services (max 90s)...' 'Gray'
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if ((Test-Port 5173) -and (Test-Port 4173)) { break }
  Start-Sleep -Milliseconds 500
}
$okDev = Test-Port 5173
$okShare = Test-Port 4173
if (-not $okDev)   { Write-Host 'WARN: 5173 (dev) not ready in 90s' -ForegroundColor Red }
if (-not $okShare) { Write-Host 'WARN: 4173 (share) not ready in 90s' -ForegroundColor Red }
if ((-not $okDev) -and (-not $okShare)) { exit 1 }

# ---------- 4) locate Edge ----------
$exe = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
  Write-Error 'msedge.exe not found. Is Edge installed?'
  exit 1
}

# ---------- 5) open 3 windows ----------
# Separate user-data-dir per window: Edge single-instance would otherwise merge
# windows and ignore per-window --window-size, so wide+narrow could not coexist.
$base = Join-Path $env:USERPROFILE 'edge-dev-workspace'
$common = @('--no-first-run', '--no-default-browser-check')

Start-Process -FilePath $exe -ArgumentList (@(
  "--user-data-dir=${base}-dev"
) + $common + @('--new-window', '--window-size=1440,900', 'http://localhost:5173'))
Write-Step '[win1] dev   wide   1440x900 -> http://localhost:5173' 'Green'

Start-Process -FilePath $exe -ArgumentList (@(
  "--user-data-dir=${base}-share-wide"
) + $common + @('--new-window', '--window-size=1440,900', 'http://localhost:4173'))
Write-Step '[win2] share wide   1440x900 -> http://localhost:4173' 'Green'

Start-Process -FilePath $exe -ArgumentList (@(
  "--user-data-dir=${base}-share-narrow"
) + $common + @('--new-window', '--window-size=500,900', 'http://localhost:4173'))
Write-Step '[win3] share narrow 500x900  -> http://localhost:4173 (mobile)' 'Green'

Write-Step '' ; Write-Step 'Done. 3 windows opened. Ctrl+C in each service terminal to stop.' 'Green'
