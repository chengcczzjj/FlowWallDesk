# 灵月桌面 项目进展

> 最后更新：2026-05-17
> 版本：0.1.0（早期开发）

## 技术栈

| 层       | 技术                                                             |
| -------- | ---------------------------------------------------------------- |
| 框架     | Electron 33 + electron-vite                                      |
| 前端     | React 19 + TypeScript 5.9                                        |
| 样式     | Tailwind CSS v4 + Shadcn/UI                                      |
| 状态管理 | Zustand 5                                                        |
| 动画     | Framer Motion 12                                                 |
| 存储     | electron-store 8（`%APPDATA%/lingyue-desk/lingyue-config.json`） |
| 壁纸嵌入 | electron-as-wallpaper 1.0.4（仅 Windows）                        |
| AI/Agent | Vercel AI SDK v6 + SQLite/Drizzle + better-sqlite3               |

## 架构概览

```
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│  主界面窗口  │  │  壁纸窗口     │  │  组件画布窗口 │
│  main-ui    │  │  wallpaper   │  │  canvas      │
│  设置/管理   │  │  贴合桌面     │  │  透明层       │
└──────┬──────┘  └──────┬───────┘  └──────┬───────┘
       │                │                  │
       └────────── IPC (preload) ──────────┘
                        │
                ┌───────┴────────┐
                │    主进程 main   │
                │  窗口/托盘/存储  │
                └────────────────┘
```

四窗口设计：主界面（设置）、壁纸窗口（全屏贴合桌面）、组件画布（透明覆盖层）、系统托盘。

## 模块完成度

### 核心系统 ✅ 90%

| 功能             | 状态    | 说明                                                       |
| ---------------- | ------- | ---------------------------------------------------------- |
| 壁纸管理         | ✅ 完成 | 列表/应用/导入/设置/切换                                   |
| 壁纸窗口贴合桌面 | ✅ 完成 | Windows native attach                                      |
| 毛玻璃方案       | ✅ 完成 | 壁纸抽帧广播 + CSS blur，`FrostedGlassBackground` 通用组件 |
| 托盘             | ✅ 完成 | 右键菜单 + 左键显示/隐藏主窗口                             |
| 页面记忆         | ✅ 完成 | localStorage + URL ?restore 参数                           |
| 单实例锁定       | ✅ 完成 |                                                            |
| IPC 通信         | ✅ 完成 | 全通道定义在 `src/shared/ipc-channels.ts`                  |

### 组件系统 ✅ 94%

| 功能         | 状态    | 说明                                             |
| ------------ | ------- | ------------------------------------------------ |
| 组件增删改   | ✅ 完成 | 拖拽 + 网格吸附 + 边界约束 + 重叠避让 + 吸附预览 |
| 单实例约束   | ✅ 完成 | 每类型只允许一个实例                             |
| 配置绑定壁纸 | ✅ 完成 | `widget-config.json` 存壁纸目录下                |
| 切壁纸联动   | ✅ 完成 | 自动加载/清空组件                                |
| 自动保存     | ✅ 完成 | 防抖 500ms + 切壁纸前 cancel                     |
| 编辑模式     | ✅ 完成 | z-order / 穿透 / 焦点切换                        |
| 右键菜单     | ✅ 完成 | 编辑/删除                                        |
| 浮动工具栏   | ✅ 完成 | `FloatingToolbar.tsx`                            |
| 颜色主题系统 | ✅ 完成 | 10 种预设（`shared/constants.tsx`）              |
| 图标收纳/Dock | ✅ 完成 | 桌面图标拖入托管、启动、删除恢复、跨壁纸全局保存 |

### 桌面组件

**悬浮组件（无背景卡片，可自由调大小）：**

| 组件                     | 状态    | 说明                                                |
| ------------------------ | ------- | --------------------------------------------------- |
| Clock 时钟               | ✅ 完成 | 两种样式（minimal/stacked）、10 色主题              |
| ElegantClock 日期时钟    | ✅ 完成 | 星期、时间、日期组合排版，支持颜色主题              |
| PixelClock 像素时钟      | ✅ 完成 | 像素字体，两种样式，支持颜色主题                    |
| GraphicDateTime 图形时间 | ✅ 完成 | 数字背景+浅/深色前景文本，支持颜色主题与明暗切换    |
| Text 桌面文字            | ✅ 完成 | 名言名句 + 自定义文本                               |
| Audio 音频可视化         | ⚠️ 80%  | 频率镜像映射算法完成，缺少实时音频输入对接          |
| Weather 天气             | ⚠️ 70%  | 三种 SVG 样式（realism/glass/neon），缺少天气数据源 |
| WhiteNoise 白噪音        | ✅ 完成 | 11 种环境音、4 级音量、播放控制                     |

**卡片组件（有毛玻璃背景，固定尺寸）：**

| 组件                | 尺寸         | 状态    | 说明                           |
| ------------------- | ------------ | ------- | ------------------------------ |
| Calendar 日历       | small 1×1    | ✅ 完成 | 周/日/月显示                   |
| News 新闻热搜       | medium-v 1×2 | ✅ 完成 | 头条+列表，API 已对接          |
| Stocks 自选股       | large 2×2    | ✅ 完成 | 双列网格最多6只，API 已对接    |
| QuickTools 快捷工具 | medium 2×1   | ⚠️ 20%  | 仅 4 个按钮图标，无功能实现    |
| SysMonitor 系统监控 | medium 2×1   | ⚠️ 20%  | 仅模拟数据，无真实系统信息采集 |
| Pet 桌面萌宠        | small 1×1    | ⚠️ 55%  | 像素宠物模式已接入，支持默认鬣狗/晴蓝、动作库和桌面同步，Q 版宠物待补 |

**图标收纳组件（毛玻璃背景，可自由调大小）：**

| 组件         | 状态    | 说明                                                         |
| ------------ | ------- | ------------------------------------------------------------ |
| 纵向收纳     | ✅ 完成 | 拖入桌面图标后托管展示，双击启动，支持标题/隐藏名称/外观设置 |
| 横向收纳     | ✅ 完成 | 横向滚动布局，支持多实例与同套外观设置                       |
| 自适应收纳   | ✅ 完成 | 根据图标数量自动行列，也支持手动 resize 调整列数              |
| 桌面 Dock    | ✅ 完成 | 悬浮放大、启动弹跳、长按排序、系统按钮、玻璃/梯形样式设置     |

### 数据服务 ✅ 85%

| 服务       | 状态      | 说明                                         |
| ---------- | --------- | -------------------------------------------- |
| 新闻 API   | ✅ 完成   | codelife.cc（头条/百度/知乎/B站）+ weibo.com |
| 股票 API   | ✅ 完成   | 东方财富 push2                               |
| API 注册表 | ✅ 完成   | 供 LLM 了解能力                              |
| 缓存       | ✅ 完成   | 1 分钟缓存 + 错误兜底                        |
| 天气 API   | ❌ 未实现 | Weather 组件需要                             |
| 系统信息   | ❌ 未实现 | SysMonitor 组件需要                          |

### 设置界面 ✅ 85%

| 功能           | 状态    | 说明                             |
| -------------- | ------- | -------------------------------- |
| 壁纸库页面     | ✅ 完成 | LibraryPage                      |
| 组件管理页面   | ✅ 完成 | WidgetsPage（浮动/卡片子标签页） |
| 实时预览数据   | ✅ 完成 | 新闻/股票                        |
| 模态设置弹窗   | ✅ 完成 | WidgetSettingsDialog             |
| 壁纸导入对话框 | ✅ 完成 | AddWallpaperDialog               |
| 图标收纳管理   | ✅ 完成 | WidgetsPage 图标收纳子页，支持预览、数量、多实例和全部删除 |
| 像素宠物分页   | ✅ 完成 | 桌宠 > 像素宠物子页，支持默认角色、动作预览、模型生成入口和同步桌面 |

### AI Chat / 本地工作区 Agent ✅ 88%

| 功能                 | 状态    | 说明                                                         |
| -------------------- | ------- | ------------------------------------------------------------ |
| 模型配置             | ✅ 完成 | 支持 OpenAI 兼容、Google Gemini 与 DeepSeek profile、模型列表和连接测试 |
| 会话与项目工作区     | ✅ 完成 | 本地项目绑定、会话归类、项目侧栏和 Working in 上下文提示      |
| 流式对话             | ✅ 完成 | AI SDK v6 多步工具调用，DeepSeek 工具循环支持 SSE 流式输出，事件持久化到 SQLite |
| Workspace 只读工具   | ✅ 完成 | 列目录、读文件、搜索文本、文件信息，带工作区边界校验         |
| Workspace 写入工具   | ✅ 完成 | 创建/覆盖/补丁/移动/复制/回收区恢复，审批与文件变更记录       |
| 联网搜索工具         | ✅ 完成 | `web_search` 支持 Tavily/Brave/Exa 可配置提供商，无 Key 时 DuckDuckGo HTML + Bing HTML 兜底，工具 UI 一行展示搜索关键词 |
| 位置与天气工具       | ✅ 完成 | `get_user_location` 默认只使用城市级粗略位置；通用设置开启“精准定位授权”时必须实际获取设备坐标成功，开启后位置工具优先请求设备坐标，天气未指定城市时自动按用户位置查询 |
| AgentRun 过程记录    | ✅ 完成 | 计划、工具调用、审批、Checkpoint、Artifact、验证结果可追踪    |
| 工具过程 UI          | ✅ 完成 | 按 `textOffset` 交错展示对话气泡和工具记录，连续重复工具去重，工具记录可展开 |
| 人设化对话体验       | ✅ 完成 | Persona 管理、工具前自然短句、等待状态互斥、常驻画像/当前状态上下文已接入 |
| Checkpoint/回滚      | ⚠️ 75%  | 文件快照、对比、恢复链路已具备，仍需更多 UI 复核入口         |
| 自动化任务           | ⚠️ 60%  | Automation Store/Scheduler 与收件箱 UI 已接入，规则配置待完善 |
| 文档/表格/OCR 工具   | ⚠️ 70%  | DOCX/XLSX/PDF/图片读取与生成工具已接入，复杂预览待增强        |

## 已知问题与经验

| 问题                              | 根因                                        | 解决方案                       |
| --------------------------------- | ------------------------------------------- | ------------------------------ |
| vvhan.com API 失效                | 域名不可用                                  | 替换为 codelife.cc + weibo.com |
| 切壁纸组件不刷新                  | catch 分支未清空 + 未 cancelPendingAutoSave | 补齐清空逻辑                   |
| 6 个 IPC 通道未定义               | 遗漏                                        | 补齐 ipc-channels.ts           |
| Electron acrylic 无法采样嵌入壁纸 | 系统限制                                    | 改用壁纸抽帧广播 + CSS blur    |
| `.lnk/.url` 启动不稳定            | 直接 spawn 快捷方式目标不等同桌面双击行为  | 优先交给 Windows Shell 打开原快捷方式 |
| DeepSeek thinking 模型工具续聊失败 | OpenAI 兼容适配会丢 `reasoning_content`      | 使用 DeepSeek 专用工具循环并回传 reasoning 内容 |
| 工具过程 UI 顺序混乱              | 模型文本和工具事件只按单次切分展示           | 按 `textOffset` 构建对话/工具交错时间线 |

## 待办规划

- [ ] QuickTools 功能实现（便签/截图/设置/重启）
- [ ] Q 版桌宠分页与宠物行为增强
- [ ] Audio 实时音频输入对接
- [ ] Agent 文件变更审查与 checkpoint 恢复 UI 增强
- [ ] 自动化任务规则编辑与运行历史详情
- [ ] 图标收纳单项移回桌面与拖出恢复体验细化
- [ ] 应用打包与分发

## 关键文件速查

| 文件                                              | 作用                         |
| ------------------------------------------------- | ---------------------------- |
| `src/shared/ipc-channels.ts`                      | 全部 IPC 通道定义            |
| `src/shared/types.ts`                             | 全局类型定义                 |
| `src/main/ipc/widgetIpc.ts`                       | 组件尺寸映射 WIDGET_SIZE_MAP |
| `src/renderer/widgets/index.tsx`                  | Widget 注册表（路由/分类）   |
| `src/renderer/widgets/shared/constants.tsx`       | 颜色主题定义                 |
| `src/renderer/widgets/FrostedGlassBackground.tsx` | 毛玻璃通用组件               |
| `src/renderer/widgets/DesktopIcons/DesktopIcons.tsx` | 图标收纳与桌面 Dock 组件     |
| `src/renderer/main-ui/pages/pet/PixelPetPage.tsx`     | 像素宠物管理、动作预览和模型生成入口 |
| `src/renderer/shared/pixel-pet.ts`                     | 像素宠物状态、主题、默认角色与 Canvas 绘制 |
| `src/renderer/shared/PixelPetCanvas.tsx`                | 像素宠物 Canvas 渲染组件      |
| `src/main/ipc/desktopIconIpc.ts`                  | 桌面图标导入、启动、刷新与恢复 IPC |
| `assets/wallpaper/<id>/widget-config.json`        | 壁纸绑定的组件配置           |
| `src/main/memory/`                                 | AI Chat 记忆、AgentRun 与工具系统 |
| `src/main/memory/models/deepseekToolChat.ts`        | DeepSeek 工具调用与流式输出兼容层 |
| `src/main/ipc/chatIpc.ts`                          | AI Chat / Agent IPC 注册     |
| `src/renderer/main-ui/pages/chat/ChatPage.tsx`     | AI Chat 主界面与 Agent 过程 UI |
