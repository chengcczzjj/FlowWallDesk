# 灵月桌面 开发日志

> 近期事件，默认只读最近 3-5 条；当前能力看 [项目状态](project-status.md)，可复用结论看 [开发经验](dev-lessons.md)，资料取舍看 [知识索引](knowledge-index.md)。
> 历史记录只证明当时的事件，不代表当前方案或新的操作授权；旧路径/旧结论保留以便追溯。

历史归档：[2026-08](archive/dev-log-2026-08.md) · [2026-05](archive/dev-log-2026-05.md) · [2026-04](archive/dev-log-2026-04.md)。主页和归档不重复保存同一条事件。

## [2026-09-25] 聊天伙伴组件控制、自动更新可靠性与 1.1.13 发布流程

**变更摘要**: 审查聊天 Agent 对桌面组件的控制链路，补齐布局与生成卡片编辑能力并校验所有设置；修复自动更新“有时不灵”；合并已发布的 1.1.12，升版 1.1.13 并新增 Windows Actions 发布流程，让其他电脑可通过自动更新获取。

**涉及模块**:
- `src/shared/widget-config-spec.ts` / `src/main/memory/tools/definitions/widgets.ts` / `src/main/ipc/widgetIpc.ts`: 组件设置单一规格与校验（拒绝项返回可选值）；新增 `arrange_widget`（锚点/缩放/隐藏恢复/置顶，按组件所在显示器的本地工作区落位）与 `update_generated_widget`；预设、锚点、删除常驻组件确认、摘要瘦身。
- `src/main/memory/tools/toolRouter.ts` / `chatService.ts` / `ChatPage.tsx`: 追问沿用最近的组件工具类别；修正过程标题。
- `src/main/services/update-service.ts` / `src/main/tray.ts`: 失败退避重试、唤醒复查、发现即后台下载、系统通知与托盘“重启并更新”。
- 合并 v1.1.12：画布命中回退改用 `materializeWidgetsForCanvas`，毛玻璃采用 1.1.12 逐屏帧（替代 09-25 早先的逐窗口帧来源方案），移除被替代的并集矩形适配与渲染偏移辅助函数。
- `.github/workflows/release-windows.yml` / `scripts/verify-windows-release.mjs`: Windows 构建→核验清单/哈希/asar 版本与入口→草稿上传→核对资产→发布→复核公开更新源。

**遇到的问题**:
- 旧 `update_widget_config` 直接合并任意键，模型写入组件不读取的配置后仍宣称成功；预设里也有不存在的样式值。
- 自动更新只在启动和每 6 小时检查一次，失败后不重试，且需要用户进主界面手动下载，托盘常驻时几乎发现不了新版本。
- `@electron/asar` 3.4.1 的打包函数在 Node 22 下不返回（仅影响测试造包，读取与 electron-builder 构建不受影响）。

**验证结果**:
- Linux 容器：`npm test` 类型检查、lint 通过，117 项测试 116 通过；失败项为依赖 Windows 路径分隔符的桌面图标导入测试，在未改动的 v1.1.12 上同样失败。Xvfb 下 `test:electron:smoke` 三组通过；`build:check` 成功；发布核验脚本用合成产物验证了通过与篡改检测。
- 未在 Windows 实机安装验收；远端构建与发布结果以 Actions 运行和 Release 复核为准。

**提交意图**: `chore(release): prepare LingyueDesk 1.1.13`

---

## [2026-09-25 21:44] 整治桌面层级闪烁、多显示器对齐与主界面规范问题

**变更摘要**: 系统排查桌面组件在开启应用、操作输入法时的闪烁与指针跳变、需要多次点击才能输入/拖拽的问题，修复多显示器下毛玻璃错位与组件落位，并按审查结果修正主界面和设置页的层级、状态与设计规范问题。

**涉及模块**:
- `src/main/windows/canvasWindow.ts` / `src/shared/canvas-hit-test.ts`: `setFocusable` 只在状态变化时调用并立即隐藏任务栏标签；便利贴获取键盘焦点后回到桌面层；输入期间不再整屏截获鼠标；原生命中改用 renderer 上报的 DOM 命中区域，并在光标处组件被其他窗口遮住（且该窗口确在画布之上）时保持穿透、通知 renderer 暂停悬停。
- `src/main/index.ts`: Windows 下关闭 Chromium `CalculateNativeWinOcclusion`。
- `src/renderer/canvas/Canvas.tsx` / `canvas.css` / `src/renderer/widgets/TodoBoard/TodoBoard.tsx`: 上报命中区域、遮挡时关闭指针事件；便利贴窗口短暂失焦（输入法/系统浮层）不立即结束编辑。
- `src/main/ipc/wallpaperIpc.ts` / `src/main/windows/wallpaperWindow.ts` / `src/renderer/canvas/wallpaperFrameStore.ts` / `src/renderer/widgets/FrostedGlassBackground.tsx` / `src/renderer/wallpaper/Wallpaper.tsx`: 每个壁纸窗口独立抽帧并按画布坐标对齐毛玻璃；静态图片不再持续主进程截图；应用壁纸不再触发置顶闪烁；壁纸属性实时调整不再被旧布局回弹。
- `src/shared/widget-display-fit.ts` / `src/main/ipc/widgetIpc.ts` / `src/main/windows/displayLayout.ts`: Dock、新组件和便利贴落在主显示器工作区；拖放按所在显示器约束；切换布局/拔插显示器后移回不可见组件并同步画布；组件配置文件改为相对主显示器坐标。
- `src/renderer/main-ui/`：修复添加壁纸对话框被壁纸网格遮挡、Electron 39 下拖放路径失效、模型配置按钮卡在加载中、壁纸库每次应用都闪烁重载、显示器拓扑比例失真与状态提示、聊天发送按钮被桌宠遮挡、重命名 Esc 仍保存、便笺管理页覆盖桌面编辑、样式串扰与焦点可见性等问题。

**遇到的问题**:
- Electron 在 Windows 上的 `setFocusable()` 会调用 `SetSkipTaskbar(!focusable)` 和 `Deactivate()` → 每次全屏遮挡或便利贴输入都可能把前台交给画布下方的窗口并闪出任务栏按钮；改为仅在状态变化时调用，并先把画布放回桌面层。
- `forward: true` 会把鼠标移动转发给被其他窗口遮住的画布，renderer 据此声称悬停 → 主进程以 `WindowFromPoint` 和 z-order 判断是否真的被遮挡后再决定是否截获。
- 多屏模式下只抽取主屏壁纸帧并拉伸到整个虚拟桌面，偏移还叠加了 `screenX` → 按壁纸窗口分别抽帧并下发各自在画布中的区域。

**验证结果**:
- `npm test` 通过全部 65 项测试（新增 `tests/desktop-layer.test.mjs`）；`npm run build:check` 成功。
- 未在 Windows 实机验证：涉及原生窗口层级的行为需安装后按“开应用/切输入法/多屏拖放”场景复测。

**关联提交**: `f6abab4 fix(desktop): stop widget layer flicker and align multi-monitor glass`

---

## [2026-09-05 22:25] 记录提交与打包的远端交付约定

**变更摘要**: 根据用户明确约定统一“提交/打包”的交付范围，避免本机完成却让其他电脑无法取得版本；本次为未来规则维护，不补发旧安装包。

**涉及模块**:
- AGENTS.md / dev-progress：替代旧的单独推送/发布确认规则，保留本次仅本地限制、分支边界和无关工作保护；增加完整更新资产与远端验证流程。
- dev-lessons.md / project-status.md：记录跨电脑更新缺失的原因及约定入口，不把规则修改写成已发布事实。
- tests/agent-docs.test.mjs：新增交付约定、显式限制与旧冲突文案回归检查；一条较早事件原文移入 2026-08 归档，主页保留 12 条。

**验证结果**:
- npm.cmd test：类型、只读 lint 和全部 105 项测试通过；归档前后旧条目标题与正文逐项一致。
- 未改业务源码或用户数据，未重打包、安装、推送或发布；1.1.12 远端更新资产仍待实际发布。

**经验关联**: L11 验证与交付分层。
**提交意图**: docs(agent): remember commit and package delivery expectations

---

## [2026-09-05 15:31] 精简显示设置并重新打包更新本机 1.1.12

**变更摘要**: 将本轮安全稳定修复升版为 1.1.12；根据安装后反馈删除三行横幅、统一菜单样式，重新打包并覆盖本机；不扩展远端发布。

**涉及模块**:
- App / LibraryPage / WallpaperDisplayControls / styles：显示模式与逐屏目标收进顶部单行导航，本地/在线共用；补充请求中保护和行内失败提示。
- tests/electron：新增生产 preload/界面工具栏验收，临时 profile 在子进程退出后由父进程清理，避免 Chromium 数据库占用。
- package.json / package-lock.json / 发布契约 / 1.1.12 发布说明 / 项目状态：同步版本、最终安装资产与验证边界；构建及备份不进入 Git。

**验证结果**:
- npm.cmd test：类型、只读 lint、104 项测试通过；生产构建及三组隔离 Electron 冒烟通过。工具栏覆盖鼠标/键盘、关闭、逐屏联动、并发保护、错误恢复和三种宽度；离屏菜单截图已核验。
- npm.cmd run build:win -- --publish never 成功；最终安装包 369,431,413 bytes，SHA-256：20797E40846F6CCC20493461A3A09A991B1AB0336223BB1DF9CE9F815734F4A6；latest.yml 大小/SHA-512 一致。
- 重新安装前在线数据库快照和完整 userData 备份完成，2,874 文件逐一校验；安装退出码 0，EXE/asar/注册表为 1.1.12，安装 asar 与新构建完全一致。
- 新基线的用户配置、8 个组件、2 个全局图标组件保留，记忆库完整性通过、14 张表记录数未变；组件覆盖/图标/checkpoint 哈希一致，未用旧快照覆盖真实设置。
- 重启后主界面加载，单屏 2560x1440 DIP / 3840x2160 物理边界原生回退贴合成功；安装态菜单未抢占前台全屏窗口点击验收，混合 DPI 双屏等仍待实测；未 push、tag 或远端发布。

**经验关联**: L11 验证与交付分层。
**提交意图**: fix(ui): streamline wallpaper controls and package 1.1.12

---

## [2026-09-05 13:04] 修复壁纸、组件与多屏管理高优先级问题

**变更摘要**: 先处理数据丢失、安全边界及功能一致性，补足真实 IPC 与隔离生产渲染器回归，不改真实桌面和已安装应用数据。

**涉及模块**:
- 组件持久化 / Dock：读取不回写、兼容旧大记录、命名空间快照/原子保存、切换/退出 flush；移动前保存恢复记录，导入/删除串行，部分恢复失败保留剩余记录。
- 壁纸 / 显示器：有效主屏与组件命名空间统一、设置按 ID 合并并限制待写队列、资源使用/变更互斥、视频共同时钟/单音频来源、工作区缩小只调整显示投影。
- 网页安全 / 导入：HTML 不再复制或授权父目录、ZIP 入口校验、包级独立来源与 CSP/iframe 沙箱、拖入文件改用受支持的 preload 路径 API。
- 天气 / renderer：定时刷新、重试、过期提示与无伪初值；补修迟到主屏快照把已加载图片/网页变透明的问题。

**验证结果**:
- `npm.cmd test` 通过 typecheck、只读 lint 与全部 104 项测试；`npm.cmd run test:electron:smoke` 通过生产构建及两组隐藏 Electron 冒烟。
- 实际 Chromium 验证包内资源可用、父页面/bridge/跨包/越界拒绝；生产 preload/renderer 验证零音量、次屏设置、音频归属、合成视频纠偏及图片/网页迟到消息后的可见性。静态壁纸用例先复现失败再修复，并验证测试失败返回非零退出码。
- 混合 DPI 双屏、全屏/远控、真实 Shell 与公网天气未实机验收；未打包、安装或发布。高频 Canvas 查询、静态 capturePage 和占位组件后续单独处理。

**经验关联**: 修订 L01/L03/L08/L10/L11；新增 L13/L14，明确旧经验替代关系与验证边界。
**提交意图**: `fix(desktop): protect widget data and reconcile wallpaper state`

---

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
