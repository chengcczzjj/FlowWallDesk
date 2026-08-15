# 灵月桌面 Agent 开发指引

本文件是 Codex、VSCode/Copilot Agent 以及其他代码智能体进入本仓库时的统一入口。README 面向开发者快速了解和启动项目；AGENTS.md 面向智能体，说明上下文、验证命令、Git 边界和日志规则。

## 项目背景

灵月桌面（LingyueDesk）是一个 Windows 桌面 AI 伴侣应用，技术栈为 Electron 33、React 19、TypeScript、electron-vite、Tailwind CSS v4、Zustand、electron-store 和 electron-builder。

开始非简单任务前：
- 先读 `TempFile/文档资料/project-status.md`，了解当前模块状态、完成度和已知缺口。
- 如果任务和近期工作有关，读 `TempFile/文档资料/dev-log.md` 最近 3-5 条记录。
- 涉及架构、窗口流程或模块边界时，读 `TempFile/文档资料/other/灵月项目开发指南 .md`。
- 涉及共享数据结构时，读 `src/shared/types.ts`。
- 涉及 IPC 时，读 `src/shared/ipc-channels.ts` 以及对应的 preload/main IPC 文件。
- 修改 `TempFile/demo/` 目录前，先读 `TempFile/demo/DEV_GUIDE.md`。

## 常用命令

项目使用 npm。在 Windows PowerShell 或 Codex 终端里，如果 `npm` 被执行策略拦截，优先使用 `npm.cmd ...`。

- 安装依赖：`npm.cmd install`
- 启动开发应用：`npm.cmd run dev`
- 类型检查：`npm.cmd run typecheck`
- 只检查 lint，不自动改文件：`npm.cmd run lint:check`
- 自动修复 lint：`npm.cmd run lint`
- 标准验证：`npm.cmd test`
- 生产构建检查：`npm.cmd run build:check`
- Windows 安装包构建：`npm.cmd run build:win`
- 未打包目录构建：`npm.cmd run build:dir`

当前还没有独立的单元测试或 E2E 测试套件。在补充专门测试前，`npm.cmd test` 是基础质量门，内容是 typecheck 加只读 lint。

## 开发规则

- 保护用户已有工作。改动既有文件前，先查看 `git status --short`。
- 不要回滚、覆盖或顺手整理与当前任务无关的未提交改动。
- 改动范围要贴近用户请求和项目现有模式。
- 只有在确实减少复杂度、避免重复或符合已有模式时，才新增抽象。
- UI 改动要贴合当前设计系统；条件允许时用应用启动或构建命令验证。
- `out/`、`dist/`、`tsconfig.*.tsbuildinfo` 等构建或缓存产物不应进入正常提交。

## Git 与日志

当用户要求“记录进度”“总结开发”“提交”“commit”“记录并提交”或“更新日志”时，使用 `.github/skills/dev-progress/SKILL.md` 中的流程。

默认 Git 行为：
- 暂存前先查看 `git status --short` 和 `git diff --stat`。
- 默认只暂存当前任务相关文件；除非用户明确要求，不使用全量暂存。
- 完成并验证一个开发任务后，默认直接提交该任务相关改动，不再等待额外的提交指令。
- 提交前展示 staged 文件列表和 commit message。
- `git push` 必须由用户明确要求或单独确认。
- 打包、打标签、上传发布资产和创建 GitHub Release 仅在用户明确要求发布时执行。
- commit message 优先使用 `<type>(<scope>): <summary>` 格式。

日志规则：
- `TempFile/文档资料/dev-log.md` 记录有价值的开发事件、决策、涉及模块和有参考意义的问题。
- `TempFile/文档资料/project-status.md` 记录稳定的项目状态和模块完成度，不写流水账。
- 小修、小实验和临时改动默认不写日志，除非用户明确要求。

## 架构速查

- 主进程代码：`src/main/`
- preload bridge：`src/preload/`
- 渲染入口：`src/renderer/main-ui/`、`src/renderer/wallpaper/`、`src/renderer/canvas/`
- 桌面组件：`src/renderer/widgets/`
- 共享 IPC 常量和类型：`src/shared/`
- 内置壁纸资源：`assets/wallpaper/<id>/`，组件配置与对应壁纸放在同一目录。
