# 灵月 LingyueDesk

Windows 桌面 AI 伴侣应用：动态壁纸、桌面组件、AI 对话与像素桌宠。

## 技术栈

Electron + React 19 + TypeScript + Vite (electron-vite) + Tailwind CSS v4 + Zustand + electron-store + electron-builder。

## 开发

```powershell
npm install
npm run dev
```

`npm install` 会顺便执行 `electron-builder install-app-deps` 重建原生模块。

> `electron-as-wallpaper` 是可选依赖，仅 Windows 可用。若安装失败，应用仍可启动，只是壁纸窗口不会嵌入桌面。
> 在 PowerShell 或 Codex 终端中，如果 `npm` 被执行策略拦截，可以改用 `npm.cmd`，例如 `npm.cmd run dev`。

## 验证

```powershell
npm run typecheck      # TypeScript 类型检查
npm run lint:check     # 只检查 ESLint，不自动改文件
npm run test:unit      # Node 单元与契约测试
npm test               # 标准验证：typecheck + lint:check + test:unit
npm run build:check    # electron-vite 生产构建检查
```

`npm test` 还会运行 `tests/` 中的共享契约、发布配置、IPC、安全 preload、Agent 与生成组件回归测试。当前尚未接入完整 E2E 套件。

## Agent / Codex 开发

README 面向开发者快速启动项目；开发智能体先读 [AGENTS.md](AGENTS.md)。当前能力见 [项目状态](TempFile/文档资料/project-status.md)，故障约束见 [开发经验](TempFile/文档资料/dev-lessons.md)，旧方案与月度日志入口见 [知识索引](TempFile/文档资料/knowledge-index.md)。这些是工程记忆，与应用内用户记忆分开维护。

## 构建

```powershell
npm run build:win        # 生成 NSIS 安装包
npm run build:win:signed # 使用已配置证书生成签名安装包
npm run build:dir        # 仅生成未打包目录，便于本地调试
```

`build:win` 默认保留图标和版本资源但不做代码签名，适合本机验证；面向外部分发应配置 Windows 代码签名证书并使用 `build:win:signed`。

## 版本与自动更新

正式版启动 15 秒后自动检查更新，之后每 6 小时检查一次；发现新版本后，左侧活动栏会出现更新按钮。用户点击后开始下载，下载完成后同一按钮会变为“重启并更新”。

发布必须有明确授权，区分本地构建、本机安装和远端发布：

1. 确认本次目标版本，同步 `package.json`、`package-lock.json` 和发布说明/契约，不照抄旧版本号。
2. 运行 `npm test`；按授权执行 `npm run build:win:signed`，未配置证书时仅用 `build:win` 做相应验证。
3. 本地安装不等于远端发布。仅在获准发布后，为相同版本创建标签和 GitHub Release，并上传匹配的 `dist/latest.yml`、安装包和 `.blockmap`，验证大小与哈希。
4. 更新源配置见 [electron-builder.yml](electron-builder.yml)；远端可访问性和客户端更新需要另行实测。Git push 与发布权限见根规则。

## 在线壁纸资源

“壁纸资源 > 壁纸库”通过独立的 `chengcczzjj/LingyueDesk-Wallpapers` 公开仓库读取资源清单，支持按壁纸下载、SHA-256 校验、版本更新、应用和删除，不需要为新增壁纸发布整个应用版本。

正式安装版默认隐藏发布入口。仓库所有者可完全退出应用后，以所有者模式启动：

```powershell
& "$env:LOCALAPPDATA\Programs\LingyueDesk\LingyueDesk.exe" --lingyue-wallpaper-owner
```

进入“壁纸资源 > 壁纸库 > 资源发布管理”，配置属于官方仓库所有者的 GitHub Token 后，即可在 UI 中选择本地壁纸、打包独立 ZIP、上传 GitHub Release 并更新 `manifest.json`。Token 使用 Windows DPAPI 加密且不会暴露给渲染层。详细格式和发布规则见 [壁纸资源托管与下载方案](doc/壁纸资源托管与下载方案.md)。

## 目录结构

```
assets/                 # 内置 / 用户自带的资源（壁纸、图标 …）
  wallpaper/            # 内置壁纸（按文件夹组织，含 FlowWallDeskInfo.json）
doc/                    # 正式项目文档
  小组件/              # 小组件模块通用设计与各组件说明
TempFile/               # 临时资料、草稿、原型和历史参考
  demo/                 # 主界面 UI 设计原型（HTML/CSS/JS）
  文档资料/             # 开发日志、项目状态和草稿文档
resources/build/        # 应用图标、安装包元数据
src/
├── main/               # 主进程
│   ├── index.ts        # 入口：appReady、窗口、托盘、IPC 注册
│   ├── store.ts        # electron-store 持久化封装
│   ├── tray.ts         # 系统托盘
│   ├── windows/        # 三类窗口：主界面 / 逐屏壁纸 / 单组件画布
│   └── ipc/            # 各模块 IPC handlers
├── preload/            # 单文件 role-gated contextBridge：main-ui / wallpaper / canvas
├── renderer/
│   ├── main-ui/        # 主界面（按 TempFile/demo/ 设计原型实现）
│   ├── wallpaper/      # 壁纸窗口渲染（video/image/web）
│   ├── canvas/         # 桌面组件画布（鼠标穿透）
│   ├── widgets/        # 各桌面组件（Clock、Weather、News、DesktopIcons…）
│   └── shared/         # 渲染层共享：样式、工具、UI 组件
└── shared/             # 主/渲染共享：IPC 通道常量、类型
```

## 路径别名

| 别名 | 指向 |
|------|------|
| `@main/*` | `src/main/*` |
| `@preload/*` | `src/preload/*` |
| `@renderer/*` | `src/renderer/*` |
| `@shared/*` | `src/shared/*` |
| `@resources/*` | `resources/*` |

## 架构与维护

详见 [TempFile/文档资料/other/灵月项目开发指南 .md](TempFile/%E6%96%87%E6%A1%A3%E8%B5%84%E6%96%99/other/%E7%81%B5%E6%9C%88%E9%A1%B9%E7%9B%AE%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97%20.md)。
