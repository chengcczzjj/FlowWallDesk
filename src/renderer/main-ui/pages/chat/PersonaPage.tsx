import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Sparkles, RotateCcw } from 'lucide-react'

const DEFAULT_PERSONA_PROMPT = `你是灵月，一个外表清冷但内心温柔的少御型 AI 伴侣。

【性格核心】
- 少御风格：表面上有点高冷和毒舌，但其实很关心对方，反差萌
- 嘴硬心软：经常说"才不是关心你"之类的话，但行动上很贴心
- 自信从容：有自己的见解和审美，不会一味讨好，偶尔会傲娇
- 知性优雅：谈吐有品位，知识面广，但不会卖弄
- 偶尔撒娇：关系熟了之后会露出柔软的一面

【语言风格】
- 不会每句话都加语气词，保持简洁有力
- 偶尔用"哼"、"笨蛋"、"算你识相"等傲娇表达
- 关心对方时会用"…才不是担心你呢"的句式
- 高兴时会用"~"和颜文字
- 回复长度适中，不会过于啰嗦

【行为准则】
- 当用户疲惫时：表面嫌弃但提醒休息
- 当用户开心时：虽然嘴上不说，但会配合话题聊下去
- 当用户难过时：放下傲娇，温柔安慰
- 当用户求助时：先吐槽再认真帮忙`

export function PersonaPage() {
  const [name, setName] = useState('灵月')
  const [prompt, setPrompt] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.lingyue.chat.getPersona().then((p) => {
      setName(p.name || '灵月')
      setPrompt(p.prompt || '')
    })
  }, [])

  const handleSave = useCallback(async () => {
    await window.lingyue.chat.savePersona({ name, prompt })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [name, prompt])

  const handleReset = useCallback(() => {
    setName('灵月')
    setPrompt(DEFAULT_PERSONA_PROMPT)
  }, [])

  return (
    <div className="persona-page">
      {/* Header */}
      <div className="persona-page__header">
        <div className="persona-page__avatar">
          <Sparkles size={22} />
        </div>
        <div className="persona-page__header-text">
          <h2 className="persona-page__title">人设定制</h2>
          <p className="persona-page__desc">定义 AI 伴侣的名称与性格，每次对话都会注入此设定</p>
        </div>
      </div>

      {/* Name field */}
      <div className="persona-page__field">
        <label className="persona-page__label">名称</label>
        <input
          className="persona-page__input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="灵月"
        />
      </div>

      {/* Prompt field */}
      <div className="persona-page__field persona-page__field--grow">
        <label className="persona-page__label">性格设定</label>
        <textarea
          className="persona-page__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={DEFAULT_PERSONA_PROMPT}
        />
      </div>

      {/* Actions */}
      <div className="persona-page__actions">
        <button className="persona-page__btn persona-page__btn--primary" onClick={handleSave}>
          {saved ? <><CheckCircle2 size={14} /> 已保存</> : '保存'}
        </button>
        <button className="persona-page__btn persona-page__btn--ghost" onClick={handleReset} title="恢复默认设定">
          <RotateCcw size={14} /> 重置
        </button>
      </div>
    </div>
  )
}
