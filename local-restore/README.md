# 本机部署补丁包（Windows 桌面）

这个分支 = **上游 1.0.7 + 本机修补**，用于多机备份/同步。上游 PR 分支保持干净，别在这个分支上开 PR。

- 上游：`piaobo123/dafeiyu-buchibaifan`
- Fork：`yefansky/dafeiyu-buchibaifan`
- PR：#6 https://github.com/piaobo123/dafeiyu-buchibaifan/pull/6
- PR 分支：`feat/action-queue-and-cny-stats`
- 本分支：`backup/desktop-1.0.7-patched`（= PR 分支 + 完成音效/动作平滑 + `local-restore/`）

## 包含的修补

- 打包名修复：`cordis.patch.yml` 的 `name` 用完整包名，`lib/client.js` 注册 id 用完整包名。
- `ActionScheduler`：动作队列、最小停留、全局冷却，状态文本仍实时更新。
- 人民币统计条：`stats` 协议、今日/本月/余额、余额进度条、面板统计区。
- 余额进度条基准改为 1000 元起、按整千向上取整（`balanceBarMax`）。
- **完成提示音**（2026-10-24 追加）：默认关闭；叮咚/气泡/轻柔三主题；音量；试听；只在成功完成一轮对话时响，工具失败/取消/切换会话不响。
- **动作平滑**（2026-10-24 追加）：所有帧锚定 manifest 的 238×260 画布（水平居中、脚底对齐），修复不同裁切尺寸造成的横向跳变；程序化位移/角度/缩放经 90ms 一阶低通；clip 切换淡入 0.16s、普通换帧 0.06s。
- **onedir helper**：绕过本机 PyInstaller onefile 在 `C:\` TEMP 创建临时目录失败的问题；`dsh-dafeiyu-helper.exe` 与 `_internal/` 一起启动。

## 本机部署额外说明

- 本机（Windows）的 PyInstaller **onefile 引导器**无法创建解压临时目录（无关的 7MB hello exe 与作者原版 exe 都复现），因此 helper 使用 **onedir**：`dsh-dafeiyu-helper.exe` + `_internal/`。
- 本分支已经包含构建好的 onedir 产物；也可以用 `local-restore\rebuild-helper.ps1` 重建。
- 完成提示音需要**完全退出并重启 DSH Desktop** 后，设置 → 插件 → 大肥鱼桌面伴侣里才会出现控件；动作平滑在 helper 换入后立即生效。

## 在另一台机器恢复

```powershell
git clone https://github.com/yefansky/dafeiyu-buchibaifan.git
cd dafeiyu-buchibaifan
git checkout backup/desktop-1.0.7-patched

# 1) 覆盖源码，并直接复制本分支自带的 onedir helper（先备份、再删后移，保护 pnpm store 硬链接）
powershell -ExecutionPolicy Bypass -File .\local-restore\apply.ps1 -StopHelper -WithHelper

# 2) 自检
powershell -ExecutionPolicy Bypass -File .\local-restore\verify.ps1

# 3) 完全退出并重启 DSH Desktop
```

如果不想用仓库里的 onedir 产物，而是本机重建：

```powershell
powershell -ExecutionPolicy Bypass -File .\local-restore\apply.ps1 -StopHelper
powershell -ExecutionPolicy Bypass -File .\local-restore\rebuild-helper.ps1
powershell -ExecutionPolicy Bypass -File .\local-restore\verify.ps1
```

前提：已启动过一次 DSH Desktop；重建需要 Python + PyInstaller + PySide6（`py -3 -m PyInstaller --version` 能跑）。`rebuild-helper.ps1` 默认用 `py -3`，也可传 `-Python <解释器路径>`。

## 与上游同步

```powershell
git remote add upstream https://github.com/piaobo123/dafeiyu-buchibaifan.git
git fetch upstream
git merge upstream/main
```

`main` 分支保持与上游一致，便于随时快进同步；本机改动只落在备份/PR 分支。

## 注意

- 完成提示音默认关闭；开启后只会在成功完成一轮对话时响一次。试听按钮显式触发，不受开关限制。
- 音效的实际听感无法自动化验收；设置面板、试听和真实完成音效需要重启 DSH 后人工确认。
- `_internal` 约 126MB，仓库因此变大；这是为了在本机直接恢复，不依赖重新打包。
- 插件重装/升级会覆盖安装目录，按上面的恢复步骤重贴。
