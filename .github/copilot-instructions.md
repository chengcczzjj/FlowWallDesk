# Copilot Agent Instructions — 灵月桌面

## 项目简介

灵月桌面（LingyueDesk）是一个 Electron 33 + React 19 + TypeScript 的 Windows 桌面应用，功能包括动态壁纸、桌面组件和桌宠。

## 新会话必读

每次开启新会话时，先阅读以下文件以了解项目当前状态：

| 文件 | 内容 | 何时读 |
|------|------|--------|
| `doc/project-status.md` | 项目整体进展、模块完成度、架构概览、待办规划 | **必读** — 了解项目全貌 |
| `doc/dev-log.md` | 开发日志（时间倒序），每次变更的详细记录 | 按需读最近 3-5 条，了解近期工作 |
| `doc/灵月项目开发指南 .md` | 窗口架构设计、开发顺序、文件结构约定 | 涉及架构问题时读 |
| `src/shared/types.ts` | 全局类型定义 | 涉及数据结构时读 |
| `src/shared/ipc-channels.ts` | IPC 通道定义 | 涉及进程通信时读 |

## 开发约定

- **包管理器**: npm
- **启动命令**: `npm run dev`
- **构建命令**: `npm run build:win`
- **代码风格**: ESLint + Prettier（`npm run lint` / `npm run format`）
- **类型检查**: `npm run typecheck`
- **组件尺寸**: 定义在 `src/main/ipc/widgetIpc.ts` 的 `WIDGET_SIZE_MAP`
- **壁纸资源**: `assets/wallpaper/<id>/`，每个壁纸有 `FlowWallDeskInfo.json` 元数据
- **组件配置**: 跟壁纸绑定，存在 `assets/wallpaper/<id>/widget-config.json`

## 进度管理 Skill

项目配备了 `dev-progress` skill（`.github/skills/dev-progress/SKILL.md`），负责：
- 记录开发日志到 `doc/dev-log.md`
- 管理 git 提交（生成 commit message、执行提交）
- 更新项目进展到 `doc/project-status.md`

当用户说"记录进度"、"提交"、"记录并提交"时，按该 skill 的流程操作。

## Git 信息

- **用户**: chengcczzjj
- **邮箱**: chengcczzjj@users.noreply.github.com
- **Commit 规范**: `<type>(<scope>): <描述>`，详见 dev-progress skill
