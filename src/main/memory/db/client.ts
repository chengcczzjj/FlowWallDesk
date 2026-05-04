import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { MEMORY_DB_PATH, PRIVATE_DB_PATH } from './paths'
import { runMigrations } from './migrate'

let mainDb: ReturnType<typeof drizzle> | null = null
let rawDb: Database.Database | null = null

/** 获取主记忆数据库（懒初始化） */
export function getDb() {
  if (!mainDb) {
    rawDb = new Database(MEMORY_DB_PATH)
    rawDb.pragma('journal_mode = WAL')
    rawDb.pragma('foreign_keys = ON')
    runMigrations(rawDb, 'main')
    mainDb = drizzle(rawDb, { schema })
  }
  return mainDb
}

/** 获取底层 better-sqlite3 实例（事务/raw SQL 用） */
export function getRawDb(): Database.Database {
  getDb() // 确保已初始化
  return rawDb!
}

/** 初始化私密记忆数据库（Phase 4 启用） */
export function initPrivateDb() {
  const db = new Database(PRIVATE_DB_PATH)
  db.pragma('journal_mode = WAL')
  runMigrations(db, 'private')
  return drizzle(db, { schema: { privateMemories: schema.privateMemories } })
}

/** 关闭数据库连接 */
export function closeDb() {
  rawDb?.close()
  rawDb = null
  mainDb = null
}
