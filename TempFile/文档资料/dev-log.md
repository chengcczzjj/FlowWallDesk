# 灵月桌面 开发日志

## [2026-08-23 00:00] 发布 1.1.4 全屏返回便利贴交互修复版

**变更摘要**: 将全屏游戏返回后便利贴输入/拖动失效的 Canvas 原生命中自愈修复升版为 1.1.4，构建并推送 Windows 自动更新资产。

**涉及模块**:
- `src/main/windows/canvasWindow.ts` / `src/shared/canvas-hit-test.ts`: 对所有桌面组件采样原生命中表面，识别壁纸层并在透明 Canvas HWND 失去命中时自动重建层级。
- `tests/shared-contracts.test.mjs` / `tests/release-contracts.test.mjs`: 增加全屏返回交互修复回归契约并同步 1.1.4 版本。
- `package.json` / `package-lock.json` / `doc/发布说明/1.1.4.md`: 同步发布元数据、安装包校验信息和更新说明。

**遇到的问题**:
- Renderer 的 `elementFromPoint` 仍显示便利贴可交互，但 Windows 实际将鼠标路由到桌面/壁纸层 → 扩展原先仅针对 Dock 的原生命中修复，并允许安全桌面表面触发 Canvas 重组合。

**Git Commit**: `chore(release): publish LingyueDesk 1.1.4`

---

## [2026-08-23 00:00] 发布 1.1.3 双显示器选择器修复版

**变更摘要**: 将显示器选择器和启动稳定性修复升版为 1.1.3，构建 Windows 安装包并准备发布。

**涉及模块**:
- `src/renderer/main-ui/App.tsx` / `src/renderer/main-ui/styles.css`: 壁纸页显示器按钮改为可选择目标显示器的下拉菜单。
- `src/renderer/main-ui/pages/LibraryPage.tsx` / `src/renderer/main-ui/pages/OnlineWallpaperPage.tsx`: 支持向选定显示器应用壁纸并显示失败原因。
- `src/main/windows/displayLayout.ts`: 防护启动和显示器拓扑变化期间的 screen API 短暂不可用场景。
- `package.json` / `package-lock.json` / `doc/发布说明/1.1.3.md`: 同步 1.1.3 发布元数据和说明。

**遇到的问题**:
- 显示器按钮原先只是无行为占位按钮，且错误处理缺少用户反馈 → 改为目标选择器并为显示器 IPC 和壁纸应用增加错误边界。

**Git Commit**: `chore(release): publish LingyueDesk 1.1.3`

---

## [2026-08-19 00:00] 发布 1.1.2 双显示器版本并更新本机客户端

**变更摘要**: 将双显示器壁纸与组件支持升版为 1.1.2，生成 Windows 安装包并完成本机客户端更新。

**涉及模块**:
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 同步 1.1.2 版本契约。
- `doc/发布说明/1.1.2.md` / `TempFile/文档资料/project-status.md`: 记录双显示器功能、验证和安装信息。
- `dist/lingyue-desk-1.1.2-setup.exe`: 生成未签名 Windows x64 NSIS 安装包并静默安装。

**遇到的问题**:
- 同版本安装器无法明确触发本地更新 → 升级到 1.1.2 后重新构建并使用安装器更新。

**Git Commit**: `chore(release): publish LingyueDesk 1.1.2`

---

## [2026-08-18 00:00] 发布 1.1.1 桌面交互稳定性版本

**变更摘要**: 汇总在线壁纸库、Dock 自定义图标启动修复和便签/Canvas 输入层自愈，准备发布 1.1.1。

**涉及模块**:
- `src/main/windows/canvasWindow.ts` / `src/shared/native-dock-click.ts`: 增加原生鼠标 watchdog、pointer reset IPC、Canvas 合成层有限重试和桌面 Shell 点击兜底。
- `src/renderer/canvas/Canvas.tsx` / `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx`: 清理丢失的 pointerup、缩短 Dock 启动保护并恢复组件交互引用。
- `package.json` / `package-lock.json` / `doc/发布说明/1.1.1.md`: 同步版本号、发布说明和构建验证记录。

**遇到的问题**:
- 应用抢焦时 renderer 偶尔收不到 pointerup → 主进程以原生按键状态为准，超时向 renderer 广播 reset，并对 Canvas z-order 修复做有限重试。

**Git Commit**: 已提交 — `chore(release): prepare LingyueDesk 1.1.1`
**Git Tag**: `v1.1.1`（已推送）
**GitHub Release**: `https://github.com/chengcczzjj/FlowWallDesk/releases/tag/v1.1.1`

## [2026-08-18 00:02] 落地在线壁纸库与所有者发布管理

**变更摘要**: 将壁纸资源从应用安装包更新中解耦，完成远程清单、独立下载更新、安全安装和仅官方仓库所有者可用的 GitHub Release UI 发布链路。

**涉及模块**:
- `src/main/services/wallpaper-resource-service.ts` / `src/main/ipc/wallpaperResourceIpc.ts`: 实现清单定时刷新与缓存回退、下载进度、大小/SHA-256 校验、安全解压、原子安装、版本更新和删除。
- `src/main/services/wallpaper-owner-service.ts`: 使用 Windows DPAPI 加密 GitHub Token，校验固定所有者账号/仓库权限，并完成仓库初始化、Release 资产上传和 manifest 原子提交。
- `src/renderer/main-ui/pages/OnlineWallpaperPage.tsx` / `src/renderer/main-ui/components/WallpaperOwnerDialog.tsx`: 新增在线壁纸管理页及受启动参数保护的所有者发布面板。
- `src/main/ipc/wallpaperIpc.ts` / `src/main/runtime/userDataPaths.ts`: 增加在线资源隔离目录、本地导入壁纸删除，并修复嵌套 Web 壁纸入口扫描。
- `tests/wallpaper-resource.test.mjs` / `doc/壁纸资源托管与下载方案.md`: 固化资源 ID/版本、IPC、安全安装、所有者授权契约和完整操作说明。

**遇到的问题**:
- 客户端隐藏发布按钮不能构成真实授权 → 入口使用 `--lingyue-wallpaper-owner` 隔离，同时强制 Token 登录账号为 `chengcczzjj` 且由 GitHub 校验官方仓库写权限。
- 远程 ZIP 不能直接覆盖已安装目录 → 先做校验并写入随机 staging，旧目录改名备份后原子切换，失败时自动回滚。

**Git Commit**: 已提交 — `feat(wallpaper): add online library and owner publishing`

---

## [2026-08-17 00:09] 升级 1.1.0 自由便笺与桌面交互版

**变更摘要**: 将项目从 1.0.10 升级为 1.1.0，作为自由便笺、软件内任务工作台、AI 跨便笺管理与全屏返回交互自愈的集中功能版本。

**涉及模块**:
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 同步 1.1.0 版本元数据与自动更新发布契约。
- `README.md` / `TempFile/文档资料/project-status.md`: 更新 1.1.0 发布命令、里程碑名称与本地分发状态。
- `doc/发布说明/1.1.0.md` / `dist/`: 记录功能、兼容性、验证和安装信息，生成 NSIS 安装包、blockmap 与 `latest.yml`（构建产物不进入 Git）。
- GitHub / 本机安装：将发布分支、`main` 和 `v1.1.0` 推送远端，创建正式 Release 并上传三个自动更新资产；静默安装后 EXE 与注册表均确认为 1.1.0。

**版本重点**:
- 一张任务一张纸的多实例自由便笺，可直接输入、拖动、缩放、重叠、换色、分类和完成撕除。
- 主应用独立承载任务分组、周复盘、完成归档和恢复，AI 可跨全部便笺实例增删改。
- 透明 Canvas 补齐全屏游戏返回后的 WorkerW/DefView 层级、合成和鼠标命中自愈。

**Git Commit**: 已提交 — `feat(release): prepare LingyueDesk 1.1.0`
**Git Tag**: `v1.1.0`（已推送）
**GitHub Release**: `https://github.com/chengcczzjj/FlowWallDesk/releases/tag/v1.1.0`

---

## [2026-08-17 00:00] 修复全屏游戏返回后便笺无法拖动

**变更摘要**: 修复 Windows 退出全屏游戏后透明 Canvas 仍可见、主进程也能命中便笺，但 renderer 收不到鼠标事件导致便笺无法拖动的层级/合成状态脱节。

**诊断证据**:
- `dock-diagnostics.jsonl` 显示全屏遮挡已从 `true` 正常恢复为 `false`，且 `canvas.cursor-region-changed` 能连续命中 `todo-board`。
- 同期 `canvas.mouse-passthrough-changed` 已切到 `ignore: false`，原生左键 down/up 也存在，但没有对应的 renderer `pointer-down-observed`；因此故障不在便笺拖动逻辑，而在 Canvas HWND/Chromium 输入表面恢复。

**涉及模块**:
- `src/main/windows/canvasWindow.ts`: 全屏返回时同步刷新壁纸 WorkerW 和 Canvas DefView owner，使用 `showInactive / invalidate / alwaysOnTop -> HWND_BOTTOM` 有界重组合，并强制重应用鼠标穿透状态。
- `src/shared/canvas-hit-test.ts`: 原生命中改为从数组末尾查找最上层重叠便笺；增加 140ms renderer 接管超时自愈决策，且仅允许在 Canvas/桌面 Shell 表面修复，避免抬高到普通应用之上。
- `tests/shared-contracts.test.mjs` / `tests/release-contracts.test.mjs`: 增加重叠顺序、自愈安全边界、全屏返回重组合和 Electron 穿透缓存刷新契约。

**Git Commit**: 已提交 — `fix(canvas): restore sticky note input after fullscreen`

---

## [2026-08-16 21:07] 简化便笺排版与撕除动效

**变更摘要**: 桌面便笺改用 Windows 系统字体与 Sticky Notes 式极简顶栏，在纸面内提供配色/分类快捷设置，并将完成动画从向下扯落改为短促的横向纤维撕除。

**涉及模块**:
- `src/renderer/widgets/TodoBoard/TodoBoard.tsx`: 增加省略号设置层、五色色板、五分类直接切换、外部点击收起与可访问选中状态。
- `src/renderer/widgets/TodoBoard/todo-board.css`: 正文与元信息统一使用 `system-ui / Segoe UI / Microsoft YaHei UI`，重排顶栏与窄尺寸色板，改用 540ms 锯齿裁剪撕除动画。
- `tests/todo-widget.test.mjs` / `doc/小组件/桌面任务便笺组件设计.md`: 固化字体、桌面配色/分类、响应式顶栏和无大幅下落动画的验收契约。

**遇到的问题**:
- 设置层在最小 150px 宽度下无法容纳固定尺寸色板 → 色块改为五列自适应网格，尺寸随便笺宽度收紧。
- 设置按钮不在浮层 `ref` 内，重复点击可能先触发外部关闭 → 单独记录按钮引用，外部点击同时排除按钮与浮层。

**Git Commit**: 已提交 — `refactor(widget): simplify sticky note controls and tear motion`

---

## [2026-08-16 20:47] 重做自由便利贴与软件内任务工作台

**变更摘要**: 根据实际便利贴的使用心智彻底拆分桌面与管理场景：桌面改为“一张任务一张纸”的多实例自由便利贴，软件内新增完整任务工作台，完成任务时以撕落动画离开桌面并保留历史。

**涉及模块**:
- `src/shared/todo.ts` / `src/shared/types.ts` / `src/main/ipc/widgetIpc.ts`: 引入 v2 单任务便利贴模型和 v1 无损展开迁移；多实例按像素自由落位、允许重叠并只保留最小可抓取边缘。
- `src/renderer/widgets/TodoBoard/` / `src/renderer/canvas/Canvas.tsx`: 桌面仅保留文字、轻量状态、完成圆圈与折角；无需组件编辑模式即可直接拖动和缩放，完成后播放纸张撕落动画并隐藏实例。
- `src/main/windows/canvasWindow.ts` / `src/preload/canvas.ts`: 增加独立桌面输入焦点会话；点击便签正文时临时聚焦 Canvas，结束输入后恢复不可聚焦和桌面层级。
- `src/renderer/main-ui/pages/widgets/TodoNotesManager.tsx` / `src/renderer/main-ui/styles.css`: 新增便笺工作台，承载批量创建、纸色/固定方式、时间分组、桌面显隐、周复盘、完成归档和恢复。
- `src/main/memory/tools/definitions/widgets.ts` / `tests/todo-widget.test.mjs`: AI 改为跨全部便利贴实例聚合操作，新增多实例、自由坐标、重叠、撕落保留、隐藏历史和旧数据迁移契约。
- `doc/小组件/桌面任务便笺组件设计.md`: 重写产品边界、桌面/软件信息架构、物理纸张视觉和验收标准。

**遇到的问题**:
- 原组件的网格吸附、碰撞推开和单实例规则与真实便利贴冲突 → 为 `todo-board` 建立独立自由布局策略，不复用普通组件落位。
- 完成后直接删除会让周统计和恢复丢失 → 动画结束只设置 `enabled: false`，完成实例继续作为归档数据存在。
- Canvas 常态 `focusable: false` 导致 textarea 能收到点击却无法接收键盘，且原排版只按宽度缩放 → 使用受限 IPC 临时开启输入焦点，并按容器宽度和高度分别重排窄、矮、默认与大尺寸。

**Git Commit**: 已提交 — `refactor(widget): redesign sticky notes as freeform tasks`

---

## [2026-08-16 19:22] 新增桌面任务便笺与 AI 任务管理

**变更摘要**: 基于 TickTick、Notezilla 和 Sticky Tasks 调研，新增可直接拖动、自由缩放、自动分类、逾期提醒和按周复盘的特色纸张式任务便笺。

**涉及模块**:
- `src/renderer/widgets/TodoBoard/` / `src/renderer/canvas/`: 实现任务新增、勾选、编辑、删除、计划/周记双视图、纸胶带拖动、八向缩放和每日一次逾期通知。
- `src/shared/todo.ts` / `src/shared/desktop-scene.ts`: 增加任务契约、分类与时间分桶、周统计和正式组件能力。
- `src/renderer/main-ui/`: 新增“任务便笺”组件类别、完整产品预览和添加/移除管理入口。
- `src/main/memory/tools/` / `src/shared/tool-manifest.ts`: AI 支持查看、新增、修改、完成、恢复、删除任务和周总结。
- `doc/小组件/桌面任务便笺组件设计.md` / `tests/todo-widget.test.mjs`: 记录调研、范围与验收，并覆盖核心数据和拖动契约。

**遇到的问题**:
- 拖动把手使用按钮元素时会先被通用交互目标门禁拦截 → 让显式 `data-widget-drag-handle` 优先进入拖动分支，并增加回归测试。

**Git Commit**: 已提交 — `feat(widget): add desktop todo note`

---

## [2026-08-16 18:37] 发布 1.0.10 Dock 悬停连续动画修复版

**变更摘要**: 修复 Dock 图标悬停放大后点击会瞬间缩回基础尺寸的问题，让启动缩放和扩散叠影都从点击瞬间的实际尺寸连续播放，并打包发布 1.0.10。

**涉及模块**:
- `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx`: 保留悬停 MotionValue，让启动关键帧作为相对倍率叠乘；扩散叠影读取点击瞬间的实际缩放值作为起点。
- `tests/release-contracts.test.mjs`: 固化 Dock 启动期间不得清零悬停倍率、两个 Dock 入口必须传递实际起始倍率的回归契约。
- `package.json` / `package-lock.json` / `README.md` / 项目与组件文档: 版本和发布说明升级到 1.0.10。

**遇到的问题**:
- 1.0.9 为避免两套动画叠乘，在启动期间把内层悬停倍率强制切为 1，造成可见尺寸断层 → 保持悬停层连续，由外层仅播放相对启动关键帧，并让叠影从 `scale.get()` 快照开始。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.10`

---

## [2026-08-16 18:23] 发布 1.0.9 统一图标启动反馈版

**变更摘要**: 移除 Dock 纵向等待弹跳，改为与普通图标收纳完全一致的缩放回弹和图标副本扩散反馈，并打包发布 1.0.9。

**涉及模块**:
- `src/shared/icon-launch-motion.ts`: 提取收纳与 Dock 共用的缩放、缓动、扩散和反馈时长参数。
- `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx`: Dock 应用及系统入口复用收纳动画；启动时隔离悬停放大，“回到桌面”继续无动画。
- `src/renderer/widgets/FrostedGlassBackground.tsx` / `src/renderer/canvas/wallpaperFrameStore.ts`: 纳入上一提交的毛玻璃帧更新效率优化，显示参数保持不变。
- `package.json` / `package-lock.json` / `README.md` / `tests/`: 版本与发布契约升级到 1.0.9，并验证三处图标入口共享同一动画参数。

**遇到的问题**:
- Dock 悬停放大与点击缩放叠乘会让按下阶段不明显 → 启动反馈期间暂时使用基础尺寸，在独立层播放收纳动画，结束后再恢复悬停缩放。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.9`

---

## [2026-08-16 17:00] 优化毛玻璃帧更新效率

**变更摘要**: 在保持抽帧分辨率、帧率、JPEG 质量、模糊半径、颜色和坐标裁切完全不变的前提下，降低动态毛玻璃的 React 与 Canvas 开销。

**涉及模块**:
- `src/renderer/widgets/FrostedGlassBackground.tsx`: 壁纸帧改为直接更新图片资源，不再让每个毛玻璃组件每帧触发 React 提交。
- `src/renderer/canvas/wallpaperFrameStore.ts`: 跳过重复源帧，复用 Canvas 与 2D context，并显式清屏保持原有像素输出。
- `tests/release-contracts.test.mjs`: 固化 768px、4fps、JPEG 质量、12px 基础模糊和饱和度等视觉参数，防止性能优化改变效果。

**遇到的问题**:
- 直接复用 Canvas 可能残留上一帧透明边缘 → 每帧先 `clearRect`，并用 Electron/Chromium 对新旧管线做 JPEG 逐字节对比，输出长度和内容完全一致。

**Git Commit**: 已提交 — `perf(widget): reduce frosted glass frame overhead`

---

## [2026-08-16 12:22] 发布 1.0.8 Dock 动画节奏优化版

**变更摘要**: 将过快的 Dock 启动动画重做为接近 macOS 节奏的等高匀速等待弹跳，并让“回到桌面”直接执行、不播放弹跳。

**涉及模块**:
- `src/shared/dock-motion.ts`: 单跳改为 360ms 上升、360ms 下降和 100ms 落地停顿，应用就绪后等图标回到底线再结束。
- `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx`: 启动期间循环等待；设置、资源管理器和回收站保留单跳，“回到桌面”跳过动画。
- `doc/小组件/图标收纳组件设计.md` / `tests/`: 固化动画位移、节奏、停止边界和系统按钮行为。
- `package.json` / `package-lock.json` / `README.md`: 版本和发布指引同步升级到 1.0.8。

**遇到的问题**:
- 旧参数在 0.96 秒内连续完成 3 跳，单跳仅约 320ms，视觉明显快于 macOS 启动反馈 → 改成单次 720ms 等速往返，并只在落地阶段终止等待动画。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.8`

---

## [2026-08-15 23:51] 发布 1.0.7 Dock 交互与手动更新版

**变更摘要**: 发布 1.0.7，补齐设置页手动更新入口，并修复图标收纳点击、回到桌面和 Dock 启动等待反馈。

**涉及模块**:
- `src/renderer/widgets/DesktopIcons/` / `src/renderer/canvas/`: 原生点击补偿覆盖全部图标收纳，Dock 改为等高匀速弹跳并等待真实应用窗口就绪。
- `src/main/windows/` / `src/main/ipc/`: 修复 Win+D 回到桌面，统一应用窗口枚举、唤醒与 15 秒有界就绪检测。
- `src/renderer/main-ui/pages/settings/` / `src/main/services/update-service.ts`: 新增常驻版本与更新卡片，展示检查时间、状态、进度和重启安装操作。
- `package.json` / `package-lock.json` / `README.md` / `tests/`: 版本和发布契约升级到 1.0.7，更新兼容的安全依赖覆盖，并补齐 Dock、更新和发布回归检查。
- `AGENTS.md`: 固化“开发完成并验证后默认提交、仅在用户明确要求时打包发布”的项目协作约定。

**遇到的问题**:
- 透明 Canvas 的原生点击补偿只覆盖 Dock，普通收纳仍无法启动；固定时长弹跳也早于应用真正打开结束 → 扩展全部图标组件命中，并以真实主窗口就绪信号控制循环弹跳。
- PowerShell 桌面切换与主窗口最小化、Canvas 层级刷新互相竞态 → 改用 Win32 `SendInput` 的完整 Win+D 序列。
- 自动检查有延迟且缺少常驻入口 → 设置页提供始终可见的手动检查、下载和安装状态反馈。
- 依赖审计的 `brace-expansion`、`fast-uri`、`nanoid` 可兼容升级；`extract-zip` 仅存在于 Electron 构建依赖，彻底移除需单独验证 Electron 43 大版本升级。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.7`

---

## [2026-08-08 09:50] 发布 1.0.6 Dock 前台误触安全修复版

**变更摘要**: 修复点击覆盖 Dock 的其他前台窗口时错误闪动 Dock 并启动下方应用的严重输入穿透问题，同时发布低占用更新安装改进。

**涉及模块**:
- `src/main/windows/canvasWindow.ts` / `src/shared/native-dock-click.ts`: 原生左键兜底在按下和释放两端校验 `WindowFromPoint` 根 HWND，只允许 Canvas 真实位于光标最上层时补偿点击。
- `src/shared/canvas-hit-test.ts`: Canvas 临时置顶重组期间强制全鼠标穿透，避免 150ms 合成修复窗口截获前台输入。
- `src/main/services/update-service.ts` / `electron-builder.yml`: 更新安装器以低于正常优先级启动，发布包仅收录生产输出目录。
- `package.json` / `package-lock.json` / `README.md` / `tests/`: 版本和发布契约同步升级到 1.0.6，并覆盖普通点击、极快点击和前台窗口隔离。

**遇到的问题**:
- 1.0.5 的物理左键兜底只按屏幕坐标命中 Dock，前台窗口导致渲染层无 `pointerdown` 时反而会触发补偿 → 增加最上层 HWND 双端门禁，并在无法确认归属时安全拒绝。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.6`

---

## [2026-08-08 00:24] 收紧发布包输入并降低更新安装占用

**变更摘要**: 将 Windows 更新安装器改为显式低优先级启动，补齐安装中状态与独立诊断日志，并限制发布包只收录实际生产输出目录。

**涉及模块**:
- `src/main/services/update-service.ts` / `src/main/runtime/diagnosticLog.ts`: 记录更新下载与安装路径，以低于正常优先级启动 NSIS 安装器，并在启动成功后有界退出应用。
- `src/renderer/main-ui/components/SidebarUpdateButton.tsx` / `src/renderer/main-ui/styles.css` / `src/shared/types.ts`: 增加 `installing` 状态，缩小并固定侧栏更新按钮位置，避免安装阶段重复触发。
- `electron-builder.yml` / `tests/release-contracts.test.mjs`: 发布包仅收录 main、preload、renderer 三类生产输出，并补齐更新和打包契约。

**遇到的问题**:
- 默认退出安装会让安装进程继承普通优先级且缺少独立诊断 → 显式启动已校验的下载文件、下调进程优先级，并保留 `quitAndInstall` 兜底。

**Git Commit**: 已提交 — `fix(update): reduce installer load and package scope`

---

## [2026-08-05 00:25] 发布 1.0.5 Dock 全屏恢复稳定性修复版

**变更摘要**: 将 Dock 全屏恢复点击兜底、持久诊断和真实应用窗口唤醒修复升级为 1.0.5，并发布 Windows 安装包与自动更新元数据。

**涉及模块**:
- `src/main/windows/` / `src/renderer/canvas/`: 全屏恢复后重建 Canvas 层级，以 Win32 左键状态兜底透明窗口漏失的 `pointerdown`。
- `src/main/ipc/desktopIconIpc.ts` / `src/shared/window-activation.ts`: 飞书支持启动器子目录进程，Steam 优先真实 helper 主窗口并过滤内部工具 HWND。
- `src/main/runtime/diagnosticLog.ts` / `src/main/runtime/dockLaunchSelfTest.ts`: 持久化完整启动链路，并支持开发态多轮正常点击与原生兜底自检。
- `package.json` / `package-lock.json` / `README.md` / `tests/`: 版本和发布契约同步升级至 1.0.5。

**遇到的问题**:
- 本地修复提交完成但未推送和发布 → 按用户约定补齐发布分支、版本标签、GitHub Release、安装包、blockmap 与 `latest.yml`。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.5`

---

## [2026-08-05 00:15] 彻底修复 Dock 全屏恢复后点击与应用唤醒

**变更摘要**: 根据持久化诊断日志定位透明 Canvas 在全屏恢复后丢失 `pointerdown`、以及单实例应用窗口误选问题，增加原生点击兜底、真实主窗口筛选和开发态自动回归。

**涉及模块**:
- `src/main/windows/canvasWindow.ts` / `src/renderer/canvas/Canvas.tsx`: 移除可见期间反复修改 z-order 的轮询，增加原生光标命中、物理左键监测、指针生命周期保护和仅在渲染层漏收按下时触发的 Dock 补偿点击。
- `src/main/windows/foregroundAppWindow.ts` / `src/shared/window-activation.ts`: 支持启动器子目录进程和 Steam helper 主窗口，过滤 1x1 GDI、IME、托盘及电源消息等内部窗口，恢复隐藏或最小化的真实应用窗口。
- `src/main/ipc/desktopIconIpc.ts` / `src/main/runtime/diagnosticLog.ts`: 持久记录命中、IPC、快捷方式启动、窗口类名/矩形、前台激活和全屏恢复链路，日志按 2 MB 轮转。
- `src/main/runtime/dockLaunchSelfTest.ts` / `tests/`: 增加仅显式环境变量启用的开发自检器和原生兜底、窗口候选、稳定层级回归契约。

**遇到的问题**:
- 全屏退出后透明 Canvas 仍能收到 hover/`pointerup`，但 Windows/Chromium 偶发不再投递 `pointerdown` → 用 Win32 左键状态验证真实点击，只在渲染层没有确认收到图标按下时发送一次坐标级补偿点击。
- 飞书快捷方式目标是外层启动器，真实窗口属于 `app/Feishu.exe`；Steam 的精确进程含可见 1x1 GDI 内部窗 → 按安装目录匹配候选，并以可见性、窗口尺寸、类名和标题筛选真实主窗口。

**Git Commit**: 已提交 — `fix(dock): stabilize launches after fullscreen`

---

## [2026-08-04 00:55] 发布 1.0.4 智能组件与 DeepSeek V4 适配版

**变更摘要**: 修复对话创建股票组件、壁纸冷启动合成和组件左上角堆放问题，补齐智能落位、创建动效、长按移动、Dock 物理弹跳及 DeepSeek V4 Flash 适配。

**涉及模块**:
- `src/main/memory/` / `src/shared/stock-symbols.ts`: 股票意图进入组件工具，使用明确的 A 股代码契约；实时数据禁止由生成组件伪造，并补齐 DeepSeek V4 thinking 参数、上下文能力和澄清策略。
- `src/main/ipc/widgetIpc.ts` / `src/shared/widget-placement.ts`: 新组件延续已有组件组的行列关系，空桌面从右上安全区落位并避开任务栏、Dock 和已有组件。
- `src/renderer/canvas/` / `src/renderer/widgets/`: 创建过程按“底板展开 → 标题 → 内容逐项出现”呈现；非交互区域长按可直接移动，Dock 使用较慢的重力上抛与衰减回弹。
- `src/main/services/stocks-service.ts` / `src/renderer/widgets/Stocks/`: 行情字段容错、无数据原因反馈、股票卡片逐项显现和共享预设规范化。
- `src/main/windows/wallpaperWindow.ts` / `src/renderer/wallpaper/Wallpaper.tsx`: READY 延迟到可见帧提交后并主动触发有界重绘，消除首次点击桌面才显示壁纸的竞态。
- `package.json` / `tests/`: 版本升级至 1.0.4，增加 DeepSeek、股票、智能落位与 Dock 动画回归契约。

**遇到的问题**:
- 股票组件虽然创建成功但没有可靠内容 → Agent 未获得 `symbols` 结构约束且行情接口可能返回 `-` → 增加 typed stockSymbols、名称/代码规范化与 nullable 数值渲染。
- 长按移动容易吞掉组件正常点击 → 只在非按钮、非输入、非图标动作区域启动 520ms 长按，移动超过阈值前可取消，释放后仍走统一碰撞落位。

**Git Commit**: 已提交 — `feat(release): publish LingyueDesk 1.0.4`

---

## [2026-08-03 23:06] 发布 1.0.3 桌面交互与侧栏更新修复版

**变更摘要**: 修复 Dock 与图标收纳反复失去启动能力的问题，分离 Dock 悬停与启动动画，并将自动更新改为左侧栏按需下载、下载后重启安装。

**涉及模块**:

- `src/renderer/canvas/` / `src/shared/canvas-pointer-gate.ts`: 用画布级指针门统一管理透明窗口鼠标穿透，确保点击完成前不会提前穿透。
- `src/renderer/widgets/DesktopIcons/` / `src/main/ipc/desktopIconIpc.ts`: 按组件绑定持久化图标记录，并将 Dock 悬停缩放与启动弹跳拆到独立变换层。
- `src/renderer/main-ui/` / `src/main/services/update-service.ts`: 设置页移除更新卡片，发现新版本时在左侧栏显示下载、进度和重启更新按钮。
- `tests/` / `package.json` / `package-lock.json`: 增加交互与发布回归契约，并将版本升级到 1.0.3。

**遇到的问题**:

- 透明画布的组件级 `pointerup/mouseleave` 与全屏恢复状态机重复控制穿透，动画改变命中区域时会截断点击链路 → 改为画布级指针门，并把穿透恢复延迟到原生点击结束后的下一帧。
- Dock 点击会清空鼠标距离值，且悬停 lift 与启动 bounce 同时写入纵向变换 → 保留悬停距离，并采用“内层缩放、外层弹跳”的独立动画层。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.3`

---

## [2026-08-01 23:05] 发布 1.0.2 Dock 与毛玻璃稳定性修复版

**变更摘要**: 修复反复全屏、最小化造成壁纸暂停/恢复后 Dock 与图标收纳悬停失效、图标无法点击的问题，并将组件背景升级为带抽帧兜底的真实毛玻璃效果。

**涉及模块**:

- `src/main/windows/` / `src/renderer/canvas/Canvas.tsx` / `src/shared/desktop-occlusion.ts`: 统一桌面遮挡状态机，恢复时重建窗口层级、鼠标穿透和画布交互状态。
- `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx`: 清理悬停、拖拽、指针捕获和动画残留，并按恢复后的真实光标位置重新对齐命中状态。
- `src/main/ipc/wallpaperIpc.ts` / `src/renderer/wallpaper/Wallpaper.tsx`: 稳定壁纸暂停/恢复订阅，取消过期播放任务并增加抽帧失活 watchdog。
- `src/renderer/canvas/wallpaperFrameStore.ts` / `src/renderer/widgets/FrostedGlassBackground.tsx`: 增加像素级预模糊帧和 CSS 模糊双重保障，避免透明桌面窗口合成时退化成纯半透明背景。
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 将应用与发布契约版本同步升级到 1.0.2。

**遇到的问题**:

- 透明画布在反复遮挡时持续调整 z-order，并遗留 pointer capture 与 MotionValue 状态，最终导致点击链路失效 → 用稳定遮挡状态机收敛窗口操作，并在恢复边界完整重置交互状态。
- CSS `backdrop-filter` 无法跨 Electron 透明窗口采样壁纸，原实现实际只剩半透明叠色 → 将壁纸帧传入画布并预先做像素模糊，渲染帧中断时由主进程截图兜底。

**Git Commit**: 已提交 — `fix(release): publish LingyueDesk 1.0.2`

---

## [2026-08-01 19:14] 发布 1.0.1 自动更新测试版

**变更摘要**: 将桌面小组件毛玻璃默认模糊强度从 20px 提升到 24px，升级版本并生成用于验证公开 GitHub Release 自动更新链路的 1.0.1 安装包。

**涉及模块**:

- `src/renderer/widgets/FrostedGlassBackground.tsx`: 提高未显式配置组件的默认毛玻璃模糊强度。
- `package.json` / `package-lock.json` / `tests/release-contracts.test.mjs`: 将应用与发布契约版本同步升级到 1.0.1。
- `README.md` / `TempFile/文档资料/project-status.md`: 同步公开更新源和正式更新测试版状态。

**遇到的问题**:

- 未打包版本首次启动在后台保持运行，主窗口不可见 → 再次启动触发单实例唤起后完成设置页 v1.0.1 实机验证。

**Git Commit**: 已提交 — `feat(release): publish LingyueDesk 1.0.1`

---

## [2026-08-01 10:35] 发布首个正式版本并完成桌面实测

**变更摘要**: 完成 Agent/记忆/AI 小组件架构升级与安全性能修复，接入自动更新和开机启动，完成开发态、打包态和安装态实操验证并生成 v1.0.0 安装包。

**涉及模块**:

- `src/main/memory/` / `src/shared/agent-runtime.ts` / `src/shared/tool-manifest.ts`: 统一工具清单、运行终态、审批作用域、混合记忆检索、上下文预算和结构化归档。
- `src/main/memory/tools/definitions/widgets.ts` / `src/renderer/widgets/GeneratedWidget/`: 支持 AI 对话通过安全声明式协议直接生成可交互桌面组件。
- `src/main/services/update-service.ts` / `src/main/services/launch-at-login-service.ts` / 设置页: 自动检查下载、退出或按钮安装更新，并默认注册 Windows 开机启动项。
- `electron.vite.config.ts` / `electron-builder.yml` / `tests/`: 保持 sandbox 的单文件角色化 preload，补齐发布配置、回归测试和 Windows NSIS 构建。

**遇到的问题**:

- 多入口 preload 被 Rollup 拆成共享 chunk，Electron sandbox 无法加载而白屏 → 改为单入口、按窗口角色隔离暴露 bridge，并增加发布契约测试。
- 私有 GitHub 更新源返回的 404 含完整响应头 → 更新错误统一脱敏和限长；待公开 Release 源后即可发现并下载版本。
- Windows 本机无签名证书 → 正式包保留图标和版本资源但暂不签名，后续发布前补代码签名证书。

**Git Commit**: 已提交 — `feat(release): prepare LingyueDesk 1.0.0`

---

## [2026-05-26 00:18] 明确打包后的运行时可变层与 AI 自修复边界

**变更摘要**: 将壁纸导入、壁纸设置和壁纸组件配置从内置资源写入改为 userData 运行时覆盖层，并在文档中明确 AI 伴侣自检/自修复只能处理运行时数据、用户导入资源和未来受控组件包。

**涉及模块**:

- `src/main/runtime/userDataPaths.ts`: 新增 userData 路径集中管理，包括用户壁纸、壁纸设置覆盖和组件配置覆盖。
- `src/main/ipc/wallpaperIpc.ts`: 内置壁纸只读扫描，用户导入壁纸写入 userData；壁纸设置写入覆盖文件。
- `src/main/ipc/widgetIpc.ts`: 壁纸默认组件配置只读，用户/AI 调整后的组件配置写入 userData 覆盖层。
- `TempFile/文档资料/project-status.md` / `TempFile/文档资料/记忆系统/local-folder-agent-development-guide.md` / `TempFile/文档资料/记忆系统/memory-system-design.md` / `TempFile/文档资料/other/灵月项目开发指南 .md`: 同步运行时可修复范围、不可自修复范围和后续诊断 UI 规划。

**遇到的问题**:

- 打包后的 `resources/assets` 随安装包分发，直接写入会在权限、更新、asar 和安装目录场景下不稳定。调整为“内置资源只读默认值 + userData 覆盖层”，让 AI 后续能安全检查和修复运行时数据。

**Git Commit**: 未提交

---

## [2026-05-24 00:00] 优化桌面 Dock 交互与系统图标

**变更摘要**: 优化桌面 Dock 与图标收纳的点击、启动动画、命中区域和系统按钮体验，并接入外部 Dock 系统图标资源。

**涉及模块**:

- `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx` / `src/renderer/canvas/Canvas.tsx`: 增强 Dock 单击启动、防重复触发、长按拖拽穿透处理、启动弹跳和图标收纳启动反馈。
- `src/main/ipc/appIpc.ts` / `src/main/ipc/widgetIpc.ts`: 调整系统按钮行为，打开 Windows 设置、原生切换桌面，并提高默认 Dock 悬浮放大比例。
- `src/renderer/public/dock-icons/`: 新增 Dock 系统按钮 SVG 图标与授权说明。

**遇到的问题**:

- Dock 图标放大后可点击区域不足且容易触发画布拖拽 → 为桌面图标动作标记独立命中区，并在画布捕获阶段临时关闭鼠标穿透。

**Git Commit**: `8ae9b9e` — feat(widget): improve dock interaction and icons

---

## [2026-05-19 00:18] 整理壁纸资源托管方案文档

**变更摘要**: 新增正式文档，整理远程壁纸资源托管、容量估算、manifest 清单、本地下载目录和分阶段发布方案。

**涉及模块**:

- `doc/正式文档/壁纸资源托管与下载方案.md`: 说明 GitHub Releases、Hugging Face Datasets、Cloudflare R2 等资源托管选择，以及应用端下载和校验流程。
- `doc/正式文档/` / `doc/other/`: 纳入现有文档归档目录结构，区分正式设计文档与辅助方案文档。

**遇到的问题**:

- 无。

**Git Commit**: 已提交 — docs: add wallpaper asset hosting plan

---

## [2026-05-18 23:28] 完善搜索定位工具与桌面体验

**变更摘要**: 接入多提供商联网搜索、隐私授权定位和天气自动位置查询，并优化壁纸加载、抽帧暂停、宠物主题与工具过程展示。

**涉及模块**:

- `src/main/memory/tools/` / `src/main/memory/chat/chatService.ts`: 新增 `get_user_location`，重做 `web_search` 多提供商与无 Key 兜底，天气工具支持按用户位置查询，并缓存重复只读工具调用。
- `src/main/ipc/appIpc.ts` / `src/renderer/main-ui/pages/settings/SettingsGeneralPage.tsx`: 增加精准定位授权、验证和 Windows 定位设置入口。
- `src/renderer/main-ui/pages/chat/` / `src/renderer/shared/pixel-pet.ts`: 增强搜索/定位工具过程展示和聊天宠物状态、主题同步。
- `src/main/ipc/wallpaperIpc.ts` / `src/renderer/wallpaper/Wallpaper.tsx`: 壁纸媒体 ready 后再贴桌面，并在全屏遮挡时暂停抽帧与视频播放。

**遇到的问题**:

- 精准定位不能只保存开关状态，否则后端工具会误以为可用 → 设置页必须实际获取设备坐标成功后才保持开启，失败时回落城市级位置并提示打开系统定位设置。

**Git Commit**: 已提交 — feat: improve agent tools and desktop experience

---

## [2026-05-15 00:30] 完善 DeepSeek 与 Agent 人性化对话体验

**变更摘要**: 修复 DeepSeek 工具循环、模型配置和 Agent 过程 UI，支持流式工具续聊、触发式记忆召回、人格化对话气泡与工具记录时间线。

**涉及模块**:

- `src/main/memory/models/` / `src/main/memory/chat/chatService.ts`: 新增 DeepSeek 专用流式工具循环，保留 `reasoning_content`，增加只读工具去重和工具前文本推流。
- `src/renderer/main-ui/pages/chat/` / `src/shared/persona.ts`: 增强 Persona 管理、聊天主界面、工具记录时间线和人性化状态展示。
- `src/renderer/main-ui/pages/settings/` / `src/main/ipc/chatIpc.ts`: 补齐 DeepSeek provider、模型列表、连接测试和 API Key 处理体验。
- `doc/project-status.md` / `doc/VSCode智能体设计文档.md` / `doc/记忆系统设计说明.md`: 同步 Agent 当前实现、人性化 UI 分层和记忆召回边界。

**遇到的问题**:

- DeepSeek thinking 模型工具续聊需要回传 `reasoning_content`，AI SDK 兼容层会丢失该字段 → 新增 DeepSeek 专用 SSE 工具循环。
- 模型文本和工具记录混排会导致气泡合并、记录丢失或重复显示 → 按 `textOffset` 构建对话/工具交错时间线，连续无文本间隔的重复工具才合并。

**Git Commit**: 已提交 — feat(agent): enhance deepseek and humanized tool timeline

---

## [2026-05-06 15:55] 接入像素宠物分页与高密度角色绘制

**变更摘要**: 新增桌宠的像素宠物分页，接入默认鬣狗与晴蓝双角色、高密度像素绘制、动作库、模型生成入口和桌面 Pet widget 同步。

**涉及模块**:

- `src/renderer/main-ui/pages/pet/PixelPetPage.tsx` / `src/renderer/main-ui/styles.css` / `src/renderer/main-ui/App.tsx`: 新增像素宠物子分页，重做沉浸预览舞台、动作分类、宠物列表、配色、模型生成和输出控制。
- `src/renderer/shared/pixel-pet.ts` / `src/renderer/shared/PixelPetCanvas.tsx`: 新增像素宠物状态、主题、默认宠物、Canvas 渲染循环，以及鬣狗和晴蓝 reference 高密度绘制管线。
- `src/renderer/widgets/Pet/Pet.tsx` / `src/renderer/widgets/index.tsx`: 桌面 Pet 组件支持读取像素宠物配置并渲染当前动作。
- `demo/pet-port-current/`: 保留干净参考预览、晴蓝动作 renderer、迁移指南和本地生成服务脚本。
- `doc/project-status.md`: 更新 Pet 模块与桌宠分页进展。

**遇到的问题**:

- 只迁 UI 会导致角色外观和动作与参考预览不一致 → 将参考中的鬣狗与晴蓝高密度 renderer 分别迁入 shared 绘制管线，并为晴蓝单独保留全动作专用路径。

**Git Commit**: 已提交 — feat(ui): add pixel pet page

---

## [2026-05-06 15:42] 修复图标收纳与 Dock 稳定性问题

**变更摘要**: 修复桌面图标收纳和 Dock 在真实使用中的导入、恢复、默认位置、批量拖拽和回收站兼容问题，并补充日志排查说明。

**涉及模块**:

- `src/main/ipc/desktopIconIpc.ts` / `src/main/ipc/widgetIpc.ts`: 强化桌面文件夹导入保护、恢复回滚、批量导入、Dock 默认尺寸位置和删除恢复策略。
- `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx` / `src/renderer/canvas/Canvas.tsx`: 修复 Dock 底板塌陷、图标导入同步、右键菜单和导入失败日志。
- `src/preload/*` / `src/main/ipc/appIpc.ts` / `src/shared/*`: 增加回收站系统按钮、Shell 虚拟对象容错和桌面图标 IPC 类型。
- `doc/图标收纳组件方案.md`: 补充故障排查日志位置、日志含义和托管目录保护策略。

**遇到的问题**:

- 回收站等 Shell 虚拟对象没有真实文件路径，混在批量拖拽中会导致整批失败 → preload 捕获路径解析异常并跳过虚拟对象，Dock 默认提供回收站系统按钮。
- 文件夹导入失败可能因 copy/delete 兜底造成源文件离开桌面且组件无记录 → 导入只使用安全 `rename`，记录写入失败时尝试回滚，失败原因写入主进程日志。

**Git Commit**: 已提交 — fix(widget): 提升图标收纳与 Dock 稳定性

---

## [2026-05-05 23:46] 完成桌面图标收纳与 Dock 系统按钮

**变更摘要**: 落地图标收纳组件与桌面 Dock，支持桌面图标托管启动、跨壁纸全局保存、收纳外观设置、Dock 悬浮交互和系统快捷按钮。

**涉及模块**:

- `src/renderer/widgets/DesktopIcons/`: 新增纵向/横向/自适应收纳和 Dock，支持拖入图标、长按排序、resize、标题样式、隐藏名称、Dock 悬浮放大与 Win11 风格系统图标。
- `src/main/ipc/desktopIconIpc.ts` / `src/shared/ipc-channels.ts` / `src/preload/canvas.ts`: 新增桌面图标导入、启动、刷新、删除恢复和 Dock 系统按钮 IPC。
- `src/renderer/canvas/Canvas.tsx` / `src/renderer/widgets/FloatingToolbar.tsx` / `src/renderer/main-ui/pages/WidgetsPage.tsx`: 接入图标收纳管理页、外观工具栏、多实例、应用到全部收纳和收纳 resize 度量。
- `src/main/windows/*` / `src/renderer/wallpaper/Wallpaper.tsx` / `src/renderer/widgets/FrostedGlassBackground.tsx`: 优化壁纸全屏贴合、毛玻璃抽帧和回到桌面/z-order 行为。
- `doc/project-status.md` / `doc/图标收纳组件方案.md`: 更新项目状态与图标收纳实现说明。

**遇到的问题**:

- `.lnk/.url` 直接解析 target 启动不等同桌面双击，部分软件无法打开 → 优先交给 Windows Shell 打开原快捷方式，再回退 target 启动。
- Dock 固定系统按钮初版没有跟随 Dock 放大参数，且视觉像背景底按钮 → 改为复用普通 Dock 距离缩放逻辑，并重做为 Win11 风格图标本体。

**Git Commit**: 已提交 — feat(widget): 完善桌面图标收纳与 Dock

---

## [2026-05-04 23:09] 落地本地工作区 AI Chat Agent

**变更摘要**: 完成本地工作区 AI Chat/Agent 主链路，支持模型配置、项目会话、工具调用过程 UI、受控文件读写、授权审批、Checkpoint、文件活动与结果验证。

**涉及模块**:

- `src/main/memory/`: 新增 SQLite/Drizzle 记忆数据库、会话事件、AgentRun、审批、Checkpoint、Artifact、文件变更、自动化与工具注册体系。
- `src/main/ipc/chatIpc.ts` / `src/preload/main-ui.ts` / `src/shared/*`: 接入聊天、模型配置、项目工作区、AgentRun、审批和文件活动 IPC 类型。
- `src/renderer/main-ui/pages/chat/`: 新增 Chat/Persona 页面，统一工具过程时间线、对话气泡、项目侧栏、Working in 文件活动与授权提示 UI。
- `src/renderer/main-ui/pages/settings/`: 新增模型配置页，支持 OpenAI 兼容与 Google Gemini profile 管理和连接测试。
- `package.json`: 接入 Vercel AI SDK、better-sqlite3、drizzle、文档/表格/OCR 等 Agent 工具依赖。

**遇到的问题**:

- 工具过程、模型回复和状态提示混在同一气泡中导致顺序混乱 → 按 `textOffset` 还原时间线，并把真实对话与系统状态分层显示。
- 新文件写入前 checkpoint 缺少历史文件会误判失败 → 对不存在的新路径返回 skipped，避免阻断创建流程。
- 成功生成文件后仍可能被旧失败兜底覆盖 → 增加成功交付跟踪，最终回复以实际交付结果为准。

**Git Commit**: 已提交 — feat(agent): add local workspace chat agent

---

## [2026-04-26 15:10] 新增多款时钟组件并优化画布交互

**变更摘要**: 扩展悬浮时钟组件体系，新增图形时间、像素时钟和独立日期时钟，并优化悬浮组件拖拽、尺寸测量与碰撞吸附体验。

**涉及模块**:

- `src/renderer/widgets/GraphicDateTime/GraphicDateTime.tsx`: 新增图形时间组件，支持日期背景颜色、明暗文字和天气摘要。
- `src/renderer/widgets/PixelClock/PixelClock.tsx`: 新增像素时钟组件，并接入本地像素字体资源。
- `src/renderer/widgets/ElegantClock/ElegantClock.tsx`: 将日期时钟从 Clock 样式拆为独立悬浮组件。
- `src/renderer/main-ui/pages/WidgetsPage.tsx`: 补齐新增悬浮组件入口、默认配置和静态预览。
- `src/renderer/widgets/index.tsx` / `src/renderer/widgets/shared/constants.tsx` / `src/renderer/widgets/FloatingToolbar.tsx`: 注册新组件类型，并支持主题、透明度与明暗切换。
- `src/renderer/canvas/Canvas.tsx` / `src/main/ipc/widgetIpc.ts`: 优化 fit-content 悬浮组件尺寸测量、拖拽吸附预览和碰撞推开逻辑。
- `doc/project-status.md`: 更新组件系统完成度和桌面组件清单。

**遇到的问题**:

- 图形时间日期字体不能依赖强制横向压缩 → 改用窄体字体栈，并用同色不同透明度实现日期渐变。
- 悬浮组件缩放后逻辑尺寸和视觉尺寸不一致 → 改为等待字体就绪后读取 DOM 实际尺寸参与保存与碰撞计算。

**Git Commit**: `9706bde` — feat: add clock widgets and improve canvas snapping
