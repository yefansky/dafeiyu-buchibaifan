<#
.SYNOPSIS
  重建大肥鱼 helper（PyInstaller onedir）。

.DESCRIPTION
  本机 PyInstaller onefile 引导器无法创建解压临时目录，因此用 onedir：
  exe 直接加载同目录的 _internal，不需要解压、也不依赖 TEMP。

.PARAMETER Python
  同时装有 PyInstaller 与 PySide6 的解释器，默认 py（以 py -3 调用）。

.PARAMETER ProfileRoot
  DSH profile 目录，默认 %USERPROFILE%\.dsh\profiles\desktop。
#>
[CmdletBinding()]
param(
    [string]$Python = 'py',
    [string]$ProfileRoot = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
)

$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginDir = Join-Path $ProfileRoot 'node_modules\@piaobo_gz\dafeiyu-buchibaifan'
$entry = Join-Path $repoRoot 'runtime\helper.py'
$assets = Join-Path $repoRoot 'assets'
$targetDir = Join-Path $pluginDir 'runtime\bin\win32-x64'
$targetExe = Join-Path $targetDir 'dsh-dafeiyu-helper.exe'

if (-not (Test-Path -LiteralPath $entry)) { throw "找不到 $entry" }
if (-not (Test-Path -LiteralPath $pluginDir)) { throw "找不到插件目录：$pluginDir" }

$workRoot = Join-Path $env:TEMP 'dafeiyu-helper-build'
$dist = Join-Path $workRoot 'dist'
$work = Join-Path $workRoot 'work'
$spec = Join-Path $workRoot 'spec'
New-Item -ItemType Directory -Force -Path $dist, $work, $spec | Out-Null

& $Python -c "import PyInstaller, PySide6; print('PyInstaller', PyInstaller.__version__, '| PySide6', PySide6.__version__)"
if ($LASTEXITCODE -ne 0) { throw "所选 Python 缺少 PyInstaller/PySide6：$Python" }

$pyArgs = @()
if ($Python -match '(^|[\\/])py(?:\.exe)?$') { $pyArgs = @('-3') }

Write-Host '结束已运行的 helper…' -ForegroundColor DarkGray
Get-Process dsh-dafeiyu-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host '构建中（约 1-3 分钟）…' -ForegroundColor Cyan
& $Python @pyArgs -m PyInstaller --noconfirm --clean --onedir --console --name dsh-dafeiyu-helper `
    --distpath $dist --workpath $work --specpath $spec `
    --add-data "$assets;assets" --paths (Join-Path $repoRoot 'runtime') `
    --hidden-import completion_sound --hidden-import winsound $entry 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 失败，退出码 $LASTEXITCODE" }

$builtDir = Join-Path $dist 'dsh-dafeiyu-helper'
$builtExe = Join-Path $builtDir 'dsh-dafeiyu-helper.exe'
if (-not (Test-Path -LiteralPath $builtExe)) { throw "构建产物不存在：$builtExe" }

Get-Process dsh-dafeiyu-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
if (Test-Path -LiteralPath $targetExe) {
    Copy-Item -LiteralPath $targetExe -Destination "$targetExe.bak-$stamp" -Force
}
if (Test-Path -LiteralPath (Join-Path $targetDir '_internal')) {
    Remove-Item -LiteralPath (Join-Path $targetDir '_internal') -Recurse -Force
}
Copy-Item -Path (Join-Path $builtDir '*') -Destination $targetDir -Recurse -Force

$size = [math]::Round(((Get-ChildItem -LiteralPath $targetDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "已换入 onedir：exe $((Get-Item $targetExe).Length) 字节 + _internal，合计 $size MB" -ForegroundColor Green
Write-Host '重启 DSH Desktop 后生效。' -ForegroundColor Yellow
exit 0
