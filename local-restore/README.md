# 本机部署补丁包（Windows 桌面）

这个分支 = **上游 1.0.7 + 本机修补**，用于多机备份/同步。PR 分支保持干净，别在这个分支上开 PR。

- 上游：`piaobo123/dafeiyu-buchibaifan`
- Fork：`yefansky/dafeiyu-buchibaifan`
- PR：#6 https://github.com/piaobo123/dafeiyu-buchibaifan/pull/6
- PR 分支：`feat/action-queue-and-cny-stats`
- 本分支：`backup/desktop-1.0.7-patched`（= PR 分支 + `local-restore/`）

## 包含的源码修补

与 PR 相同：打包名修复、`ActionScheduler`、人民币统计条、`stats` 协议、面板统计区、`layout_store` 去 tempfile。

## 本机部署额外说明

- 本机（Windows）的 PyInstaller **onefile 引导器**无法创建解压临时目录（连无关的 7MB hello exe 与作者原版 exe 都复现），因此 helper 改用 **onedir** 打包：`dsh-dafeiyu-helper.exe` + `_internal/`。
- 仓库里的 `scripts/build-helper.ps1` 仍是上游的 onefile 打包；本目录的 `rebuild-helper.ps1` 是 onedir 版本。
- 安装目录保留两份旧 exe 备份：`dsh-dafeiyu-helper.exe.bak-20261024`（作者原版）、`dsh-dafeiyu-helper.exe.bak-onefile-20261024`（本鱼的 onefile 版）。

## 在另一台机器恢复

```powershell
git clone https://github.com/yefansky/dafeiyu-buchibaifan.git
cd dafeiyu-buchibaifan
git checkout backup/desktop-1.0.7-patched

# 1) 覆盖到已安装插件（先备份、再删后移，保护 pnpm store 硬链接）
powershell -ExecutionPolicy Bypass -File .\local-restore\apply.ps1

# 2) 重建 helper（onedir）
powershell -ExecutionPolicy Bypass -File .\local-restore\rebuild-helper.ps1

# 3) 自检
powershell -ExecutionPolicy Bypass -File .\local-restore\verify.ps1

# 4) 完全退出并重启 DSH Desktop
```

前提：本机有 Python 3.12 + PyInstaller + PySide6（`py -3 -m PyInstaller --version` 能跑），且已启动过一次 DSH Desktop。

## 与上游同步

```powershell
git remote add upstream https://github.com/piaobo123/dafeiyu-buchibaifan.git
git fetch upstream
git merge upstream/main
```

`main` 分支保持与上游一致，便于随时快进同步；本机改动只落在上面两个分支。

> ⚠️ 本机安装目录在 2026-10-24 23:33 被另一个会话追加了「完成提示音」功能（`soundEnabled` / `soundTheme` / `soundVolume`、`/plugins/dafeiyu-buchibaifan/sound-preview`）。该功能**不在本分支**；`local-restore\verify.ps1` 对这些文件会显示 `DRIFT`，属预期。若要用本分支覆盖，请先备份/合并那份改动。