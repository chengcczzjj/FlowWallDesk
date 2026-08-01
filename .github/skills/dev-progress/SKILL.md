---
name: dev-progress
description: '记录开发进度并管理 git 提交。Use when: 用户要求记录进度、总结开发情况、提交 git、生成 commit message、更新开发日志、查看开发历史。关键词：进度、记录、提交、commit、日志、log、git push'
argument-hint: '记录进度 / 提交代码 / 查看日志'
---

# 开发进度记录与 Git 提交管理

## 文件约定与职责分离

| 文件 | 用途 | 更新时机 |
|------|------|---------|
| `TempFile/文档资料/dev-log.md` | 开发日志：记录有价值的开发事件（做了什么、改了哪些文件、遇到什么问题） | 用户要求记录进度 / 总结开发 / 记录并提交时 |
| `TempFile/文档资料/project-status.md` | 项目进展全景：模块完成度、功能清单、架构概览、待办规划 | 有里程碑式进展时更新（新模块完成、架构变更等） |

**禁止重复**：dev-log 记录"事件"（某天做了 X），project-status 记录"状态"（X 功能已完成 80%）。两者不应有相同内容。

## 开发日志格式（dev-log.md）

- **格式**: 时间倒序（最新条目在最前面，紧接在 header 之后）
- **编码**: UTF-8
- **禁止创建其他日志文件**（不要 dev-log-2.md 等）

## 日志文件结构

```markdown
# 灵月桌面 开发日志

## [YYYY-MM-DD HH:mm] <简要标题>

**变更摘要**: 一句话概括本次变更

**涉及模块**:
- `<文件或模块路径>`: 做了什么

**遇到的问题**:
- <问题描述> → <解决方式>（仅记录有价值的问题，避免重复）

**Git Commit**: （未提交 / 已提交 — <commit message>）

---
```

## 操作流程

### 流程一：记录进度（用户说"记录进度"/"总结一下"等）

1. **读取现有日志**: 读取 `TempFile/文档资料/dev-log.md`，了解已有记录，避免重复
2. **检查 git 状态**: 运行 `git status --short` 和 `git diff --stat` 获取变更概况
3. **对比去重**: 将本次变更与日志中最近 3 条记录对比，跳过已记录的内容
4. **追加条目**: 在日志文件的 header（`# 灵月桌面 开发日志`）之后、第一条现有记录之前，插入新条目
5. **Git Commit 字段留空**: 写 `**Git Commit**: （未提交）`

### 流程二：提交 Git（用户说"提交"/"commit"等）

1. **读取现有日志**: 读取 `TempFile/文档资料/dev-log.md`
2. **检查 git 状态**: 运行 `git status --short` 确认有待提交内容
3. **生成 commit message**: 基于 `git diff --cached --stat`（如未暂存则先看 `git diff --stat`）生成规范的 commit message
4. **Commit message 格式**:
   ```
   <type>(<scope>): <简要描述>

   - 变更点1
   - 变更点2
   ```
   type 取值: feat / fix / refactor / style / docs / chore / perf
5. **询问用户确认**: 展示生成的 commit message，等用户确认后执行
6. **执行提交**:
   - 默认只 `git add` 本次任务相关文件；只有用户明确要求全量提交时才使用 `git add -A`
   - 提交前展示 staged 文件列表和 commit message，等待用户确认
   - `git commit -m "<message>"`
7. **更新日志**: 回填最近一条（`Git Commit: （未提交）`）为 `Git Commit: 已提交 — <commit message>`
8. **如果日志中没有未提交条目**: 新建一条完整条目（含 commit 信息）

### 流程三：记录 + 提交（用户说"记录并提交"）

按顺序执行流程一 → 流程二。

## 去重规则

- 读取最近 3 条日志条目
- 如果某个模块的某项变更已在之前条目中记录，本次不再重复
- "遇到的问题"部分：全局去重，同一个问题只记录首次出现和最终解决方案
- 如果距上次记录无实质变更（git status 为空），提示用户"暂无新变更需要记录"

## 问题记录标准

仅记录以下类型的问题：
- 耗时超过 10 分钟的 bug
- 反复出现 2 次以上的同类错误
- 需要修改架构或方案的问题
- 有通用参考价值的坑

格式：`<问题简述> → <根因> → <解决方式>`

## Git 提交规范

### 仓库信息
- **远程仓库**: GitHub（用户 chengcczzjj）
- **默认分支**: main
- **用户名**: chengcczzjj
- **邮箱**: chengcczzjj@users.noreply.github.com

### Commit Message 格式
```
<type>(<scope>): <简要描述>

- 变更点1
- 变更点2
```

### Type 取值
| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| refactor | 重构（不改功能） |
| style | 样式调整（CSS/UI） |
| docs | 文档变更 |
| chore | 构建/工具/配置变更 |
| perf | 性能优化 |

### Scope 取值（按项目模块）
| scope | 对应目录 |
|-------|---------|
| main | `src/main/` 主进程 |
| wallpaper | 壁纸相关（窗口/IPC/渲染） |
| canvas | `src/renderer/canvas/` 组件画布 |
| widget | `src/renderer/widgets/` 桌面组件 |
| ui | `src/renderer/main-ui/` 主界面 |
| ipc | `src/main/ipc/` + `src/shared/ipc-channels.ts` |
| service | `src/main/services/` 数据服务 |
| build | 构建/打包配置 |
| deps | 依赖更新 |

多模块变更可省略 scope：`feat: 壁纸系统与组件联动`

### 提交前检查清单
1. `git status --short` 确认变更范围
2. `git diff --stat` 确认变更量级合理
3. 默认只暂存本次任务相关文件，避免带入用户已有未提交改动
4. 不提交 `node_modules/`、`dist/`、`out/`、`tsconfig.*.tsbuildinfo` 等构建或缓存产物
5. commit message 简述用英文，body 可中英混合
6. 大量文件变更时考虑拆分提交
7. `git push` 必须由用户明确要求或单独确认后再执行

## 项目进展更新规则（project-status.md）

以下情况需要同步更新 `TempFile/文档资料/project-status.md`：
- 某个组件/模块从"未实现"变为"已实现"
- 新增了组件类型或模块
- 架构发生变更
- 解决了阻塞性问题导致整体进展推进

更新方式：修改对应模块的状态标记和完成度，不要追加流水记录（那是 dev-log 的事）。

## 注意事项

- 如果 `TempFile/文档资料/dev-log.md` 不存在，创建它并写入 header `# 灵月桌面 开发日志`
- 如果 `TempFile/文档资料/project-status.md` 不存在，参照现有模板创建
- 每条日志记录控制在 20 行以内，保持简洁
- 使用相对路径引用项目文件（如 `src/main/index.ts`）
- 执行 git 命令前始终先检查状态，避免空提交
- 不要回滚或覆盖用户已有未提交改动
- 如果 git 仓库未初始化，提示用户先执行 `git init`
