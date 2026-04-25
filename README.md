# 灵月 LingyueDesk

Windows 桌面 AI 伴侣应用：动态壁纸、桌面组件、桌宠（规划中）。

## 技术栈

Electron + React 19 + TypeScript + Vite (electron-vite) + Tailwind CSS v4 + Zustand + electron-store + electron-builder。

## 开发

```powershell
npm install
npm run dev
```

`npm install` 会顺便执行 `electron-builder install-app-deps` 重建原生模块。

> `electron-as-wallpaper` 是可选依赖，仅 Windows 可用。若安装失败，应用仍可启动，只是壁纸窗口不会嵌入桌面。

## 构建

```powershell
npm run build:win        # 生成 NSIS 安装包
npm run build:dir        # 仅生成未打包目录，便于本地调试
```

## 目录结构

```
assets/                 # 内置 / 用户自带的资源（壁纸、图标 …）
  wallpaper/            # 内置壁纸（按文件夹组织，含 FlowWallDeskInfo.json）
demo/                   # 主界面 UI 设计原型（HTML/CSS/JS）
doc/                    # 项目文档
resources/build/        # 应用图标、安装包元数据
src/
├── main/               # 主进程
│   ├── index.ts        # 入口：appReady、窗口、托盘、IPC 注册
│   ├── store.ts        # electron-store 持久化封装
│   ├── tray.ts         # 系统托盘
│   ├── windows/        # 三个窗口：主界面 / 壁纸 / 组件画布
│   └── ipc/            # 各模块 IPC handlers
├── preload/            # contextBridge：main-ui / wallpaper / canvas 各一份
├── renderer/
│   ├── main-ui/        # 主界面（按 demo/ 设计实现）
│   ├── wallpaper/      # 壁纸窗口渲染（video/image/web）
│   ├── canvas/         # 桌面组件画布（鼠标穿透）
│   ├── widgets/        # 各桌面组件（Clock、TodoList…）
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

详见 [doc/灵月项目开发指南 .md](doc/%E7%81%B5%E6%9C%88%E9%A1%B9%E7%9B%AE%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97%20.md)。
