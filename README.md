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
npm test               # 标准验证：typecheck + lint:check
npm run build:check    # electron-vite 生产构建检查
```

`npm test` 还会运行 `tests/` 中的共享契约、发布配置、IPC、安全 preload、Agent 与生成组件回归测试。当前尚未接入完整 E2E 套件。

## Agent / Codex 开发

README 面向开发者快速启动项目；Codex、VSCode/Copilot Agent 等智能体请先阅读 [AGENTS.md](AGENTS.md)，再按任务需要读取 `TempFile/文档资料/project-status.md`、`TempFile/文档资料/dev-log.md` 和相关设计文档。

## 构建

```powershell
npm run build:win        # 生成 NSIS 安装包
npm run build:win:signed # 使用已配置证书生成签名安装包
npm run build:dir        # 仅生成未打包目录，便于本地调试
```

`build:win` 默认保留图标和版本资源但不做代码签名，适合本机验证；面向外部分发应配置 Windows 代码签名证书并使用 `build:win:signed`。

## 版本与自动更新

正式版启动 15 秒后自动检查更新，之后每 6 小时检查一次；发现新版本会后台下载，用户退出应用时自动安装，也可以在“设置 → 通用 → 版本与更新”中立即重启安装。

发布新版本时按以下顺序执行：

```powershell
npm version 1.0.2 --no-git-tag-version
npm test
npm run build:win:signed  # 未配置证书时先用 build:win 做内部验证
git tag -a v1.0.2 -m "LingyueDesk 1.0.2"
```

随后创建同版本 GitHub Release，并上传 `dist/latest.yml`、安装包和对应 `.blockmap`。`chengcczzjj/FlowWallDesk` 已设为公开仓库，客户端可直接发现公开 Release；如果后续改回私有仓库，需要同步切换到公共对象存储更新源。

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
│   ├── windows/        # 三个窗口：主界面 / 壁纸 / 组件画布
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

## 开发顺序

详见 [TempFile/文档资料/other/灵月项目开发指南 .md](TempFile/%E6%96%87%E6%A1%A3%E8%B5%84%E6%96%99/other/%E7%81%B5%E6%9C%88%E9%A1%B9%E7%9B%AE%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97%20.md)。
