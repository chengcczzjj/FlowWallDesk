# 可复用开发经验

> 整理日期：2026-09-05。来源为现有代码、测试与 [开发日志及月度归档](dev-log.md)。本页是按需检索的工程知识，不替代 [AGENTS.md](../../AGENTS.md) 或用户本次要求；不包含应用用户的长期记忆。
> “代码/测试入口”表示可复核证据，不承诺完整测试覆盖；仅有源码契约的部分仍需实机验证。新增经验沿用编号；失效时修订原条并说明替代关系。

## L01 运行时持久化：默认资源与用户覆盖分离

- 适用：壁纸导入、配置保存、AI 组件调整、打包后自修复。
- 根因：安装目录/asar 不应写入；直接改内置默认值会受权限、更新覆盖影响。切换壁纸时旧防抖保存还可能写错命名空间。
- 当前约束：路径经 userData helper 生成，先读用户覆盖再读默认；切壁纸前取消待保存任务，加载失败也应清空旧组件，不能留下前一壁纸状态。
- 代码：[userDataPaths.ts](../../src/main/runtime/userDataPaths.ts)、[widgetIpc.ts](../../src/main/ipc/widgetIpc.ts)、[wallpaperIpc.ts](../../src/main/ipc/wallpaperIpc.ts)。
- 验证：至少检查切换壁纸、覆盖缺失/损坏、重启后的状态；开发态可写目录不代替安装态验证。
- 来源：2026-05-26 运行时可变层；早期切壁纸自动保存问题。

## L02 sandbox preload：单入口不是可随意拆分的打包细节

- 适用：preload、构建入口、新窗口或 bridge 变更。
- 根因：多 preload 入口被 Rollup 拆成本地共享 chunk，sandbox 中加载失败会造成主界面白屏。
- 当前约束：保留一个 preload 打包入口，按 `--lingyue-window-role` 暴露对应 API；修白屏不能靠关闭 sandbox 或把全部角色 API 暴露给每个窗口。
- 代码：[electron.vite.config.ts](../../electron.vite.config.ts)、[preload/index.ts](../../src/preload/index.ts)。测试：[release-contracts.test.mjs](../../tests/release-contracts.test.mjs)。
- 验证：类型与契约之外检查生产构建；若用户授权打包，检查产物中的 preload 引用及三类窗口启动。
- 来源：2026-08-01 首个正式版本白屏修复。

## L03 多屏：完整核对模式、稳定归属与坐标空间

- 适用：壁纸跨屏错位、组件切模式跳动、混合 DPI、负坐标和热插拔。
- 根因：`SetParent` 不负责显示器位置；DIP/物理像素/父窗口坐标混用会产生半屏错位。`GetMonitorInfoW` 的 `cbSize` 若被纯 `out` 参数清零，稳定键查询会静默失效。
- 当前约束：保持持久化的四种显示模式；每个目标屏幕建本地壁纸窗口，延展只共享虚拟构图并逐屏裁切。原生参数使用 `inout` 保留输入，调整 `WS_CHILD/WS_POPUP`、`ScreenToClient` 后以 `GetWindowRect` 校验实际边界。
- 组件保存设备键与显示器本地坐标，旧虚拟 Canvas 坐标只做一次迁移。Win32 设备键并非任意硬件变化下的永久硬件身份；匹配失败/降级必须结合诊断确认。
- 代码：[nativeDisplayIdentity.ts](../../src/main/windows/nativeDisplayIdentity.ts)、[attachWallpaperNative.ts](../../src/main/windows/attachWallpaperNative.ts)、[widget-display-layout.ts](../../src/shared/widget-display-layout.ts)。测试：[wallpaper-display.test.mjs](../../tests/wallpaper-display.test.mjs)、[widget-display-layout.test.mjs](../../tests/widget-display-layout.test.mjs)。
- 验证：检查 `display-diagnostics.jsonl` 的拓扑、expected/actual 边界、归属与重试；单屏/纯函数测试不证明混合 DPI 双屏通过。
- 替代关系：2026-08-27 固定按屏模式被 08-30 恢复四模式替代；08-24 的单跨屏延展窗口被 09-04 逐屏裁切替代。

## L04 原生点击补偿：先确认前台归属，不只看坐标

- 适用：Dock/图标收纳点击失效、前台窗口遮挡、远控输入。
- 根因：renderer 没收到 `pointerdown` 不一定是丢事件，也可能是用户正在点击覆盖它的其他窗口；仅按坐标补偿会误启动桌面应用。
- 当前约束：原生命中与 IPC 双端校验真实 Canvas 归属，无法确认时拒绝；只补偿 renderer 未确认的短距离真实点击。启动目标从持久化组件记录解析，不能信任 renderer 任意传入的路径。
- 代码：[canvas-hit-test.ts](../../src/shared/canvas-hit-test.ts)、[canvasWindow.ts](../../src/main/windows/canvasWindow.ts)、[desktopIconIpc.ts](../../src/main/ipc/desktopIconIpc.ts)。测试：[shared-contracts.test.mjs](../../tests/shared-contracts.test.mjs)、[release-contracts.test.mjs](../../tests/release-contracts.test.mjs)。
- 验证：前台普通窗口盖住图标时不能闪动/启动；无 renderer 回执时只补偿一次；日志与实际输入共同判定。
- 来源：2026-08-05 的点击兜底在 08-08 因前台误触被收紧，不能恢复最早的坐标级无条件补偿。

## L05 Canvas 恢复：遮挡、手势、焦点和输入表面分别处理

- 适用：退出全屏、长时间锁屏后便笺不可编辑、ToDesk 前台闪烁。
- 根因：DOM 命中正常不代表 Windows 已投递按下事件；反复 z-order 重组合、pointer capture 和穿透状态竞争也会截断输入。
- 当前约束：穿透由画布级指针门控制，手势完成前保持锁定；稳定遮挡转换后才恢复。已知长启动遮挡或真实点击无回执按条件重建 Canvas，保留组件数据；不要用每次 hover 抬升窗口代替修复。
- “未遮挡”不是“可以置顶”。仅 Windows Shell / 无前台窗口等已确认场景允许桌面返回层级恢复；普通应用、远控前台跳过。
- 代码：[canvas-pointer-gate.ts](../../src/shared/canvas-pointer-gate.ts)、[canvas-hit-test.ts](../../src/shared/canvas-hit-test.ts)、[canvasWindow.ts](../../src/main/windows/canvasWindow.ts)。测试：[shared-contracts.test.mjs](../../tests/shared-contracts.test.mjs)。
- 验证：对照原生按键、renderer pointerdown/up、焦点与恢复事件；开发进程和安装进程的日志不可混用。
- 来源：2026-08-01/03 手势与恢复修复、08-29 锁屏重建、08-30 ToDesk 门禁；后两者收紧早期无条件置顶经验。

## L06 组件不是同一种布局：便利贴自由布局与显式层级

- 适用：拖动、碰撞、缩放、置顶、任务完成/恢复。
- 根因：普通组件的网格/单实例规则不适合“一张任务一张纸”；完成即删除丢失统计和恢复依据。仅用数组顺序表示层级会在异步保存中覆盖新操作。
- 当前约束：便利贴允许重叠、多实例、直接拖动；显式拖动把手优先于通用按钮门禁。完成动画后保留隐藏实例作为历史；采用持久化 `stackOrder`，位置/配置写入不能覆盖更晚的置顶操作。
- 代码：[widget-order.ts](../../src/shared/widget-order.ts)、[TodoBoard.tsx](../../src/renderer/widgets/TodoBoard/TodoBoard.tsx)、[widgetIpc.ts](../../src/main/ipc/widgetIpc.ts)。测试：[todo-widget.test.mjs](../../tests/todo-widget.test.mjs)、[shared-contracts.test.mjs](../../tests/shared-contracts.test.mjs)。
- 验证：窄/矮便笺、文字输入临时焦点、折角缩放、重叠命中、完成历史与恢复。浮动组件尺寸在字体就绪后实测，不只按缩放系数推算。
- 来源：2026-04-26 视觉尺寸、08-16 便利贴重做、08-30 显式层级。

## L07 毛玻璃优化：不以降画质掩盖管线开销

- 适用：壁纸抽帧、模糊、常驻 CPU 和 React 重渲染。
- 根因：透明窗口 `backdrop-filter` 不能代替另一个壁纸窗口的像素采样；将每帧图像作为 React 状态广播会扩大渲染开销。复用 Canvas 时不清理会残留透明边缘。
- 当前约束：逐显示器传输帧和边界，失活 watchdog 与主进程 capture 兜底保留；复用离屏 Canvas 前清理，帧更新避免带动无关组件提交。
- 代码：[wallpaperFrameStore.ts](../../src/renderer/canvas/wallpaperFrameStore.ts)、[FrostedGlassBackground.tsx](../../src/renderer/widgets/FrostedGlassBackground.tsx)、[Wallpaper.tsx](../../src/renderer/wallpaper/Wallpaper.tsx)。测试：[release-contracts.test.mjs](../../tests/release-contracts.test.mjs)、[wallpaper-display.test.mjs](../../tests/wallpaper-display.test.mjs)。
- 验证：用户要求视觉不变时保留分辨率、频率、质量、模糊和裁切，做等价图像对比；轮询优化同时检查手势期响应。只报告实际测得的性能，不沿用旧数字。
- 来源：2026-08-01 跨窗口采样、08-16 帧管线等价验证、08-30 自适应轮询、09-04 逐屏帧。

## L08 桌面图标：文件安全、Shell 语义与动画连续性

- 适用：导入/恢复快捷方式、单实例应用唤醒、Dock 点击反馈。
- 根因：Shell 虚拟项没有真实路径；copy/delete 兜底可能丢源文件。直接启动快捷方式 target 不等于双击原快捷方式；启动器或 1px 内部窗不等于应用主窗口。
- 当前约束：跳过无路径虚拟项，导入用安全 rename，记录失败尝试回滚；优先 Windows Shell 打开原快捷方式。窗口唤醒验证可见性、尺寸和应用家族，不仅匹配进程名。
- 动画层分离但悬停缩放保持连续，扩散副本从点击瞬间的实际尺寸开始；“回到桌面”不播放启动动画。
- 代码：[desktopIconIpc.ts](../../src/main/ipc/desktopIconIpc.ts)、[foregroundAppWindow.ts](../../src/main/windows/foregroundAppWindow.ts)、[DesktopIcons.tsx](../../src/renderer/widgets/DesktopIcons/DesktopIcons.tsx)。测试：[shared-contracts.test.mjs](../../tests/shared-contracts.test.mjs)、[release-contracts.test.mjs](../../tests/release-contracts.test.mjs)。
- 验证：同名目标冲突、导入失败回滚、Shell 虚拟项、已运行应用唤醒；文件操作还需真实环境验证。
- 替代关系：2026-05-05/06 的安全导入经验仍有效；08-16 18:23 的点击归一基础倍率被 18:37 连续缩放修复替代，更早的等待弹跳不再是当前方案。

## L09 AI 过程与记忆：真实结果、权限和产品定位分开

- 适用：上下文、人设、工具过程、长期记忆、审批和任务终态。
- 根因：文本与工具事件粗略合并会乱序/丢记录；兼容适配会丢 DeepSeek thinking 续聊所需字段；旧失败兜底可能覆盖已交付结果。
- 当前约束：文本与工具按 `textOffset` 还原时间线；DeepSeek 专用链路保留 `reasoning_content`。等待审批、取消、失败不能归一为完成，工具结果成功也不等于产物已经验收。
- 上下文有预算，普通召回遵守 scene/scope/sensitivity 过滤；应用用户记忆与工程日志不互相灌入。不能因为“轻量体验、减少确认”就删除文件/命令的权限、审批或 checkpoint 校验。
- 代码：[contextPacker.ts](../../src/main/memory/routing/contextPacker.ts)、[retrievalRouter.ts](../../src/main/memory/routing/retrievalRouter.ts)、[privacyGate.ts](../../src/main/memory/security/privacyGate.ts)、[deepseekToolChat.ts](../../src/main/memory/models/deepseekToolChat.ts)、[chatService.ts](../../src/main/memory/chat/chatService.ts)。测试：[shared-contracts.test.mjs](../../tests/shared-contracts.test.mjs) 覆盖审批作用域、终态及模型别名等契约，并非完整记忆/流式对话 E2E。
- 验证：失败后成功交付、审批等待/取消、空召回、跨项目/私密场景隔离与长会话预算；不要把提示词声明当成后端强制保证。
- 来源：2026-05-04/15 Agent 过程、05-25/26 伴侣优先方向及 08-01 架构升级。

## L10 下载与发布：UI 门禁不是授权，ZIP 不是可信目录

- 适用：在线壁纸、解压、所有者发布、更新错误展示。
- 根因：远程 ZIP 可能损坏、越界或被替换；隐藏发布按钮不能限制后端写权限；原始更新错误可能包含响应头/Cookie。
- 当前约束：检查 HTTPS、声明大小、SHA-256、路径及符号链接；临时 staging 校验后原子替换，失败回滚旧版本。所有者入口同时校验身份与仓库写权限，凭据不传渲染层。
- 代码：[wallpaper-resource-service.ts](../../src/main/services/wallpaper-resource-service.ts)、[safe-zip.ts](../../src/main/services/safe-zip.ts)、[wallpaper-owner-service.ts](../../src/main/services/wallpaper-owner-service.ts)、[update-service.ts](../../src/main/services/update-service.ts)。测试：[wallpaper-resource.test.mjs](../../tests/wallpaper-resource.test.mjs)、[release-contracts.test.mjs](../../tests/release-contracts.test.mjs)。
- 验证：损坏包、路径越界、符号链接、旧版本保留与脱敏错误；工程记录只留脱敏结论，不粘贴凭据/原始网络响应。
- 来源：2026-08-01 更新错误、08-18 独立资源库安全安装与所有者发布。

## L11 验证与交付：代码、构建、本机安装、远端发布四种事实

- 适用：收尾、版本状态、Windows 原生问题和发布说明。
- 根因：源码契约能通过但原生 ABI 调用失败；代码版本不等于实际运行版本，本机包不等于 GitHub Release，单屏不等于多屏验收。
- 当前约束：分别记录测试、构建、安装/进程版本、远端资产验证；缺哪个就明确写未做。先读已脱敏的持久日志缩小问题，不把“UI 能保存设置”当完整链路证据。
- 代码：[diagnosticLog.ts](../../src/main/runtime/diagnosticLog.ts)、[electron-builder.yml](../../electron-builder.yml)。测试：[release-contracts.test.mjs](../../tests/release-contracts.test.mjs)；它只约束配置和源码，不能证明安装/发布成功。
- 验证：运行时主要诊断文件为 `dock-diagnostics.jsonl`、`display-diagnostics.jsonl`、`update-diagnostics.jsonl`（userData/logs）；核对 pid、时间、版本及真实场景。网络/设备无法验证时不推测通过。
- 来源：2026-08-29 安装版不一致、09-04 Koffi 原生实测与 1.1.11 仅本地安装。旧记录中的发布操作不构成新任务发布授权。

## L12 工程记忆：去重复内容，不抹掉纠错过程

- 适用：Agent 规则、交接、日志整理与自动提交。
- 根因：多入口复制命令与 Git 策略会漂移；提交后回填日志制造新的脏工作树；主观完成率与旧设计快照容易冒充当前事实。
- 当前做法：根规则单点维护、适配仅引用；状态/事件/经验分层，旧方案在知识索引标有效性。日志先写“提交意图”再一起提交，实际提交哈希在最终回复只读核验。
- 检查：[agent-docs.test.mjs](../../tests/agent-docs.test.mjs) 检查导航链接、已声明脚本和事件重复等机械约束；提交权限、历史方案有效性仍需语义复核。
- 来源：2026-09-05 工程知识审计；后续修改规则按同一入口同步，避免再次分叉。
