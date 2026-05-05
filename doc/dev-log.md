# 灵月桌面 开发日志

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
