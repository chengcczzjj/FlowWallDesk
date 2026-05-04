# 灵月记忆系统技术架构选型 Opus 版

更新时间: 2026-04-27
读者: 后续负责落地代码的 AI / 开发者
基于: `memory-system-design.md`（不可推翻的设计总纲）
配套: `memory-system-technical-architecture-GPT-5.md`（远期技术细节，本文不重复）

> 本文只覆盖**第一版要做的事**：建骨架 + 跑通最小聊天闭环。UI 设计、Phase 2+ 能力都不在本文范围。

---

## 1. 当前状态

灵月桌面目前只有动态壁纸 / 桌面组件 / 桌宠等"非 AI"能力。AI 聊天 / 记忆系统**完全未开始**，且：

- 聊天页 UI 设计稿尚未给出（待用户提供参考后再做渲染层）。
- 模型接入方式待定：可能是聚合 API（OpenRouter / 硅基流动等），也可能是多 provider 切换。

因此第一版只做两件事：

1. 把后续不需重写的**数据边界**和**进程边界**立起来。
2. 跑通"用户输入 → 模型回复 → 写库"这一条链路，**通过 IPC 暴露给渲染层**。

UI 等用户给设计稿后再实现。

---

## 2. 必须遵守的原则

| # | 原则 |
|---|---|
| P1 | 架构先行，实现薄切：表全建，模块全占位，但只实现 events / chat / scene-router |
| P2 | 任何聊天写入都必须经过 `EventStore.append()` |
| P3 | 数据库与模型调用只在主进程，渲染进程通过 IPC 访问 |
| P4 | 第一版不做向量、不做总结、不做 LLM 分类（场景判断走规则） |
| P5 | 私密记忆默认不进入普通场景；第一版用独立 db 文件做物理隔离即可 |
| P6 | 不预测未来工具；不做超出 Phase 1 的抽象 |

---

## 3. 开源方案调研（结论：不引入框架）

调研过 mem0 / Letta(MemGPT) / Zep+Graphiti / A-MEM / Cognee / LangMem。它们设计各异，但有共同点：**都假设系统已有稳定聊天闭环和大量历史数据**。我们没有，强行套用只会被框架抽象绑架。

**结论**：自研薄层。等 Phase 4 真要写"事实抽取/合并"逻辑时，再借鉴 mem0 的 `ADD / UPDATE / MERGE / NOOP` 四类操作语义作为 prompt 模板，仅此而已。

---

## 4. 技术选型（第一版实际安装的依赖）

| 模块 | 选型 | 理由 |
|---|---|---|
| 数据库 | **better-sqlite3** | 同步 API，事务简单，Electron 主进程友好 |
| Schema/迁移 | **Drizzle ORM + drizzle-kit** | 类型安全；迁移文件可 git 管理；比手写 SQL 稳 |
| 校验 | **Zod** | 写入前做 schema 校验；后续可与工具调用共用 |
| 模型 SDK | **Vercel AI SDK (`ai` + `@ai-sdk/openai`)** | 统一 streamText / generateText；天然支持流式与多 provider；通过 `baseURL` 可对接所有 OpenAI 兼容服务 |
| ID | **ulidx** | 字典序即时间序，适合事件分页 |
| 日志 | **pino** | 结构化、低开销 |

**Phase 1 暂不引入**：sqlite-vec、transformers.js、SQLCipher、Electron utilityProcess、图数据库。等真用到时再装。

`package.json` 新增：

```jsonc
{
  "dependencies": {
    "better-sqlite3": "^11.x",
    "drizzle-orm": "^0.36.x",
    "ulidx": "^2.x",
    "zod": "^3.23.x",
    "ai": "^4.x",
    "@ai-sdk/openai": "^1.x",
    "pino": "^9.x"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.x",
    "@types/better-sqlite3": "^7.x"
  }
}
```

---

## 5. 模型 Provider 策略

要同时兼容"聚合 key（一条配置走天下）"和"多 provider 切换"，用同一套 **profile 列表**模型即可。

### 5.1 配置结构

存在 electron-store 里（复用 `src/main/store.ts`）：

```ts
type ModelProfile = {
  id: string;            // ulid
  name: string;          // 用户起名，如 "OpenRouter-Sonnet"、"DeepSeek-V3"、"Ollama-本地"
  baseURL: string;       // 必填，例如 https://openrouter.ai/api/v1
  apiKey: string;        // 必填（本地模型可填占位符）
  model: string;         // 例如 anthropic/claude-3.5-sonnet
  // 可选高级参数
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;  // OpenRouter 之类要求的 referer/title
};

type ModelSettings = {
  profiles: ModelProfile[];
  activeProfileId: string;
};
```

### 5.2 实例化（只用 `@ai-sdk/openai`）

```ts
// src/main/memory/models/chatModel.ts
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export function getActiveProvider(profile: ModelProfile) {
  return createOpenAI({
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    headers: profile.headers,
  });
}

export async function* streamChat(profile: ModelProfile, messages: ChatMessage[]) {
  const openai = getActiveProvider(profile);
  const result = await streamText({
    model: openai(profile.model),
    messages,
    temperature: profile.temperature,
  });
  for await (const chunk of result.textStream) yield chunk;
}
```

**关键**：OpenRouter / DeepSeek / 硅基流动 / 智谱 / Ollama / vLLM / OneAPI 都遵循 OpenAI 兼容协议，**全部走这一份代码**。用户加几个 profile 就支持几个，无需为每个服务单独适配。原生 Anthropic / Gemini SDK 等真到必要时再追加 `@ai-sdk/anthropic` 即可。

### 5.3 设置页能力（待 UI 给出）

- 增 / 删 / 编辑 profile。
- 切换 active profile。
- 测试连接（发一条 "ping" 走 generateText 看是否返回）。

UI 不做硬性规定，等设计稿到位再实现。

---

## 6. 目录结构（回答"是否独立放置"）

记忆系统**留在 `src/main/` 内部，作为子目录**，不上升到 `src/` 顶层。理由：

- Electron 强制按**进程**分目录（main / renderer / preload / shared），这是物理边界。
- 记忆系统依赖 `better-sqlite3` 与文件 IO，**只能**在主进程，归属 `src/main/` 是正确的。
- `src/main/` 现已按职责分子目录（`ipc/` `services/` `windows/`），memory 作为自洽子系统加一个 `src/main/memory/` 子目录最自然。
- 桌宠未来若变成"AI 桌宠"（有主进程状态、调用记忆），再新增 `src/main/pet/`，与 `memory/` 平级。**现在不预拆**。

```text
src/main/
  index.ts
  store.ts
  tray.ts
  ipc/                  // 已有
    chatIpc.ts          // 新增：注册 chat IPC handler（薄层，仅转发）
  services/             // 已有
  windows/              // 已有
  memory/               // ★ 新增子系统，自洽
    db/
      client.ts         // better-sqlite3 单例
      schema.ts         // drizzle 表定义
      migrate.ts        // 启动时自动执行
      paths.ts          // userData/lingyue-memory.db
    events/
      eventStore.ts
      types.ts          // EventType + Zod schema
    conversations/
      conversationStore.ts
    state/              // [Phase 3] 占位
    memories/           // [Phase 4] 占位
    routing/
      sceneRouter.ts    // 规则版
      contextPacker.ts
    models/
      chatModel.ts      // §5.2
      config.ts         // 读写 ModelProfile
    security/
      privacyGate.ts    // 硬规则过滤
    chat/
      chatService.ts    // 唯一对外的聊天入口
    index.ts            // export createMemorySystem()

src/shared/
  ipc-channels.ts       // 追加 CHAT_* 通道常量
  types.ts              // 追加 ChatMessage / ConversationMode / Scene / ModelProfile

src/preload/
  main-ui.ts            // 追加 window.lingyue.chat.* API

src/renderer/main-ui/pages/
  chat/                 // 待 UI 设计稿后再创建
```

何时才考虑顶层重组：当 `src/main/` 下子系统超过 6 个、且互相有逻辑层级（memory / chat / tools / agents 互相依赖）时，再考虑 `src/main/ai/{memory,chat,tools}/`。**现在不用**。

---

## 7. 数据库 Schema（Phase 0 一次建好）

字段细节沿用 `memory-system-technical-architecture-GPT-5.md` §4。Phase 1 实际写入的只有 `conversations` 和 `events` 两张表，其余建表占位。

第一版重点的两张表（伪 Drizzle 代码示意）：

```ts
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),                  // ulid
  mode: text('mode').notNull(),                 // daily | work | private | tool
  projectId: text('project_id'),
  title: text('title'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  status: text('status').notNull().default('active'),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),                  // ulid
  conversationId: text('conversation_id').notNull(),
  projectId: text('project_id'),
  eventType: text('event_type').notNull(),      // user_message | assistant_message | tool_call | tool_result | system_event
  mode: text('mode').notNull(),
  contentJson: text('content_json').notNull(),
  sensitivity: text('sensitivity').notNull().default('normal'),
  createdAt: integer('created_at').notNull(),
  summaryStatus: text('summary_status').notNull().default('pending'),
}, t => ({
  byConv: index('events_by_conv').on(t.conversationId, t.createdAt),
}));
```

`current_state` / `memories` / `private_memories` / `memory_embeddings` / `summary_jobs` 全部建表占位，Phase 1 内不写入。`private_memories` 建议落到独立 `lingyue-private.db`，仅做物理隔离，第一版不加密。

---

## 8. 聊天闭环（Phase 1 唯一要跑通的流程）

```text
ChatService.sendMessage({ conversationId?, mode?, text })
  1. conv = ConversationStore.getOrCreate(conversationId, mode ?? 'daily')
  2. scene = SceneRouter.classifyBasic({ mode: conv.mode, text })
  3. EventStore.append({ type: 'user_message', conversationId, mode, content: { text } })
  4. recent = EventStore.listRecent(conv.id, 20)
  5. messages = ContextPacker.buildInitialContext({ scene, recent, persona })
  6. profile = ModelConfig.getActive()
  7. for await (chunk of chatModel.streamChat(profile, messages))
       通过 IPC 流式回传给渲染层
  8. EventStore.append({ type: 'assistant_message', ..., content: { text: full } })
  9. 返回完成事件
```

要点：
- 步骤 3 与 8 的写库放在事务里。
- `ContextPacker` 第一版只拼：persona system prompt + 最近 N 条消息。**不查 memories / state**。
- `SceneRouter.classifyBasic` 走纯规则（mode 直接决定 scene），**不调用 LLM**。

---

## 9. IPC 接口（接口层，不涉及 UI）

`src/shared/ipc-channels.ts` 追加：

```ts
export const CHAT_SEND_MESSAGE       = 'chat:send-message';        // streaming
export const CHAT_NEW_CONVERSATION   = 'chat:new-conversation';
export const CHAT_LIST_CONVERSATIONS = 'chat:list-conversations';
export const CHAT_GET_HISTORY        = 'chat:get-history';
export const CHAT_LIST_PROFILES      = 'chat:list-profiles';
export const CHAT_UPSERT_PROFILE     = 'chat:upsert-profile';
export const CHAT_DELETE_PROFILE     = 'chat:delete-profile';
export const CHAT_SET_ACTIVE_PROFILE = 'chat:set-active-profile';
export const CHAT_TEST_PROFILE       = 'chat:test-profile';
```

流式回传：用 `ipcMain.handle` 启动一个流任务，返回 `streamId`，再通过 `webContents.send('chat:stream-chunk', { streamId, delta })` / `'chat:stream-end'` / `'chat:stream-error'` 推送。preload 把它包成 async iterator 暴露给渲染层。

UI 层如何调用、如何渲染消息列表，**等设计稿到位后再决定**。

---

## 10. MVP 实施步骤

### Phase 0：骨架（一次性完成）

1. 安装 §4 依赖。
2. `src/main/memory/db/` 完成 client + schema + migrate；启动时执行迁移。
3. 建好 §7 的所有表（即使大多数为空）。
4. 实现 `ConversationStore.getOrCreate / list`。
5. 实现 `EventStore.append / listRecent`，写入走 Zod。
6. 实现 `SceneRouter.classifyBasic`（纯规则）。
7. 占位类：`StateStore` / `MemoryStore` / `PrivateMemoryStore` / `RetrievalRouter`（throw NotImplemented）。
8. `npm run typecheck` 通过。

### Phase 1：聊天闭环（接通 IPC，先不做 UI）

1. `models/config.ts`：基于 electron-store 的 profile CRUD。
2. `models/chatModel.ts`：§5.2 的 `streamChat`。
3. `chat/chatService.ts`：§8 的流程。
4. `ipc/chatIpc.ts`：注册 §9 的所有通道，含流式分片转发。
5. `src/preload/main-ui.ts`：暴露 `window.lingyue.chat`。
6. 写一个临时调试入口（命令行脚本或最简 dev 页面）验证端到端能跑。
7. 等用户给出聊天页 UI 设计稿后，渲染层在 `src/renderer/main-ui/pages/chat/` 实现。

### Phase 2+：暂不做

总结、状态层、向量召回、工具扩展全部按 GPT-5 版文档 §10 推进，**不在第一版**。

---

## 11. 反模式

- ❌ 在 renderer 直接 `require('better-sqlite3')`。
- ❌ 在 Phase 1 引入向量 / embedding / 总结 / LLM 分类。
- ❌ 为每个 OpenAI 兼容服务单独写 provider，应该全部走 §5.2。
- ❌ 把 API key 写进代码 / 日志 / git。
- ❌ 在用户没给 UI 设计前自行设计聊天页面布局。
- ❌ 把记忆系统目录上移到 `src/memory/`（违反 Electron 进程边界惯例）。

---

## 12. AI 自检清单

写代码前过一遍：

1. 这一步属于 Phase 几？是不是越界了？
2. 是否经过 events / sceneRouter / privacyGate？
3. 是否在主进程？renderer 是否只通过 IPC 访问？
4. 是否新增了 §4 之外的依赖？为什么？
5. 是否在主流程同步执行了 LLM 调用？是否阻塞 UI？
6. 是否触碰 private_memories？是否经过 PrivacyGate？
7. UI 改动是否已经有用户给的设计参考？没有就**不要做**。

如果不确定某改动属于哪个 Phase，**默认 Phase 2+，先暂缓**。
