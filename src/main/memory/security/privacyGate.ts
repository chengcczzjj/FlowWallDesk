import type { Scene } from '../routing/sceneRouter'

const SCENE_BLOCK: Record<Scene, string[]> = {
  daily: ['private'],
  emotion: ['private', 'tool'],
  work: ['private'],
  tool: ['private', 'emotion'],
  private: ['work', 'tool'],
}

/** 硬规则隐私过滤：根据当前场景屏蔽不允许的 scope */
export function filterScopes(requestedScopes: string[], scene: Scene): string[] {
  const blocked = SCENE_BLOCK[scene] ?? []
  return requestedScopes.filter((s) => !blocked.includes(s))
}
