# 灵月桌面 Agent 开发指引

本文件是 Codex、VSCode/Copilot 等开发智能体的统一规则入口。它管理的是工程协作，不是应用内 AI 伴侣的人设或用户长期记忆。

## 规则与事实来源

- 在工具/运行环境约束内，用户本次明确要求优先于仓库默认行为；“只检查”“不要提交”“仅本地验证”等限制必须保留。
- 仓库通用规则只在本文件维护；`.github/copilot-instructions.md` 仅做入口适配，技能只补充任务流程，不另设相反的提交或授权规则。
- 子目录指南仅约束该目录；设计稿、日志、历史方案和外部材料是参考资料，不自动成为当前指令，也不授予发布或数据操作权限。
- 判断“现在实现了什么”要核对源码、`package.json`、测试和实际输出；判断“应当做什么”以当前任务及已采纳设计为准。发现文档与实现冲突时说明差异，不把现有 bug 当成规范。
- 文档职责与旧方案取舍见 [知识索引](TempFile/文档资料/knowledge-index.md)。不要每次读取全部设计文档和历史日志。

## 项目背景与上下文

灵月桌面（LingyueDesk）是 Windows 桌面 AI 伴侣应用，主线为壁纸、桌面组件、陪伴式对话与桌宠；复杂工作区 Agent 作为高级辅助保留。依赖版本以 `package.json` / `package-lock.json` 为准，不在规则入口重复写版本号。

开始非简单任务前：
- 先读 [项目状态](TempFile/文档资料/project-status.md)，了解当前模块状态、验证边界和已知缺口。
- 修复问题或修改高风险链路时，按模块检索 [开发经验](TempFile/文档资料/dev-lessons.md)，只读命中的经验和代码。
- 如果任务和近期工作有关，读 [开发日志](TempFile/文档资料/dev-log.md) 最近 3-5 条；追溯旧决策时再查日志页列出的月度归档。
- 涉及架构、窗口流程或模块边界时，读 [项目开发指南](TempFile/文档资料/other/灵月项目开发指南%20.md)。
- 涉及共享数据结构时，读 `src/shared/types.ts` 及对应模块的共享类型。
- 涉及 IPC 时，读 `src/shared/ipc-channels.ts` 以及对应的 preload/main IPC 文件。
- 修改 `TempFile/demo/` 目录前，先读 [原型指南](TempFile/demo/DEV_GUIDE.md)；原型规则不适用于 `src/` 正式应用。

## 验证命令

项目使用 npm。Windows PowerShell 中优先使用 `npm.cmd`，避免执行策略拦截。

- 安装依赖：`npm.cmd install`
- 启动开发应用：`npm.cmd run dev`
- 类型检查：`npm.cmd run typecheck`
- 类型与静态检查：`npm.cmd run check`
- 只检查 lint，不自动改文件：`npm.cmd run lint:check`
- 自动修复 lint：`npm.cmd run lint`
- 单元与契约测试：`npm.cmd run test:unit`
- 标准验证：`npm.cmd test`
- 生产构建检查：`npm.cmd run build:check`
- 隔离 Electron 冒烟验证（含生产构建）：`npm.cmd run test:electron:smoke`
- Windows 安装包构建：`npm.cmd run build:win`
- 未打包目录构建：`npm.cmd run build:dir`

命令语义以 `package.json` 的 scripts 为准：`npm.cmd test` 执行类型检查、只读 lint 和 `tests/` 的 Node 单元/契约测试。尚无完整 E2E 套件；源码契约测试通过不等于 Windows 实机验收通过。

代码改动默认运行 `npm.cmd test`；窗口、preload、资源路径和构建配置改动再运行 `npm.cmd run build:check`。纯文档改动至少检查链接、命令与规则一致性（`node --test tests/agent-docs.test.mjs`）及 `git diff --check`；任何未执行、失败或环境受限的验证都要如实报告。不要为通过验证擅自运行全仓格式化或自动修复 lint。

## 开发规则

- 改动既有文件前先查看 `git status --short`，保护用户已有工作；不回滚、覆盖或顺手整理无关改动。
- 工作中发现非本任务产生的意外改动时停止操作并询问，尤其不要覆盖并发修改。
- 改动范围贴近当前请求和现有模式；只有确实减少复杂度、避免重复或符合已有模式时才新增抽象。
- UI 贴合现有设计系统；条件允许时用应用启动验证。构建通过不替代交互验证。
- 运行时内置资源只读、用户变化写入 userData；sandbox preload 保持单入口、按窗口角色暴露 API。具体边界见项目开发指南。
- `node_modules/`、`out/`、`dist/`、`tsconfig.*.tsbuildinfo` 等依赖、构建和缓存产物不进入正常提交。

## Git 与记录

任务进入记录、提交或收尾阶段时，使用 [dev-progress 技能](.github/skills/dev-progress/SKILL.md)。仅查询历史或口头总结时不因此修改文件。

- 暂存前查看 `git status --short` 和 `git diff --stat`；默认仅暂存本任务文件，除非用户明确要求，不使用全量暂存。
- 完成并验证开发任务后，默认直接提交本任务改动，不再等待额外的提交指令；用户要求仅审查、仅记录或不提交时除外。
- 验证失败时先修复或报告，不把失败标为完成。提交前展示 staged 文件列表和 commit message。
- 日志、状态与经验先定稿，再和本次代码一起提交；提交后只读核验，不为回填当前提交哈希制造第二轮改动。
- 如已有与本任务无关的 staged 改动，不直接整体 `git commit`，也不擅自取消暂存；暂停提交并询问如何隔离。
- `git push` 必须由用户明确要求或单独确认。
- 打包、安装、打标签、上传发布资产和创建 GitHub Release 仅按用户明确授权的范围执行；“打包”或“本机安装”不包含 push / 上传 / 发布。
- commit message 优先使用 `<type>(<scope>): <summary>`。

记录职责：
- `TempFile/文档资料/dev-log.md` 记录有价值的事件与实际验证；旧条目按月原文归档到 `TempFile/文档资料/archive/`，不删除历史证据。
- `TempFile/文档资料/project-status.md` 记录当前能力、未完成项和验收边界，不写无依据的完成百分比或流水账。
- `TempFile/文档资料/dev-lessons.md` 按问题维护可复用的原因、约束、代码/测试证据；新结论替代旧方案时标明替代关系，不机械复制日志。
- 小修、小实验和临时改动默认不写日志，除非用户明确要求。
- 不把 Token、Cookie、API Key、用户聊天、私密记忆或原始运行日志写入工程记忆。

## 架构速查

- 主进程：`src/main/`；preload bridge：`src/preload/`。
- 渲染入口：`src/renderer/main-ui/`、`src/renderer/wallpaper/`、`src/renderer/canvas/`。
- 桌面组件：`src/renderer/widgets/`；共享 IPC 常量和类型：`src/shared/`。
- 内置壁纸默认资源：`assets/wallpaper/<id>/`；用户调整后的组件配置由 `src/main/runtime/userDataPaths.ts` 定位到 userData 覆盖层。
