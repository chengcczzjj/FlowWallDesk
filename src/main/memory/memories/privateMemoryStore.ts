/** Phase 4: 私密记忆存储 — 占位 */
export const PrivateMemoryStore = {
  upsert(_content: string, _type: string): void {
    throw new Error('[PrivateMemoryStore] Not implemented — Phase 4')
  },
  query(_text: string): unknown[] {
    throw new Error('[PrivateMemoryStore] Not implemented — Phase 4')
  },
}
