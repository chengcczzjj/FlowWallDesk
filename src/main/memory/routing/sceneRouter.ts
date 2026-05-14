export type Scene = 'daily' | 'emotion' | 'work' | 'tool' | 'private'

export interface SceneDecision {
  scene: Scene
  allowed: string[]
  blocked: string[]
  depth: 'shallow' | 'normal' | 'deep'
}

const SCENE_RULES: Record<Scene, Pick<SceneDecision, 'allowed' | 'blocked' | 'depth'>> = {
  daily: {
    allowed: ['general', 'user', 'preference', 'daily'],
    blocked: ['private'],
    depth: 'normal',
  },
  emotion: {
    allowed: ['general', 'user', 'preference', 'emotion'],
    blocked: ['private', 'tool'],
    depth: 'normal',
  },
  work: {
    allowed: ['general', 'user', 'preference', 'work', 'project'],
    blocked: ['private'],
    depth: 'deep',
  },
  tool: {
    allowed: ['general', 'user', 'preference', 'tool', 'work', 'project'],
    blocked: ['private', 'emotion'],
    depth: 'deep',
  },
  private: {
    allowed: ['general', 'user', 'preference', 'private'],
    blocked: ['work', 'tool'],
    depth: 'shallow',
  },
}

function detectScene(text: string, fallback: Scene): Scene {
  if (/天气|新闻|搜索|查询|计算|时间|系统信息|打开|创建|写入|修改|删除|移动|运行|命令|文件|目录/.test(text)) return 'tool'
  if (/项目|代码|开发|bug|需求|实现|修复|构建|测试|提交|git|typecheck|lint/.test(text)) return 'work'
  if (/隐私|秘密|私密|不要记录|保密/.test(text)) return 'private'
  if (/难过|开心|焦虑|压力|害怕|生气|喜欢|情绪|陪我/.test(text)) return 'emotion'
  return fallback
}

export function classifyBasic(params: { mode?: Scene | 'daily' | 'work' | 'private' | 'tool'; text?: string }): SceneDecision {
  const fallback: Scene = params.mode === 'private' || params.mode === 'work' || params.mode === 'tool' ? params.mode : 'daily'
  const scene = detectScene(params.text ?? '', fallback)
  return { scene, ...SCENE_RULES[scene] }
}
