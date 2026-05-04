import type { ConversationMode } from '../events/types'

export type Scene = 'daily' | 'emotion' | 'work' | 'tool' | 'private'

export interface SceneDecision {
  scene: Scene
  allowed: string[]
  blocked: string[]
  depth: 'shallow' | 'normal' | 'deep'
}

/** 规则版场景路由：mode 直接决定 scene，不调用 LLM */
export function classifyBasic(input: { mode: ConversationMode; text: string }): SceneDecision {
  switch (input.mode) {
    case 'private':
      return { scene: 'private', allowed: ['private'], blocked: ['work', 'tool'], depth: 'shallow' }
    case 'work':
      return {
        scene: 'work',
        allowed: ['work', 'general'],
        blocked: ['private'],
        depth: 'shallow',
      }
    case 'tool':
      return {
        scene: 'tool',
        allowed: ['current_state', 'tool'],
        blocked: ['private', 'emotion'],
        depth: 'shallow',
      }
    default:
      return {
        scene: 'daily',
        allowed: ['general', 'companion'],
        blocked: ['private'],
        depth: 'shallow',
      }
  }
}
