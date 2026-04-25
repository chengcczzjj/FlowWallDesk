# 灵月桌面 项目进展

> 最后更新：2026-04-25
> 版本：0.1.0（早期开发）

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Electron 33 + electron-vite |
| 前端 | React 19 + TypeScript 5.9 |
| 样式 | Tailwind CSS v4 + Shadcn/UI |
| 状态管理 | Zustand 5 |
| 动画 | Framer Motion 12 |
| 存储 | electron-store 8（`%APPDATA%/lingyue-desk/lingyue-config.json`） |
| 壁纸嵌入 | electron-as-wallpaper 1.0.4（仅 Windows） |

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

| 功能 | 状态 | 说明 |
|------|------|------|
| 壁纸管理 | ✅ 完成 | 列表/应用/导入/设置/切换 |
| 壁纸窗口贴合桌面 | ✅ 完成 | Windows native attach |
| 毛玻璃方案 | ✅ 完成 | 壁纸抽帧广播 + CSS blur，`FrostedGlassBackground` 通用组件 |
| 托盘 | ✅ 完成 | 右键菜单 + 左键显示/隐藏主窗口 |
| 页面记忆 | ✅ 完成 | localStorage + URL ?restore 参数 |
| 单实例锁定 | ✅ 完成 | |
| IPC 通信 | ✅ 完成 | 全通道定义在 `src/shared/ipc-channels.ts` |

### 组件系统 ✅ 85%

| 功能 | 状态 | 说明 |
|------|------|------|
| 组件增删改 | ✅ 完成 | 拖拽 + 网格吸附 + 边界约束 + 重叠避让 |
| 单实例约束 | ✅ 完成 | 每类型只允许一个实例 |
| 配置绑定壁纸 | ✅ 完成 | `widget-config.json` 存壁纸目录下 |
| 切壁纸联动 | ✅ 完成 | 自动加载/清空组件 |
| 自动保存 | ✅ 完成 | 防抖 500ms + 切壁纸前 cancel |
| 编辑模式 | ✅ 完成 | z-order / 穿透 / 焦点切换 |
| 右键菜单 | ✅ 完成 | 编辑/删除 |
| 浮动工具栏 | ✅ 完成 | `FloatingToolbar.tsx` |
| 颜色主题系统 | ✅ 完成 | 10 种预设（`shared/constants.tsx`） |

### 桌面组件

**悬浮组件（无背景卡片，可自由调大小）：**

| 组件 | 状态 | 说明 |
|------|------|------|
| Clock 时钟 | ✅ 完成 | 三种样式（minimal/stacked/elegant）、10 色主题 |
| Text 桌面文字 | ✅ 完成 | 名言名句 + 自定义文本 |
| Audio 音频可视化 | ⚠️ 80% | 频率镜像映射算法完成，缺少实时音频输入对接 |
| Weather 天气 | ⚠️ 70% | 三种 SVG 样式（realism/glass/neon），缺少天气数据源 |
| WhiteNoise 白噪音 | ✅ 完成 | 11 种环境音、4 级音量、播放控制 |

**卡片组件（有毛玻璃背景，固定尺寸）：**

| 组件 | 尺寸 | 状态 | 说明 |
|------|------|------|------|
| Calendar 日历 | small 1×1 | ✅ 完成 | 周/日/月显示 |
| News 新闻热搜 | medium-v 1×2 | ✅ 完成 | 头条+列表，API 已对接 |
| Stocks 自选股 | large 2×2 | ✅ 完成 | 双列网格最多6只，API 已对接 |
| QuickTools 快捷工具 | medium 2×1 | ⚠️ 20% | 仅 4 个按钮图标，无功能实现 |
| SysMonitor 系统监控 | medium 2×1 | ⚠️ 20% | 仅模拟数据，无真实系统信息采集 |
| Pet 桌面萌宠 | small 1×1 | ⚠️ 10% | 仅占位符 |

### 数据服务 ✅ 85%

| 服务 | 状态 | 说明 |
|------|------|------|
| 新闻 API | ✅ 完成 | codelife.cc（头条/百度/知乎/B站）+ weibo.com |
| 股票 API | ✅ 完成 | 东方财富 push2 |
| API 注册表 | ✅ 完成 | 供 LLM 了解能力 |
| 缓存 | ✅ 完成 | 1 分钟缓存 + 错误兜底 |
| 天气 API | ❌ 未实现 | Weather 组件需要 |
| 系统信息 | ❌ 未实现 | SysMonitor 组件需要 |

### 设置界面 ✅ 80%

| 功能 | 状态 | 说明 |
|------|------|------|
| 壁纸库页面 | ✅ 完成 | LibraryPage |
| 组件管理页面 | ✅ 完成 | WidgetsPage（浮动/卡片子标签页） |
| 实时预览数据 | ✅ 完成 | 新闻/股票 |
| 模态设置弹窗 | ✅ 完成 | WidgetSettingsDialog |
| 壁纸导入对话框 | ✅ 完成 | AddWallpaperDialog |

## 已知问题与经验

| 问题 | 根因 | 解决方案 |
|------|------|---------|
| vvhan.com API 失效 | 域名不可用 | 替换为 codelife.cc + weibo.com |
| 切壁纸组件不刷新 | catch 分支未清空 + 未 cancelPendingAutoSave | 补齐清空逻辑 |
| 6 个 IPC 通道未定义 | 遗漏 | 补齐 ipc-channels.ts |
| Electron acrylic 无法采样嵌入壁纸 | 系统限制 | 改用壁纸抽帧广播 + CSS blur |

## 待办规划

- [ ] Weather 天气数据源对接
- [ ] SysMonitor 真实系统信息采集
- [ ] QuickTools 功能实现（便签/截图/设置/重启）
- [ ] Pet 桌面萌宠核心功能
- [ ] Audio 实时音频输入对接
- [ ] 图标收纳组件（方案已设计，见 `doc/图标收纳组件方案.md`）
- [ ] 应用打包与分发

## 关键文件速查

| 文件 | 作用 |
|------|------|
| `src/shared/ipc-channels.ts` | 全部 IPC 通道定义 |
| `src/shared/types.ts` | 全局类型定义 |
| `src/main/ipc/widgetIpc.ts` | 组件尺寸映射 WIDGET_SIZE_MAP |
| `src/renderer/widgets/index.tsx` | Widget 注册表（路由/分类） |
| `src/renderer/widgets/shared/constants.tsx` | 颜色主题定义 |
| `src/renderer/widgets/FrostedGlassBackground.tsx` | 毛玻璃通用组件 |
| `assets/wallpaper/<id>/widget-config.json` | 壁纸绑定的组件配置 |
