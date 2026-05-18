# 灵月桌面 开发日志

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
