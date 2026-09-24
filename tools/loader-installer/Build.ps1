# 编译 ShinawaseLoader 安装器 -> dist/ShinawaseLoader-Installer.exe
#
# 只依赖 Windows 自带的 .NET Framework 编译器（csc.exe），不需要装任何 SDK。
#
#   powershell -File tools/loader-installer/Build.ps1
#   powershell -File tools/loader-installer/Build.ps1 -Output dist\my-name.exe

[CmdletBinding()]
param(
  [string]$Output
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $here '..\..')).Path
if (-not $Output) { $Output = Join-Path $projectRoot 'dist\ShinawaseLoader-Installer.exe' }
elseif (-not [IO.Path]::IsPathRooted($Output)) { $Output = Join-Path $projectRoot $Output }

$utf8Bom = New-Object System.Text.UTF8Encoding $true

# ---- 源码编码归一化 ------------------------------------------------------
# 编辑/换行工具链可能把 BOM 去掉或换成 LF，而 Windows PowerShell 5.1 解析
# 含中文的无 BOM 脚本会乱码乃至语法报错。构建前统一成「UTF-8 BOM + CRLF」。
foreach ($file in @(Get-ChildItem -LiteralPath $here -Recurse -Include '*.cs', '*.ps1' -File | ForEach-Object { $_.FullName })) {
  $text = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
  $text = ($text -replace "`r`n", "`n") -replace "`n", "`r`n"
  [IO.File]::WriteAllText($file, $text, $utf8Bom)
}

# ---- 版本号：跟随模组版本，方便和 .echomod 对上 --------------------------
$modVersion = '1.0.0'
$manifest = Join-Path $projectRoot 'mod\echo.mod.json'
if (Test-Path -LiteralPath $manifest) {
  # 这个清单的 description 很长，ConvertFrom-Json 会挑刺；版本号用正则取更稳。
  $raw = [IO.File]::ReadAllText($manifest, [Text.Encoding]::UTF8)
  $match = [regex]::Match($raw, '"version"\s*:\s*"([^"]+)"')
  if ($match.Success) { $modVersion = $match.Groups[1].Value }
  else { Write-Warning "mod\echo.mod.json 里没找到 version，用 $modVersion" }
}
$numeric = ($modVersion -replace '[^\d.]', '').Trim('.')
if ($numeric -notmatch '^\d+(\.\d+){1,3}$') { $numeric = '1.0.0' }
$parts = @($numeric.Split('.') + @('0', '0', '0'))[0..3]
$fileVersion = ($parts -join '.')

$name = [IO.Path]::GetFileNameWithoutExtension($Output)

# ---- 找 csc.exe ----------------------------------------------------------
$csc = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) { throw '找不到 .NET Framework 的 csc.exe，无法编译。' }

$work = Join-Path $here 'build'
New-Item -ItemType Directory -Force -Path $work | Out-Null

# ---- 编译 ----------------------------------------------------------------
# 这台机器的工作目录带空格，而 csc 的参数由 PowerShell 拼接时不会自动加引号，
# 路径会被拆成多个参数。所以先把源码复制到无空格的 build\src\，用相对路径编译，
# 最后再把 exe 复制到目标位置。
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output) | Out-Null
$stageSrc = Join-Path $work 'src'
if (Test-Path -LiteralPath $stageSrc) { Remove-Item -LiteralPath $stageSrc -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageSrc | Out-Null
$sources = @()
foreach ($file in @(Get-ChildItem -LiteralPath $here -Filter '*.cs' -File)) {
  Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $stageSrc $file.Name) -Force
  $sources += ('src\' + $file.Name)
}

# 版本号写进程序集属性。注意：资源管理器「属性 → 详细信息」里的版本号来自 PE 的
# RT_VERSION 资源（要 rc.exe）；这里没有 Windows SDK，只能走程序集版本属性。
$assemblyInfo = @"
using System.Reflection;
[assembly: AssemblyTitle("ShinawaseLoader 自动安装器")]
[assembly: AssemblyDescription("把 ShinawaseLoader 装进 Steam 版 ECHO")]
[assembly: AssemblyProduct("ShinawaseLoader Installer")]
[assembly: AssemblyCompany("ECHO Multi Music Sources")]
[assembly: AssemblyCopyright("LGPL-3.0-only")]
[assembly: AssemblyVersion("$fileVersion")]
[assembly: AssemblyFileVersion("$fileVersion")]
[assembly: AssemblyInformationalVersion("$modVersion")]
"@
[IO.File]::WriteAllText((Join-Path $stageSrc 'AssemblyInfo.g.cs'), $assemblyInfo, $utf8Bom)
$sources += 'src\AssemblyInfo.g.cs'

$stagedExe = Join-Path $work "$name.exe"
Remove-Item -LiteralPath $stagedExe -Force -ErrorAction SilentlyContinue
$cscArgs = @(
  '/nologo', '/target:winexe', '/optimize+', '/platform:anycpu',
  '/reference:System.dll', '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll', '/reference:System.Core.dll',
  '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
  '/reference:System.Threading.Tasks.dll',
  "/out:$name.exe"
)
$cscArgs += $sources

Write-Host "csc    : $csc"
Write-Host "版本   : $fileVersion (mod $modVersion)"
Write-Host "输出   : $Output"

$process = Start-Process -FilePath $csc -ArgumentList $cscArgs -WorkingDirectory $work -NoNewWindow -Wait -PassThru
if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $stagedExe)) { throw "编译失败（exit $($process.ExitCode)）" }
Copy-Item -LiteralPath $stagedExe -Destination $Output -Force
Remove-Item -LiteralPath $stagedExe -Force -ErrorAction SilentlyContinue

$info = Get-Item -LiteralPath $Output
Write-Host ("完成： {0}  ({1:N0} 字节)" -f $info.FullName, $info.Length)
