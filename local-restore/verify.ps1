<#
.SYNOPSIS
  校验已安装的大肥鱼插件是否为本分支的修补版。

.DESCRIPTION
  按 local-restore/manifest.json 的 SHA256 逐文件比对；helper 只检查
  onedir 结构（exe + _internal）是否存在，因为 onedir 产物的 exe 哈希随构建环境变化。
#>
[CmdletBinding()]
param(
    [string]$ProfileRoot = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "缺少 $manifestPath" }
$manifest = [System.IO.File]::ReadAllText($manifestPath, (New-Object System.Text.UTF8Encoding($false))) | ConvertFrom-Json
$pluginDir = Join-Path $ProfileRoot ('node_modules\' + $manifest.plugin.name.Replace('/', '\'))
if (-not (Test-Path -LiteralPath $pluginDir)) {
    Write-Host "[MISSING] 插件目录不存在：$pluginDir" -ForegroundColor Red
    exit 1
}

$drift = 0
Write-Host "插件：$($manifest.plugin.name)@$($manifest.plugin.version)" -ForegroundColor Cyan
Write-Host "目录：$pluginDir" -ForegroundColor DarkGray
Write-Host ''

foreach ($file in $manifest.files) {
    $target = Join-Path $pluginDir $file.target
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host ("[MISSING] {0}" -f $file.target) -ForegroundColor Red
        $drift++
        continue
    }
    $raw = [System.IO.File]::ReadAllText($target)
    $normalized = $raw.Replace("`r`n", "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $actual = ([System.BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalized)))).Replace('-', '').ToLower()
    if ($actual -eq $file.sha256) {
        Write-Host ("[OK]      {0}" -f $file.target) -ForegroundColor Green
    }
    else {
        Write-Host ("[DRIFT]   {0}  期望 {1}… 实际 {2}…" -f $file.target, $file.sha256.Substring(0, 12), $actual.Substring(0, 12)) -ForegroundColor Yellow
        $drift++
    }
}

$exe = Join-Path $pluginDir 'runtime\bin\win32-x64\dsh-dafeiyu-helper.exe'
$internal = Join-Path $pluginDir 'runtime\bin\win32-x64\_internal'
if (Test-Path -LiteralPath $exe) {
    Write-Host ("[OK]      runtime/bin/win32-x64/dsh-dafeiyu-helper.exe（{0:N0} 字节）" -f (Get-Item -LiteralPath $exe).Length) -ForegroundColor Green
}
else {
    Write-Host '[MISSING] helper exe' -ForegroundColor Red
    $drift++
}
if (Test-Path -LiteralPath $internal) {
    $count = (Get-ChildItem -LiteralPath $internal -Recurse -File | Measure-Object).Count
    Write-Host ("[OK]      _internal（{0} 个文件）" -f $count) -ForegroundColor Green
}
else {
    Write-Host '[MISSING] _internal（onedir 依赖目录）' -ForegroundColor Red
    $drift++
}

Write-Host ''
if ($drift -eq 0) {
    Write-Host '全部一致：当前安装就是修补后的版本。' -ForegroundColor Green
    exit 0
}
Write-Host "发现 $drift 处漂移。运行 local-restore\apply.ps1 后重建。" -ForegroundColor Yellow
exit 1
