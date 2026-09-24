# 修复 ShinawaseLoader 注入失败：把 CDP / inspector 端口换到 Windows 没有保留的端口。
#
# 背景：Windows 会保留（exclude）一批 TCP 端口给 Hyper-V / WSL / Docker 等，被保留的端口
# 任何进程都绑不上，报「An attempt was made to access a socket in a way forbidden by its
# access permissions」。Loader 默认用 9229（CDP）和 9230（inspector）—— 常见机器的保留范围
# 里正好包含 9185-9284，于是 ECHO 起不来调试端口，Loader 永远连不上，表现为「模组不显示」。
#
# 用法：
#   powershell -File tools\fix-loader-ports.ps1                     自动检查并修复
#   powershell -File tools\fix-loader-ports.ps1 -EchoRoot "<游戏目录>"
#   powershell -File tools\fix-loader-ports.ps1 -CheckOnly          只看不写

[CmdletBinding()]
param(
  [string]$EchoRoot = 'D:\program files (x86)\steam\steamapps\common\ECHO',
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

function Get-ExcludedRanges {
  $ranges = @()
  $text = (netsh int ipv4 show excludedportrange protocol=tcp) -join "`n"
  foreach ($line in $text -split "`n") {
    if ($line -match '^\s*(\d+)\s+(\d+)(\s+\*)?\s*$') {
      $ranges += [pscustomobject]@{ Start = [int]$Matches[1]; End = [int]$Matches[2]; Administered = [bool]$Matches[3] }
    }
  }
  return $ranges
}

function Test-PortInExcludedRange([int]$Port, $Excluded) {
  foreach ($range in $Excluded) {
    if ($Port -ge $range.Start -and $Port -le $range.End) { return $true }
  }
  return $false
}

function Test-PortListening([int]$Port) {
  $out = (netstat -ano -p tcp) -join "`n"
  return [bool]($out -match ":$Port\s+\S+\s+\S+\s+LISTENING")
}

# 'ok'=能绑 / 'listening'=已被监听（通常就是游戏在用，说明工作正常）/ 'excluded'=被系统保留 / 'unavailable'
function Get-PortState([int]$Port, $Excluded) {
  if (Test-PortInExcludedRange $Port $Excluded) { return 'excluded' }
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
    return 'ok'
  } catch {
    if (Test-PortListening $Port) { return 'listening' }
    return 'unavailable'
  }
}

function Test-PortUsable([int]$Port, $Excluded) {
  $state = Get-PortState $Port $Excluded
  return ($state -eq 'ok' -or $state -eq 'listening')
}

function Find-FreePort([int]$Start, $Excluded) {
  for ($port = $Start; $port -lt $Start + 2000; $port++) {
    if (Test-PortUsable $port $Excluded) { return $port }
  }
  throw "从 $Start 起找不到可用端口。"
}

$configPath = Join-Path $EchoRoot 'ShinawaseLoader\loader.config.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw "找不到 Loader 配置：$configPath" }

$excluded = Get-ExcludedRanges
Write-Host '=== Windows 保留(排除)的 TCP 端口范围 ===' -ForegroundColor Cyan
foreach ($range in $excluded) {
  $flag = if ($range.Administered) { ' *' } else { '' }
  Write-Host ("  {0,6} - {1,-6}{2}" -f $range.Start, $range.End, $flag)
}

$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$debugPort = [int]$config.debugPort
$inspectPort = [int]$config.inspectPort
Write-Host ''
Write-Host "当前配置： debugPort=$debugPort  inspectPort=$inspectPort"

$debugState = Get-PortState $debugPort $excluded
$inspectState = Get-PortState $inspectPort $excluded
$debugOk = ($debugState -eq 'ok' -or $debugState -eq 'listening')
$inspectOk = ($inspectState -eq 'ok' -or $inspectState -eq 'listening')

function Describe-State($state) {
  switch ($state) {
    'ok' { '可用' }
    'listening' { '已被监听（游戏正在用，说明工作正常）' }
    'excluded' { '被 Windows 保留 → 这正是注入失败的原因' }
    default { '无法绑定（被其它程序占用）' }
  }
}

Write-Host ("  debugPort   {0} : {1}" -f $debugPort, (Describe-State $debugState)) -ForegroundColor $(if ($debugOk) { 'Green' } else { 'Red' })
Write-Host ("  inspectPort {0} : {1}" -f $inspectPort, (Describe-State $inspectState)) -ForegroundColor $(if ($inspectOk) { 'Green' } else { 'Yellow' })

if ($debugOk -and $inspectOk) {
  Write-Host ''
  Write-Host '两个端口都没问题，不需要修改。' -ForegroundColor Green
  exit 0
}

if ($CheckOnly) {
  Write-Host ''
  Write-Host '（-CheckOnly：未做修改）' -ForegroundColor Yellow
  exit 1
}

# 端口被别的程序占着（不是系统保留）时不要乱改配置 —— 很可能就是游戏自己在用。
if ($debugState -eq 'unavailable' -or $inspectState -eq 'unavailable') {
  Write-Host ''
  Write-Host '端口绑不上，但也不在 Windows 保留范围里，说明被其它程序占用。' -ForegroundColor Yellow
  Write-Host '先关掉 ECHO 再运行本脚本；如果仍然占用，请手动指定其它端口。' -ForegroundColor Yellow
  exit 2
}

$newDebug = if ($debugOk) { $debugPort } else { Find-FreePort (($debugPort + 10000)) $excluded }
$newInspect = if ($inspectOk) { $inspectPort } else { Find-FreePort (($inspectPort + 10000)) $excluded }

$backup = "$configPath.bak"
Copy-Item -LiteralPath $configPath -Destination $backup -Force
Write-Host ''
Write-Host "已备份原配置： $backup" -ForegroundColor DarkGray

$config.debugPort = $newDebug
$config.inspectPort = $newInspect
$json = $config | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($configPath, "$json`n", (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host "已修改： debugPort=$newDebug  inspectPort=$newInspect" -ForegroundColor Green
Write-Host '接下来关掉 ECHO，重新运行 ShinawaseLoader\start-echo-with-mods.cmd 即可。' -ForegroundColor Cyan
Write-Host '验证方式：任务管理器/资源监视器里应能看到游戏进程监听新端口，' -ForegroundColor DarkGray
Write-Host '          或看 %APPDATA%\ECHO Steam\DevToolsActivePort 里写的是不是新端口。' -ForegroundColor DarkGray
exit 0
