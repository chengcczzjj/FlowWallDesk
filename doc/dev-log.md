# 灵月桌面 开发日志

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

**Git Commit**: （未提交）
