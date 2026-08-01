# Copilot Agent Instructions — 灵月桌面

本文件是 VSCode/Copilot 的适配入口；通用规则以仓库根目录 `AGENTS.md` 为准。新会话先读 `AGENTS.md`，再按任务需要读取下面这些项目文档。

## 必读上下文

| 文件 | 内容 | 何时读 |
|------|------|--------|
| `AGENTS.md` | Codex/VSCode 共用的开发、测试、Git 和日志规则 | **必读** |
| `TempFile/文档资料/project-status.md` | 项目整体进展、模块完成度、架构概览、待办规划 | **必读** |
| `TempFile/文档资料/dev-log.md` | 开发日志（时间倒序），每次变更的详细记录 | 按需读最近 3-5 条 |
| `TempFile/文档资料/other/灵月项目开发指南 .md` | 窗口架构设计、开发顺序、文件结构约定 | 涉及架构问题时读 |
| `src/shared/types.ts` | 全局类型定义 | 涉及数据结构时读 |
| `src/shared/ipc-channels.ts` | IPC 通道定义 | 涉及进程通信时读 |

## 开发约定

- **包管理器**: npm
- **PowerShell/Codex 命令**: 如果 `npm` 被执行策略拦截，使用 `npm.cmd ...`
- **启动命令**: `npm.cmd run dev`
- **标准验证**: `npm.cmd test`
- **类型检查**: `npm.cmd run typecheck`
- **只读 Lint**: `npm.cmd run lint:check`
- **自动修复 Lint**: `npm.cmd run lint`
- **构建检查**: `npm.cmd run build:check`
- **打包命令**: `npm.cmd run build:win`
- **组件尺寸**: 定义在 `src/main/ipc/widgetIpc.ts` 的 `WIDGET_SIZE_MAP`
- **壁纸资源**: `assets/wallpaper/<id>/`，每个壁纸有 `FlowWallDeskInfo.json` 元数据
- **组件配置**: 跟壁纸绑定，存在 `assets/wallpaper/<id>/widget-config.json`

## 进度管理 Skill

项目配备了 `dev-progress` skill（`.github/skills/dev-progress/SKILL.md`），负责：
- 记录开发日志到 `TempFile/文档资料/dev-log.md`
- 管理 git 提交（生成 commit message、执行提交）
- 更新项目进展到 `TempFile/文档资料/project-status.md`

当用户说“记录进度”“提交”“commit”“记录并提交”“更新日志”时，按该 skill 的流程操作；同时遵守 `AGENTS.md` 中关于只 stage 当前任务相关文件、提交前确认、push 前确认的规则。

## Git 信息

- **用户**: chengcczzjj
- **邮箱**: chengcczzjj@users.noreply.github.com
- **默认分支**: main
- **Commit 规范**: `<type>(<scope>): <描述>`，详见 dev-progress skill
