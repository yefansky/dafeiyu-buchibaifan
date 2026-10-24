<#
.SYNOPSIS
  把本分支的修补源码覆盖到已安装的大肥鱼插件。

.DESCRIPTION
  从仓库根目录读取源码，写到 profile 的 node_modules 下。所有写入都先备份、再删除、再移入，
  避免改到 pnpm store 的硬链接。写入前可结束 helper 进程。

.PARAMETER ProfileRoot
  DSH profile 目录，默认 %USERPROFILE%\.dsh\profiles\desktop。

.PARAMETER StopHelper
  写入前结束 dsh-dafeiyu-helper 进程。

.PARAMETER DryRun
  只打印计划。
#>
[CmdletBinding()]
param(
    [string]$ProfileRoot = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
    [switch]$StopHelper,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginDir = Join-Path $ProfileRoot 'node_modules\@piaobo_gz\dafeiyu-buchibaifan'
if (-not (Test-Path -LiteralPath $pluginDir)) {
    throw "找不到插件目录：$pluginDir（先启动一次 DSH Desktop）"
}

$map = @(
    @('cordis.patch.yml', 'cordis.patch.yml'),
    @('lib/client.js', 'lib\client.js'),
    @('src/index.js', 'src\index.js'),
    @('src/protocol.js', 'src\protocol.js'),
    @('src/helper-process.js', 'src\helper-process.js'),
    @('src/usage-stats.js', 'src\usage-stats.js'),
    @('runtime/helper.py', 'runtime\helper.py'),
    @('runtime/animation_model.py', 'runtime\animation_model.py'),
    @('runtime/layout_store.py', 'runtime\layout_store.py')
)

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$applied = 0
$skipped = 0

foreach ($pair in $map) {
    $source = Join-Path $repoRoot ($pair[0] -replace '/', '\')
    $target = Join-Path $pluginDir $pair[1]
    if (-not (Test-Path -LiteralPath $source)) {
        Write-Host "[skip]   $($pair[0])（仓库缺文件）" -ForegroundColor DarkYellow
        $skipped++
        continue
    }
    if ((Test-Path -LiteralPath $target) -and
        ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash)) {
        Write-Host "[ok]     $($pair[1])"
        $skipped++
        continue
    }
    Write-Host "[write]  $($pair[1])" -ForegroundColor Green
    if ($DryRun) { $applied++; continue }

    $parent = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    if (Test-Path -LiteralPath $target) {
        Copy-Item -LiteralPath $target -Destination "$target.bak-$stamp" -Force
        Remove-Item -LiteralPath $target -Force
    }
    Copy-Item -LiteralPath $source -Destination $target -Force
    $applied++
}

if ($StopHelper -and -not $DryRun) {
    Get-Process dsh-dafeiyu-helper -ErrorAction SilentlyContinue | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; Write-Host "[kill]   helper pid=$($_.Id)" -ForegroundColor DarkGray } catch { }
    }
}

Write-Host ''
Write-Host "写入 $applied 个文件，跳过 $skipped 个。" -ForegroundColor Cyan
Write-Host '接着运行 local-restore\rebuild-helper.ps1 重建 helper，然后重启 DSH Desktop。' -ForegroundColor Yellow
exit 0
