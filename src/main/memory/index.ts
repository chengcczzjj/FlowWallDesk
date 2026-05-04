import { getDb, closeDb } from './db/client'
import { startConsolidationSchedule, stopConsolidationSchedule } from './consolidation/consolidationService'
import { startAutomationScheduler, stopAutomationScheduler } from './agent/automationScheduler'

export { getDb, closeDb }
export { EventStore } from './events/eventStore'
export { ConversationStore } from './conversations/conversationStore'
export { ChatService } from './chat/chatService'
export { ModelConfig } from './models/config'
export { classifyBasic } from './routing/sceneRouter'
export { StateStore } from './state/stateStore'
export { MemoryStore } from './memories/memoryStore'
export { RetrievalRouter } from './routing/retrievalRouter'
export { runConsolidation, immediateExtract } from './consolidation/consolidationService'
export { AutomationStore } from './agent/automationStore'
export { runAutomationNow } from './agent/automationScheduler'

/** 初始化记忆系统（启动时调用，确保数据库就绪） */
export function initMemorySystem(): void {
  getDb() // 触发 db 初始化 + 建表
  startConsolidationSchedule() // 启动定时记忆总结
  startAutomationScheduler() // 启动自动化任务调度
}

/** 关闭记忆系统（应用退出前调用） */
export function shutdownMemorySystem(): void {
  stopAutomationScheduler()
  stopConsolidationSchedule()
  closeDb()
}
