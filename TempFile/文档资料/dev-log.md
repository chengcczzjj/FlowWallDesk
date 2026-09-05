# 灵月桌面 开发日志

> 近期事件，默认只读最近 3-5 条；当前能力看 [项目状态](project-status.md)，可复用结论看 [开发经验](dev-lessons.md)，资料取舍看 [知识索引](knowledge-index.md)。
> 历史记录只证明当时的事件，不代表当前方案或新的操作授权；旧路径/旧结论保留以便追溯。

历史归档：[2026-08](archive/dev-log-2026-08.md) · [2026-05](archive/dev-log-2026-05.md) · [2026-04](archive/dev-log-2026-04.md)。主页和归档不重复保存同一条事件。

## [2026-09-05 10:28] 统一开发 Agent 规则并整理工程知识

**变更摘要**: 消除自动提交/重复确认、提交后回填日志、过时测试说明和历史方案误用；工程记忆与应用用户记忆分离。

**涉及模块**:
- `AGENTS.md` / `.github/` / `README.md`: 单一规则入口、按需上下文、先记录后提交与授权边界。
- `TempFile/文档资料/`: 状态改为能力/缺口/验收边界，新增知识索引与 12 条可复用经验，原文按月归档历史。
- `doc/` / `TempFile/demo/` / `tests/agent-docs.test.mjs`: 标注旧设计及未创建文档，限制原型规则作用域，新增 7 项文档契约检查。

**验证结果**:
- `npm.cmd test` 通过类型、只读 lint 与全部 69 项测试；`npm.cmd run build:check` 成功。
- 原有 47 条事件全部保留：9 条留在近期日志、38 条归档；逐条核验正文一致，仅清理文件尾多余空行。
- `git diff --check` 通过；未改业务源码/用户记忆，未启动应用、安装、push 或发布。Node 模块类型与 Vite 混合导入提示不阻断验证，未扩展修改构建配置。

**经验关联**: L01-L12；历史方案替代关系见 knowledge-index.md。
**提交意图**: `docs(agent): consolidate development rules and project memory`

---

## [2026-09-04 21:25] 构建并本机安装 1.1.11 多显示器稳定布局版

**变更摘要**: 将多显示器底层修复升版为 1.1.11，生成 Windows NSIS 更新资产并在本机静默覆盖安装；本次未上传 GitHub Release。

**涉及模块**:
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 升级 1.1.11 版本元数据和发布契约。
- `doc/发布说明/1.1.11.md` / `TempFile/文档资料/project-status.md`: 记录功能、构建哈希、本机安装和双屏验收边界。
- `dist/`: 生成安装包、blockmap、`latest.yml` 和未打包目录；构建产物不进入 Git。

**验证结果**:
- `npm.cmd test` 通过全部 62 项测试；`npm.cmd run build:win` 成功。
- 安装包 369,425,676 bytes，SHA-256 `00A3BC8D7CFF59BCAA69BF980A83474CA305DE54AF9613BE08C492131B1A98DF`。
- 本机 EXE、`app.asar`、卸载注册表和全部运行进程均为 1.1.11；原壁纸、8 个组件和 2 个全局图标组件保留。
- 安装态诊断确认主屏 `2560x1440` DIP / `3840x2160` 物理边界经 Raised Desktop 原生方案贴合成功。

**Git Commit**: 本次任务提交 — `chore(release): package LingyueDesk 1.1.11`

---

## [2026-09-04] 完成多显示器原生坐标、稳定归属与逐屏渲染链路

**变更摘要**: 重新审计从 Electron 显示器枚举、持久化、BrowserWindow、WorkerW 子窗口定位到 Canvas 组件坐标的完整链路，不再用 UI 状态修补原生坐标问题。默认安全落到主显示器，并补齐复制、按屏、延展和组件跨屏持久化。

**涉及模块**:
- `src/main/windows/nativeDisplayIdentity.ts` / `src/main/windows/displayLayout.ts` / `src/main/windows/attachWallpaperNative.ts`: 用 Win32 设备名和物理矩形匹配 Electron 显示器；修复 `GetMonitorInfoW.cbSize` 被 Koffi 纯输出参数清零的问题；`SetParent` 后显式切换 `WS_CHILD`、移除 `WS_POPUP`，经 `ScreenToClient` 定位并用 `GetWindowRect` 校验。
- `src/main/windows/wallpaperWindow.ts` / `src/shared/wallpaper-display-layout.ts` / `src/main/ipc/wallpaperIpc.ts`: 所有模式均使用显示器本地窗口；延展改为同一虚拟构图的逐屏负偏移裁切；贴合失败自动退避重试，壁纸分配迁移到稳定显示器键。
- `src/shared/widget-display-layout.ts` / `src/main/ipc/widgetIpc.ts` / `src/main/windows/canvasWindow.ts` / `src/main/ipc/desktopIconIpc.ts`: 组件改为稳定显示器键 + 屏幕本地坐标持久化，单 Canvas 只在同步和拖拽边界做双向映射，旧虚拟桌面坐标按覆盖面积一次性迁移。
- `src/renderer/canvas/wallpaperFrameStore.ts` / `src/renderer/widgets/FrostedGlassBackground.tsx` / `src/renderer/wallpaper/Wallpaper.tsx`: 毛玻璃帧改为逐屏传输和选择，renderer 与主进程 fallback 都保留显示器边界，延展抽帧使用真实本地裁切区域。
- `src/main/runtime/diagnosticLog.ts` / `doc/双显示器支持方案.md`: 增加 `%APPDATA%\lingyue-desk\logs\display-diagnostics.jsonl`，记录拓扑、逻辑/物理边界、贴合结果和失败重试，并同步真实架构及验收边界。

**遇到的问题**:
- 旧实现把“模式能保存、窗口数会变化”当成多屏完成，但 `electron-as-wallpaper` 只执行 `SetParent`，没有负责每块屏幕的坐标；父子窗口坐标、DIP/物理像素和负坐标仍混用，因此 UI 改多少轮都不能消除半张壁纸跨屏。
- 初版稳定键代码虽然存在，`GetMonitorInfoW` 却声明成 Koffi `out` 参数，调用前必需的 `cbSize` 被清零，真实 Windows 调用始终失败并静默退回 Electron id；改为 `inout` 后已直接读到 `\\.\DISPLAY1` 和 `2560x1440` 物理边界。
- 旧组件一直保存联合 Canvas 坐标，切换主屏/联合画布必然改变原点；现永久保存显示器本地坐标，只有跨屏拖拽才改变显示器归属。

**验证结果**:
- `npm.cmd test` 通过全部 62 项测试；`npm.cmd run build:check` 成功。
- 使用 Node + Koffi 直接调用 Win32 枚举，确认本机 `GetMonitorInfoW` 返回稳定设备名、主屏标志及物理矩形。
- 当前开发机只有一台 `2560x1440` 显示器，不能把自动测试冒充公司混合 DPI 双屏验收；后续实机异常可直接依据 `display-diagnostics.jsonl` 中的 expected/actual 边界定位。

**Git Commit**: 本次任务提交 — `fix(display): complete stable multi-monitor layout`

---

## [2026-08-30 21:23] 发布 1.1.10 多显示器壁纸布局恢复版

**变更摘要**: 将多显示器模式链路修复升版为 1.1.10，生成自动更新资产、完成本机覆盖安装并发布 GitHub Release。

**涉及模块**:
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 升级 1.1.10 版本元数据与发布契约。
- `doc/发布说明/1.1.10.md` / `TempFile/文档资料/project-status.md`: 记录多显示器修复、验证结果、安装包校验和正式分发状态。
- `dist/`: 生成 Windows x64 NSIS 安装包、blockmap 和 `latest.yml`；构建产物不进入 Git。

**验证结果**:
- `npm.cmd test` 通过全部 57 项测试；`npm.cmd run build:win` 成功。
- 安装包 369,422,468 bytes，SHA-256 `2295587461FB99F36CD6E789ACE5A267EBC13B7591B393B9A5ED3BF059C60230`；blockmap 与 `latest.yml` 均完成哈希校验。
- 本机 EXE、`app.asar` 和卸载注册表均更新为 1.1.10；当前壁纸、8 个桌面组件和 2 个全局图标组件完整保留，安装后进程正常运行。
- GitHub Release：`https://github.com/chengcczzjj/FlowWallDesk/releases/tag/v1.1.10`（安装包、blockmap、`latest.yml` 已上传并校验远端大小与 SHA-256）。

**Git Commit**: 已提交 — `chore(release): publish LingyueDesk 1.1.10`

---

## [2026-08-30 20:57] 恢复多显示器壁纸布局并修复模式覆盖

**变更摘要**: 恢复仅主屏、复制、按屏独立和跨屏延展四种真实运行模式，修复壁纸应用后布局被强制改回按屏模式的问题。

**涉及模块**:
- `src/main/windows/displayLayout.ts` / `src/main/ipc/wallpaperIpc.ts` / `src/shared/wallpaper-display-layout.ts`: 让持久化模式重新驱动原生窗口数量、renderer 布局与 IPC 返回值，并保证“应用到当前布局”不覆盖复制/延展模式。
- `src/renderer/main-ui/App.tsx` / `src/renderer/main-ui/pages/LibraryPage.tsx` / `src/renderer/main-ui/pages/settings/DisplaySettingsPage.tsx`: 恢复显示器设置页，在壁纸库常驻展示布局选择；仅按屏模式向单台显示器应用壁纸。
- `tests/wallpaper-display.test.mjs`: 覆盖模式持久化、单屏独立分配、跨屏窗口联合矩形、强制铺满和应用壁纸后保留布局。

**遇到的问题**:
- 1.1.6 为消除两个设置入口的冲突，把模式读取、模式写入和 renderer 布局全部硬编码成 `per-display`，同时库页面任何应用操作都使用显示器 id → 跨屏/复制配置必然失效，模式选择看似保存但窗口层从未采用；现统一为一个持久化模式状态，并按模式解析应用目标。

**验证结果**:
- `npm.cmd test` 通过全部 57 项测试；`npm.cmd run build:check` 成功。

**Git Commit**: 已提交 — `fix(wallpaper): restore multi-monitor wallpaper modes`

---

## [2026-08-30 20:15] 发布 1.1.9 便利贴即时置顶与画布性能优化版

**变更摘要**: 将便利贴置顶触发提前到 `pointerdown` 捕获阶段，并以显式层级持久化和自适应原生命中轮询优化重叠交互与空闲性能。

**涉及模块**:
- `package.json` / `package-lock.json` / `doc/发布说明/1.1.9.md` / `tests/release-contracts.test.mjs`: 升级 1.1.9 版本元数据、发布说明和自动更新契约。
- `src/renderer/canvas/Canvas.tsx`: 使用捕获阶段 + 同步提交确保按下即置顶。
- `src/shared/widget-order.ts` / `src/shared/canvas-hit-test.ts` / `src/main/ipc/widgetIpc.ts` / `src/main/windows/canvasWindow.ts`: 显式层级、置顶 IPC、按视觉层级命中和自适应轮询。

**验证结果**:
- `npm.cmd test` 通过全部 54 项测试；`npm.cmd run build:win` 成功生成 Windows x64 NSIS 安装包、blockmap 和 `latest.yml`。
- 安装包 `dist/lingyue-desk-1.1.9-setup.exe`：369,418,473 bytes，SHA-256 `E4F2D75682E3AE67935D0FAE5A91AC0AD78B0475D8961985E899D99C4110F92E`，electron-updater SHA-512 `QOh5kbqq5CNzz1E+a0ZiooG5Aat3NNGM1MVv2wjP8pNal3aY4MWYaK8mQRw7gQrZbkQc7TccTSaGgeZxpvkYFg==`。
- 本机已停止旧进程并静默覆盖安装 1.1.9；EXE 版本、运行目录和卸载注册表入口更新，8 个组件、2 个全局图标组件、当前壁纸及组件层级数据保留，安装后进程正常运行。
- GitHub Release：`https://github.com/chengcczzjj/FlowWallDesk/releases/tag/v1.1.9`（安装包、blockmap、`latest.yml` 已上传并校验远端大小与 SHA-256）。

**Git Commit**: `99f6a1a chore(release): publish LingyueDesk 1.1.9`

---

## [2026-08-30] 优化便利贴桌面交互宿主的层级与空闲性能

**变更摘要**: 在保留单 Canvas 透明窗口架构的前提下，将组件视觉顺序从数组位置升级为显式 `stackOrder`，并为便利贴增加独立置顶 IPC；Canvas 原生命中轮询改为手势/命中区域高频、空闲低频调度，降低常驻唤醒。

**涉及模块**:
- `src/shared/types.ts` / `src/shared/widget-order.ts` / `src/shared/canvas-hit-test.ts`: 增加组件层级字段、旧数据顺序迁移、按显式层级命中和便利贴置顶纯函数。
- `src/main/ipc/widgetIpc.ts` / `src/shared/ipc-channels.ts` / `src/preload/canvas.ts`: 增加 `WIDGET_BRING_TO_FRONT`，防止位置或配置更新覆盖较新的层级操作。
- `src/renderer/canvas/Canvas.tsx` / `src/main/windows/canvasWindow.ts`: 使用 CSS `z-index` 渲染显式层级，便利贴点击置顶；原生命中检测空闲从 25ms 降至 80ms，交互期间保持 25ms，并以 React.memo 保留未变化组件。
- `tests/shared-contracts.test.mjs` / `tests/todo-widget.test.mjs` / `tests/release-contracts.test.mjs`: 增加层级顺序、置顶 IPC、显式命中和自适应轮询契约。

**验证结果**:
- `npm.cmd test` 通过全部 54 项测试；`npm.cmd run build:check` 成功。
- 未拆分为多个 Electron 窗口，未改变全屏恢复、锁屏 Canvas 重建或 ToDesk 前台保护链路。

---

## [2026-08-30 14:30] 修复 ToDesk 远程控制时桌面组件前台闪烁并发布 1.1.8

**变更摘要**: 定位到 Canvas 在任意“桌面未遮挡”前台状态都执行 `alwaysOnTop` z-order 自愈，ToDesk 的 `H-SMILE-FRAME`/`TWINCONTROL` 窗口因此被桌面组件短暂盖住。现在仅在确认 Windows Shell 或无前台窗口时恢复层级，远程控制和普通应用前台状态跳过恢复。

**涉及模块**:
- `src/shared/canvas-hit-test.ts` / `src/main/windows/canvasWindow.ts`: 新增桌面 Shell 前台判定与 ToDesk 类名保护，记录跳过恢复的诊断事件。
- `tests/shared-contracts.test.mjs` / `tests/release-contracts.test.mjs`: 增加 ToDesk/普通窗口不触发恢复、Shell 状态仍恢复的回归契约。
- `package.json` / `package-lock.json` / `doc/发布说明/1.1.8.md`: 升级版本并记录发布校验信息。

**验证结果**:
- `npm.cmd test` 通过全部 52 项测试；`npm.cmd run build:win` 成功生成 Windows x64 NSIS 安装包、blockmap 和 `latest.yml`。
- 本机已停止 1.1.7 并静默覆盖安装 1.1.8；EXE、`app.asar`、卸载注册表均为 1.1.8，8 个组件、2 个全局图标组件和当前壁纸配置保留，运行进程响应正常。

**Git Commit**: 已提交 — `9ab45d0 chore(release): publish LingyueDesk 1.1.8`

---

## [2026-08-29 13:26] 发布 1.1.7 启动锁屏输入恢复版

**变更摘要**: 将长时间启动锁屏后 Canvas 丢失 `pointerdown` 的根因修复升版为 1.1.7，生成自动更新资产并完成本机覆盖安装验证。

**涉及模块**:
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 将应用版本和发布契约同步升级到 1.1.7。
- `doc/发布说明/1.1.7.md`: 记录锁屏输入恢复策略、验证结果、安装包大小和 SHA-256/SHA-512 校验值。
- `dist/`: 生成 Windows x64 NSIS 安装包、blockmap 和 `latest.yml`；构建产物不进入 Git。

**验证结果**:
- `npm.cmd test` 通过全部 51 项测试；`npm.cmd run build:win` 成功。
- 本机 EXE、`app.asar` 和卸载注册表均更新到 1.1.7，8 个壁纸组件、2 个全局图标组件和当前壁纸配置完整保留。

**Git Commit**: 已提交 — `chore(release): publish LingyueDesk 1.1.7`
**Git Tag**: `v1.1.7`（已推送）
**GitHub Release**: `https://github.com/chengcczzjj/FlowWallDesk/releases/tag/v1.1.7`（安装包、blockmap、`latest.yml` 大小与 SHA-256 均已校验）

---

## [2026-08-29 12:58] 修复开机长时间锁屏后便利贴输入失效

**变更摘要**: 根据本机安装态日志定位 Canvas 在开机后长时间停留锁屏界面时丢失 `pointerdown` 的根因，改为桌面返回后无损重建输入窗口，并增加真实点击丢失后的自动恢复。

**涉及模块**:
- `src/main/windows/canvasWindow.ts`: 识别启动期长时间遮挡并重建 Canvas；监测原生按下与 renderer 回执，丢失时自动重建输入窗口并记录诊断事件。
- `src/shared/canvas-hit-test.ts`: 仅在原生命中仍落到桌面 Shell 时执行 z-order 重组合，移除便利贴边缘的扩大误命中区域。
- `tests/shared-contracts.test.mjs` / `tests/release-contracts.test.mjs`: 覆盖启动锁屏重建、桌面表面修复边界和输入恢复契约。

**遇到的问题**:
- 本机实际安装仍为 1.1.5；开机后锁屏约 26 分钟的会话中记录到 289 次原生鼠标变化和 24 次 `pointerup`，但 `pointerdown` 为 0，证明故障不在便利贴业务逻辑，而是透明 Canvas 在锁屏遮挡期间初始化后输入表面失效 → 长遮挡返回直接重建 BrowserWindow，并以真实按键回执提供运行时兜底。
- 原自愈会在 `WindowFromPoint` 已命中 Canvas、鼠标仅位于便利贴 2px 或 Dock 28px 扩大边缘时反复执行 always-on-top 重组合 → 只允许桌面 Shell 原生命中触发重组合，避免全屏透明窗口无效抬升造成卡顿。

**Git Commit**: 已提交 — `fix(canvas): rebuild stale input surface after startup lock`

---
