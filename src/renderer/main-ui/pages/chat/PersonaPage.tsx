import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Sparkles, RotateCcw } from 'lucide-react'
import {
  DEFAULT_CHAT_PERSONA,
  DEFAULT_PERSONA_TEMPLATE_ID,
  PERSONA_TEMPLATE_ORDER,
  PERSONA_TEMPLATES,
  type PersonaTemplate,
  type PersonaTemplateId,
} from '@shared/persona'

const PERSONA_TEMPLATE_STORAGE_KEY = 'lingyue-chat-persona-templates'
const ACTIVE_PERSONA_TEMPLATE_STORAGE_KEY = 'lingyue-chat-active-persona-template'

function createPersonaTemplates(): Record<PersonaTemplateId, PersonaTemplate> {
  return PERSONA_TEMPLATE_ORDER.reduce((templates, templateId) => {
    templates[templateId] = { ...PERSONA_TEMPLATES[templateId] }
    return templates
  }, {} as Record<PersonaTemplateId, PersonaTemplate>)
}

function isPersonaTemplateId(value: string | null): value is PersonaTemplateId {
  return value === 'qinglan' || value === 'hyena'
}

function readActiveTemplateId(): PersonaTemplateId {
  try {
    const storedTemplateId = localStorage.getItem(ACTIVE_PERSONA_TEMPLATE_STORAGE_KEY)
    return isPersonaTemplateId(storedTemplateId) ? storedTemplateId : DEFAULT_PERSONA_TEMPLATE_ID
  } catch {
    return DEFAULT_PERSONA_TEMPLATE_ID
  }
}

function readPersonaTemplates(): Record<PersonaTemplateId, PersonaTemplate> {
  const templates = createPersonaTemplates()

  try {
    const storedValue = localStorage.getItem(PERSONA_TEMPLATE_STORAGE_KEY)
    if (!storedValue) return templates

    const parsedValue = JSON.parse(storedValue) as Partial<Record<PersonaTemplateId, Partial<PersonaTemplate>>>
    for (const templateId of PERSONA_TEMPLATE_ORDER) {
      const storedTemplate = parsedValue[templateId]
      if (!storedTemplate || typeof storedTemplate !== 'object') continue

      templates[templateId] = {
        ...templates[templateId],
        name: typeof storedTemplate.name === 'string' && storedTemplate.name.trim()
          ? storedTemplate.name
          : templates[templateId].name,
        prompt: typeof storedTemplate.prompt === 'string' && storedTemplate.prompt.trim()
          ? storedTemplate.prompt
          : templates[templateId].prompt,
      }
    }
  } catch {
    return templates
  }

  return templates
}

function persistPersonaTemplates(templates: Record<PersonaTemplateId, PersonaTemplate>): void {
  try {
    const payload = PERSONA_TEMPLATE_ORDER.reduce((result, templateId) => {
      result[templateId] = {
        name: templates[templateId].name,
        prompt: templates[templateId].prompt,
      }
      return result
    }, {} as Record<PersonaTemplateId, Pick<PersonaTemplate, 'name' | 'prompt'>>)
    localStorage.setItem(PERSONA_TEMPLATE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage may be unavailable in a constrained renderer context.
  }
}

function persistActiveTemplateId(templateId: PersonaTemplateId): void {
  try {
    localStorage.setItem(ACTIVE_PERSONA_TEMPLATE_STORAGE_KEY, templateId)
  } catch {
    // Keep the in-memory selection when localStorage is unavailable.
  }
}

export function PersonaPage() {
  const [templates, setTemplates] = useState<Record<PersonaTemplateId, PersonaTemplate>>(() => createPersonaTemplates())
  const [activeTemplateId, setActiveTemplateId] = useState<PersonaTemplateId>(DEFAULT_PERSONA_TEMPLATE_ID)
  const [name, setName] = useState(DEFAULT_CHAT_PERSONA.name)
  const [prompt, setPrompt] = useState(DEFAULT_CHAT_PERSONA.prompt)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let disposed = false
    const storedTemplates = readPersonaTemplates()
    const storedTemplateId = readActiveTemplateId()

    window.lingyue.chat.getPersona().then((storedPersona) => {
      if (disposed) return

      const savedPrompt = storedPersona.prompt?.trim()
      const savedName = storedPersona.name?.trim()
      const selectedTemplate = storedTemplates[storedTemplateId]
      const nextDraft = savedPrompt
        ? {
            templateId: storedTemplateId,
            name: savedName || selectedTemplate.name,
            prompt: savedPrompt,
          }
        : {
            templateId: storedTemplateId,
            name: selectedTemplate.name,
            prompt: selectedTemplate.prompt,
          }
      const nextTemplates = savedPrompt
        ? {
            ...storedTemplates,
            [storedTemplateId]: {
              ...selectedTemplate,
              name: nextDraft.name,
              prompt: nextDraft.prompt,
            },
          }
        : storedTemplates

      if (savedPrompt) persistPersonaTemplates(nextTemplates)
      setTemplates(nextTemplates)
      setActiveTemplateId(nextDraft.templateId)
      setName(nextDraft.name)
      setPrompt(nextDraft.prompt)
    })

    return () => {
      disposed = true
    }
  }, [])

  const activeTemplate = templates[activeTemplateId]
  const dirty = name !== activeTemplate.name || prompt !== activeTemplate.prompt
  const canSave = dirty && name.trim().length > 0 && prompt.trim().length > 0 && !saving

  const handleSelectTemplate = useCallback((templateId: PersonaTemplateId) => {
    const template = templates[templateId]
    setActiveTemplateId(templateId)
    setName(template.name)
    setPrompt(template.prompt)
    setSaved(false)
    persistActiveTemplateId(templateId)
    void window.lingyue.chat.savePersona({ name: template.name, prompt: template.prompt }).catch(() => undefined)
  }, [templates])

  const handleSave = useCallback(async () => {
    if (!canSave) return

    setSaving(true)
    const nextName = name.trim()
    const nextPrompt = prompt.trim()
    const nextTemplates = {
      ...templates,
      [activeTemplateId]: {
        ...activeTemplate,
        name: nextName,
        prompt: nextPrompt,
      },
    }

    try {
      await window.lingyue.chat.savePersona({ name: nextName, prompt: nextPrompt })
      persistPersonaTemplates(nextTemplates)
      persistActiveTemplateId(activeTemplateId)
      setTemplates(nextTemplates)
      setName(nextName)
      setPrompt(nextPrompt)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [activeTemplate, activeTemplateId, canSave, name, prompt, templates])

  const handleReset = useCallback(() => {
    const baseTemplate = PERSONA_TEMPLATES[activeTemplateId]
    setName(baseTemplate.name)
    setPrompt(baseTemplate.prompt)
    setSaved(false)
  }, [activeTemplateId])

  return (
    <div className="persona-page">
      <div className="persona-page__header">
        <div className="persona-page__avatar">
          <Sparkles size={22} />
        </div>
        <div className="persona-page__header-text">
          <h2 className="persona-page__title">人设定制</h2>
          <p className="persona-page__desc">定义 AI 伴侣的名称与性格，每次对话都会注入此设定</p>
        </div>
      </div>

      <section className="persona-page__templates" aria-label="人设模板">
        <span className="persona-page__template-label">模板</span>
        <div className="persona-page__template-list">
          {PERSONA_TEMPLATE_ORDER.map((templateId) => {
            const template = templates[templateId]
            return (
              <button
                key={template.id}
                type="button"
                className={`persona-page__template-btn ${activeTemplateId === template.id ? 'active' : ''}`}
                onClick={() => handleSelectTemplate(template.id)}
              >
                <span className="persona-page__template-name">{template.label}</span>
                <span className="persona-page__template-tagline">{template.tagline}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="persona-page__field">
        <label className="persona-page__label">名称</label>
        <input
          className="persona-page__input"
          type="text"
          value={name}
          onChange={(event) => { setName(event.target.value); setSaved(false) }}
          placeholder={activeTemplate.name}
        />
      </div>

      <div className="persona-page__field persona-page__field--grow">
        <label className="persona-page__label">性格设定</label>
        <textarea
          className="persona-page__textarea"
          value={prompt}
          onChange={(event) => { setPrompt(event.target.value); setSaved(false) }}
          placeholder={activeTemplate.prompt}
        />
      </div>

      <div className="persona-page__actions">
        <button className="persona-page__btn persona-page__btn--primary" onClick={handleSave} disabled={!canSave}>
          {saved ? <><CheckCircle2 size={14} /> 已保存</> : saving ? '保存中' : '保存'}
        </button>
        <button className="persona-page__btn persona-page__btn--ghost" onClick={handleReset} title="恢复默认设定">
          <RotateCcw size={14} /> 重置
        </button>
      </div>
    </div>
  )
}
