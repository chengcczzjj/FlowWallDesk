# 灵月记忆系统技术架构选型 GPT-5

> 历史技术方案：保留早期选型与分阶段设计，不要求重新搭建已存在的代码。本文不是当前实现清单；资料有效性与阅读顺序见 [知识索引](../knowledge-index.md)。

更新时间: 2026-04-27
读者: 后续负责搭建代码架构的 AI / 开发者
目标: 根据 `memory-system-design.md` 搭建一套本地优先、可扩展、场景隔离的记忆系统代码骨架，并指导后续按“薄架构先行 + 聊天功能优先”的方式开发。

> 2026-05-25 方向修正：本文是早期记忆系统技术骨架参考。当前产品主线已调整为“AI 伴侣对话 / 轻量桌面助手”，不再以编程级本地 Agent、复杂文件回滚或审批流为核心。产品设计参考 `memory-system-design.md` 和 `local-folder-agent-development-guide.md`，当前能力与缺口以 [项目状态](../project-status.md) 和源码为准。

## 1. 实现原则

本系统不要一开始完整实现所有记忆能力，也不要绕过架构直接做裸聊天功能。正确路线是:

```text
先搭最小记忆架构骨架
  -> 接入 AI 聊天闭环
  -> 所有聊天消息写入原始事件层
  -> 再逐步实现总结、召回、向量和工具扩展
```

第一阶段必须完成的是“薄骨架 + 可聊天”，而不是完整记忆系统。

最小骨架必须包含:

- 本地原始事件记录。
- 每个聊天窗口一个 `conversation_id`。
- 基础 `SceneRouter`。
- 基础 `ContextPacker`。
- 可为空的 `MemoryStore`。
- 可为空的 `PrivateMemoryStore`。
- 可为空的 `StateStore`。

第一版聊天功能必须走统一流程:

```text
用户输入
  -> 创建/读取 conversation_id
  -> SceneRouter 标记场景
  -> EventStore 写入用户消息
  -> ContextPacker 生成模型输入
  -> 调用 AI
  -> EventStore 写入 AI 回复
```

只要这条链路稳定，后续总结、召回、工具状态都可以逐步接入。

第一版可以暂不实现:

- 日程、闹钟、米家、摄像头、健身等具体工具。
- 完整本地大模型。
- 复杂图数据库。
- 多设备同步。
- 向量检索。
- 每天 2 次总结的完整效果。

开发原则:

- 架构先行，但实现薄切。
- 功能推进，但不能绕过架构。
- 任何新功能都必须说明是否写入 `events`、是否更新 `current_state`、是否可能进入 `memories`、允许在哪些 `scene` 召回、是否涉及 `private`。

## 2. 推荐技术选型

| 模块 | 推荐选型 | 原因 |
| --- | --- | --- |
| 实现语言 | TypeScript | 适合桌面应用、服务层、工具适配器和前端共享类型 |
| 本地数据库 | SQLite | 单文件、本地优先、部署简单 |
| 加密 | SQLCipher 或字段级加密 | 私密记忆需要独立加密 |
| 全文检索 | SQLite FTS5 | 关键词检索、专名检索稳定 |
| 向量检索 | sqlite-vec | 本地向量检索，不需要独立向量数据库 |
| 后台任务 | 本地 worker / scheduler | 每天 2 次总结，避免阻塞聊天 |
| 模型抽象 | Provider Adapter | 支持云端模型和未来本地模型切换 |
| 工具扩展 | Tool Adapter Registry | 当前工具可为空，后续模块化接入 |

如果主应用不是 TypeScript，也应保持同样的模块边界和接口。

## 3. 代码分层

推荐目录结构:

```text
src/memory/
  db/
    schema.ts
    migrations/
    sqliteClient.ts
  events/
    eventStore.ts
    eventTypes.ts
  state/
    stateStore.ts
    stateTypes.ts
  memories/
    memoryStore.ts
    privateMemoryStore.ts
    memoryTypes.ts
  routing/
    sceneRouter.ts
    retrievalRouter.ts
    contextPacker.ts
  consolidation/
    consolidationScheduler.ts
    consolidationWorker.ts
    extractors/
      dailyExtractor.ts
      workExtractor.ts
      privateExtractor.ts
      toolExtractor.ts
  models/
    modelProvider.ts
    embeddingProvider.ts
  tools/
    toolRegistry.ts
    toolAdapter.ts
  security/
    privacyGate.ts
    encryption.ts
  chat/
    chatService.ts
  index.ts
```

各层职责:

- `events`: 保存完整原始资料。
- `state`: 保存当前有效事实。
- `memories`: 保存长期记忆和私密记忆。
- `routing`: 判断场景、选择检索方式、打包上下文。
- `consolidation`: 每天 2 次从事件中总结长期记忆。
- `models`: 隔离具体模型供应商。
- `tools`: 预留工具接入点。
- `security`: 私密模式、权限和加密边界。
- `chat`: 第一版聊天闭环入口，必须通过 `events`、`sceneRouter`、`contextPacker`。

## 4. 数据库设计

第一版使用一个 SQLite 主库，私密记忆建议独立加密表或独立加密库。

核心表:

```text
conversations
events
current_state
memories
private_memories
memory_embeddings
summary_jobs
```

第一阶段必须真正用起来:

- `conversations`
- `events`

第一阶段可以先建表但功能为空:

- `current_state`
- `memories`
- `private_memories`
- `memory_embeddings`
- `summary_jobs`

这样做的目的: 聊天功能先跑起来，但所有消息已经落在正确架构里，不会形成后期难以迁移的裸聊天记录。

### 4.1 conversations

保存每个聊天窗口/会话。

```text
id
user_id
mode: daily | work | private | tool
project_id: nullable
created_at
updated_at
status
```

规则:

- 每个新窗口创建一个 `conversation_id`。
- 工作会话必须绑定 `project_id`。
- 日常会话和工作会话默认分开召回。

### 4.2 events

保存原始事件。

```text
id
conversation_id
project_id: nullable
event_type: user_message | assistant_message | tool_call | tool_result | system_event
mode
content_json
sensitivity: normal | sensitive | private
created_at
summary_status: pending | summarized | ignored
```

规则:

- 对话消息优先进入这里。
- 工具调用和结果未来也进入这里。
- 原始事件默认不直接塞进模型上下文，除非做历史追溯或总结。

### 4.3 current_state

保存当前状态/事实。

```text
key
domain
value_json
expires_at: nullable
updated_at
source_event_id: nullable
```

规则:

- 当前时间、当前任务、工具执行状态可以先存这里。
- 未来日程、闹钟、天气、设备状态都接入这里。
- 这一层使用精确查询，不使用向量匹配。

### 4.4 memories

保存长期记忆。

```text
id
scope: general | companion | work | tool
memory_type
project_id: nullable
content
importance
confidence
sensitivity
created_at
updated_at
last_used_at
status: active | outdated | deleted
source_event_ids: internal_only
embedding_id: nullable
```

规则:

- `source_event_ids` 仅内部使用，用户界面不展示。
- `work` 记忆必须尽量绑定 `project_id`。
- 不要把私密内容写入这张表。

### 4.5 private_memories

保存私密调情模式记忆。

```text
id
private_type
content
recall_style
importance
confidence
created_at
updated_at
status
embedding_id: nullable
```

规则:

- 必须走 `PrivacyGate` 才能读取。
- 默认不参与普通检索。
- 只在 private 场景、暗号触发、手动切换或人设允许的主动触发中使用。

## 5. 核心运行流程

### 5.1 第一阶段聊天闭环

```text
ChatService.sendMessage()
  -> ConversationService.getOrCreateConversation()
  -> SceneRouter.classifyBasic()
  -> EventStore.append(user_message)
  -> ContextPacker.buildInitialContext()
  -> ModelProvider.complete()
  -> EventStore.append(assistant_message)
  -> return assistant response
```

这个阶段不要求长期记忆召回有效，也不要求总结有效。重点是聊天功能从第一天开始就写入 `events`。

### 5.2 标准写入流程

后续接入工具或记忆后，统一写入流程为:

```text
用户消息/AI 回复/工具事件
  -> EventStore.append()
  -> 如影响当前事实，StateStore.upsert()
  -> 如用户明确要求记住，MemoryStore.upsertImmediate()
  -> 否则等待每日定时总结
```

写入时不要同步做复杂总结，避免影响聊天速度。

### 5.3 定时总结流程

每天 2 次执行。该能力可以在聊天闭环之后实现:

```text
ConsolidationScheduler
  -> 找到 pending events
  -> 按 mode / project_id / conversation_id 分组
  -> 选择 extractor
  -> 调用模型生成候选记忆
  -> 去重、合并、过滤低价值内容
  -> 写入 memories 或 private_memories
  -> 标记 events summary_status
```

Extractor 只输出候选，最终是否写入由系统规则决定。

### 5.4 召回流程

```text
用户输入
  -> SceneRouter.classify()
  -> RetrievalRouter.plan()
  -> 按计划查询 state / memories / private_memories / events
  -> PrivacyGate.filter()
  -> rerank + 去重 + token budget
  -> ContextPacker.build()
  -> 交给模型
```

第一版召回可以只使用:

- 当前会话最近消息。
- 少量系统/人设提示。
- 规则版场景判断。

后续再逐步加入:

- 当前状态/事实。
- 长期记忆。
- 私密记忆。
- FTS。
- 向量检索。

向量检索只在语义模糊问题中使用。当前状态、工具指令、项目 ID、时间和设备状态都应优先精确查询。

## 6. 场景路由规则

`SceneRouter` 输出:

```text
scene: daily | emotion | work | tool | private
project_id?: string
tool_domain?: string
allowed_scopes: string[]
blocked_scopes: string[]
retrieval_depth: shallow | normal | deep
```

默认规则:

| 场景 | allowed | blocked |
| --- | --- | --- |
| daily | general, companion | private, unrelated_work |
| emotion | companion, general | private, tool_logs |
| work | work, relevant_general | private, unrelated_daily |
| tool | current_state, tool | private, emotion |
| private | private | work, tool |

工作场景必须优先限定 `project_id`，避免跨项目串记忆。

## 7. 工具扩展接口

工具当前可以为空，但要保留注册机制。

```ts
interface ToolAdapter {
  domain: string;
  canHandle(input: ToolIntent): boolean;
  getSchema(): ToolSchema;
  execute(command: ToolCommand): Promise<ToolResult>;
  projectState?(result: ToolResult): StatePatch[];
}
```

工具接入规则:

- 工具调用写入 `events`。
- 当前有效状态写入 `current_state`。
- 工具偏好只有在重复出现或用户明确表达时才进入 `memories`。

## 8. 模型抽象接口

不要在业务代码里直接绑定某个模型服务。

```ts
interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>;
  classify?(request: ClassifyRequest): Promise<ClassifyResult>;
}

interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
```

第一版允许:

- 总结模型使用云端。
- embedding 可先云端或本地。

长期方向:

- 存储必须本地。
- embedding 尽量本地。
- 总结模型逐步支持本地。

## 9. 安全和隐私边界

必须实现 `PrivacyGate`:

```text
input: scene, user_mode, persona_policy, requested_scopes
output: allowed_scopes, blocked_scopes, reason
```

硬规则:

- private 记忆不能进入 daily/work/tool 场景。
- work 场景不能主动召回调情记忆。
- tool 场景优先查当前状态，不使用情感记忆做判断。
- 私密记忆读取必须经过 private 场景、暗号、手动切换或人设策略允许。

## 10. MVP 开发顺序

### Phase 0: 薄架构骨架

目标: 先把后续不会推翻的边界立起来。

1. 建 SQLite schema 和迁移机制。
2. 实现 `conversations` 和 `events`。
3. 实现 `EventStore.append()`。
4. 实现规则版 `SceneRouter.classifyBasic()`。
5. 实现最小 `ContextPacker.buildInitialContext()`。
6. 创建空实现的 `StateStore`、`MemoryStore`、`PrivateMemoryStore`、`RetrievalRouter`。

验收标准:

- 可以创建会话。
- 用户消息和 AI 回复都能写入 `events`。
- 日常/工作/私密至少能被标记为不同 `mode`。

### Phase 1: AI 聊天功能

目标: 完成可用聊天，但不能绕过记忆骨架。

1. 实现 `ChatService.sendMessage()`。
2. 接入 `ModelProvider.complete()`。
3. 每次用户输入先写入 `events`。
4. 每次 AI 回复后写入 `events`。
5. `ContextPacker` 先只打包最近会话消息和基础系统提示。

验收标准:

- 用户可以和 AI 正常聊天。
- 关闭再打开新窗口时，会创建新的 `conversation_id`。
- 所有窗口的对话都在统一原始事件库里。

### Phase 2: 基础场景隔离

目标: 防止后续功能串场。

1. 支持 daily / work / private 三种核心模式。
2. 工作会话绑定 `project_id`。
3. `PrivacyGate` 先实现硬规则。
4. `ContextPacker` 根据 scene 屏蔽不允许的 scope。

验收标准:

- 工作模式不会召回 private。
- private 模式不会混入工作上下文。
- 日常和工作会话默认分开处理。

### Phase 3: 当前状态/事实层

目标: 先支持简单状态，不接复杂工具。

1. 实现 `StateStore.upsert/get`。
2. 存储当前会话状态、当前任务、当前工具执行状态。
3. `RetrievalRouter` 支持精确查询 state。

验收标准:

- 当前状态查询不依赖向量。
- 状态可以设置过期时间。

### Phase 4: 长期记忆和定时总结

目标: 从原始对话中开始沉淀长期记忆。

1. 实现 `MemoryStore`。
2. 实现 `ConsolidationScheduler`，每天 2 次。
3. 实现日常/工作/私密的基础 extractor。
4. 支持用户明确说“记住这个”时立即写入。

验收标准:

- 总结不会阻塞聊天。
- 低价值闲聊不会大量进入长期记忆。
- work 记忆尽量绑定 `project_id`。

### Phase 5: 检索增强

目标: 在已有记忆基础上提高召回质量。

1. 实现 FTS 关键词检索。
2. 实现 `RetrievalRouter.plan()`。
3. 实现 rerank、去重和 token budget。
4. 补充 embedding 和 sqlite-vec。

验收标准:

- 明确专名优先关键词检索。
- 模糊语义问题才使用向量检索。
- 普通聊天不会全库搜索。

### Phase 6: 工具扩展

目标: 后续再接入日程、闹钟、搜索、智能家居等工具。

1. 实现 `ToolRegistry`。
2. 接入第一个具体 `ToolAdapter`。
3. 工具调用写入 `events`。
4. 当前状态写入 `current_state`。
5. 工具偏好只在重复或明确表达时进入 `memories`。

## 11. 禁止事项

- 不要把所有内容都写入长期记忆。
- 不要把所有检索都做成向量检索。
- 不要让模型决定私密记忆是否能跨场景使用。
- 不要在每轮聊天同步执行深度总结。
- 不要在普通聊天中加载完整工作项目历史。
- 不要在工作场景中召回私密调情记忆。
- 不要把未来工具模块写死在核心记忆层。

## 12. 新功能接入检查清单

任何 AI 或开发者实现新功能前，必须先回答:

1. 这个功能会产生哪些 `events`?
2. 这个功能是否需要更新 `current_state`?
3. 这个功能是否可能生成长期 `memories`?
4. 这些记忆允许在哪些 `scene` 被召回?
5. 是否涉及 `private` scope 或敏感内容?
6. 是否需要 `project_id`?
7. 是否需要工具权限或高风险确认?
8. 是否会增加上下文长度，如何控制 token budget?

如果无法回答这些问题，不应直接开始写业务代码。
