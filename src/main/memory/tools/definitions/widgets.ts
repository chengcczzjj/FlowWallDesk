import { randomUUID } from 'crypto'
import { tool } from 'ai'
import { z } from 'zod'
import type { WidgetInstance } from '@shared/types'
import { DEFAULT_WIDGET_SIZE_BY_TYPE, WIDGET_TYPES, type WidgetTypeId } from '@shared/desktop-scene'
import { GENERATED_WIDGET_THEMES, type GeneratedWidgetBlock, type GeneratedWidgetDefinition } from '@shared/generated-widget'
import { normalizeStockSymbols } from '@shared/stock-symbols'
import {
  addWidgetForTool,
  listWidgetsForTool,
  removeWidgetForTool,
  updateWidgetConfigForTool,
} from '../../../ipc/widgetIpc'

function summarizeWidget(widget: WidgetInstance) {
  return {
    id: widget.id,
    type: widget.type,
    x: widget.x,
    y: widget.y,
    width: widget.width,
    height: widget.height,
    enabled: widget.enabled,
    config: widget.config ?? {},
  }
}

function createWidget(type: WidgetTypeId, config?: Record<string, unknown>): WidgetInstance {
  const size = DEFAULT_WIDGET_SIZE_BY_TYPE[type]
  return {
    id: `${type}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    type,
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    enabled: true,
    config: config ?? {},
  }
}

export const listWidgetsTool = tool({
  description: '查看当前桌面上已经放置的组件。用户问桌面上有什么组件、想调整某个组件前使用。',
  inputSchema: z.object({}),
  execute: async () => {
    const widgets = listWidgetsForTool()
    return {
      ok: true,
      count: widgets.length,
      widgets: widgets.map(summarizeWidget),
    }
  },
})

export const addWidgetTool = tool({
  description: '把一个内置桌面组件添加到桌面。实时股票必须使用 type=stocks，并在 stockSymbols 中传入 A 股代码；不要用 generated-widget 伪造静态行情。',
  inputSchema: z.object({
    type: z.enum(WIDGET_TYPES).describe('组件类型。股票/行情/自选股用 stocks；便签和文字用 text；天气用 weather；日历用 calendar。'),
    config: z.record(z.string(), z.unknown()).optional().describe('通用配置。text 可传 { text, author }；news 可传 { source, maxItems, refreshInterval }。'),
    stockSymbols: z.array(z.object({
      code: z.string().regex(/^\d{6}$/).describe('六位 A 股或指数代码，例如 600519。'),
      name: z.string().min(1).max(40).optional(),
      market: z.enum(['0', '1']).optional().describe('可省略；1=沪市，0=深市。'),
    })).min(1).max(6).optional().describe('仅 type=stocks 使用。必须根据用户指定的股票填写，不确定股票时先询问，不要猜。'),
  }),
  execute: async ({ type, config, stockSymbols }) => {
    let normalizedConfig = config ?? {}
    if (type === 'stocks') {
      const legacyCandidates = normalizedConfig.symbols
        ?? normalizedConfig.stocks
        ?? normalizedConfig.stockCodes
        ?? normalizedConfig.symbol
      const symbols = normalizeStockSymbols(stockSymbols ?? legacyCandidates)
      if (symbols.length === 0) {
        return {
          ok: false,
          added: false,
          reason: 'stock-symbols-required',
          message: '请先询问用户要添加的 A 股名称或六位代码，再重试创建股票组件。',
        }
      }
      const refreshInterval = typeof normalizedConfig.refreshInterval === 'number'
        ? Math.max(10, Math.min(3600, Math.round(normalizedConfig.refreshInterval)))
        : 30
      normalizedConfig = { ...normalizedConfig, symbols, refreshInterval }
    }

    const result = addWidgetForTool(createWidget(type, normalizedConfig))
    return {
      ok: result.ok,
      added: result.added,
      reason: result.reason,
      widget: summarizeWidget(result.widget),
      count: result.list.length,
    }
  },
})

const generatedBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(500), style: z.enum(['body', 'caption', 'headline', 'quote']).optional(), align: z.enum(['left', 'center', 'right']).optional() }),
  z.object({ type: z.literal('metric'), label: z.string().min(1).max(60), value: z.string().min(1).max(80), unit: z.string().max(20).optional(), trend: z.string().max(80).optional() }),
  z.object({ type: z.literal('progress'), label: z.string().min(1).max(60), value: z.number(), max: z.number().positive().max(1_000_000).optional(), detail: z.string().max(80).optional() }),
  z.object({ type: z.literal('list'), title: z.string().max(80).optional(), items: z.array(z.object({ text: z.string().min(1).max(160), done: z.boolean().optional() })).min(1).max(12), interactive: z.boolean().optional() }),
  z.object({ type: z.literal('clock'), format: z.enum(['time', 'date', 'datetime']).optional(), locale: z.enum(['zh-CN', 'en-US']).optional(), showSeconds: z.boolean().optional() }),
  z.object({ type: z.literal('countdown'), label: z.string().min(1).max(80), targetAt: z.string().min(1).max(80), completedText: z.string().max(80).optional() }),
  z.object({ type: z.literal('divider') }),
])

export const createGeneratedWidgetTool = tool({
  description: '生成静态或本地交互的个性化组件，适用于清单、目标进度、倒计时和组合信息卡。不得用于股票、天气、新闻等实时数据；这些场景必须使用对应内置组件。',
  inputSchema: z.object({
    name: z.string().min(1).max(60).describe('组件内部名称。'),
    title: z.string().min(1).max(80).describe('显示在组件顶部的标题。'),
    subtitle: z.string().max(140).optional(),
    theme: z.enum(GENERATED_WIDGET_THEMES).default('glass'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffb86b'),
    width: z.number().min(220).max(760).default(360),
    height: z.number().min(120).max(720).default(260),
    blocks: z.array(generatedBlockSchema).min(1).max(12).describe('从上到下显示的内容积木。清单设置 interactive=true 后可以直接在桌面勾选。'),
  }),
  execute: async ({ name, title, subtitle, theme, accent, width, height, blocks }) => {
    const normalizedBlocks = blocks.map((block, blockIndex): GeneratedWidgetBlock => {
      if (block.type !== 'list') return block
      return {
        ...block,
        items: block.items.map((item, itemIndex) => ({
          id: `item-${blockIndex}-${itemIndex}-${randomUUID().slice(0, 6)}`,
          text: item.text,
          done: item.done,
        })),
      }
    })
    const definition: GeneratedWidgetDefinition = {
      version: 1,
      name,
      title,
      subtitle,
      theme,
      accent,
      blocks: normalizedBlocks,
      generatedAt: Date.now(),
    }
    const widget = createWidget('generated-widget', { definition })
    widget.width = width
    widget.height = height
    const result = addWidgetForTool(widget)
    return {
      ok: result.ok,
      added: result.added,
      reason: result.reason,
      widget: summarizeWidget(result.widget),
      definition,
      count: result.list.length,
    }
  },
})

export const updateWidgetConfigTool = tool({
  description: '修改桌面上已有组件的配置，例如修改文字组件内容、新闻源、天气组件配置等。可以用组件 id，或在只有一个同类型组件时用 type。',
  inputSchema: z.object({
    id: z.string().optional().describe('组件 id。已知具体组件时优先使用。'),
    type: z.enum(WIDGET_TYPES).optional().describe('组件类型。没有 id 时可用类型定位已有组件。'),
    config: z.record(z.string(), z.unknown()).describe('要合并到组件上的配置。'),
  }),
  execute: async ({ id, type, config }) => {
    const result = updateWidgetConfigForTool({ id, type, config })
    return {
      ok: result.ok,
      error: result.error,
      widget: result.widget ? summarizeWidget(result.widget) : undefined,
      count: result.list.length,
    }
  },
})

export const removeWidgetTool = tool({
  description: '从桌面移除一个组件。可以用组件 id，或在只有一个同类型组件时用 type。',
  inputSchema: z.object({
    id: z.string().optional().describe('组件 id。已知具体组件时优先使用。'),
    type: z.enum(WIDGET_TYPES).optional().describe('组件类型。没有 id 时可用类型定位已有组件。'),
  }),
  execute: async ({ id, type }) => {
    const result = await removeWidgetForTool({ id, type })
    return {
      ok: result.ok,
      deleted: result.deleted,
      error: result.error,
      count: result.list.length,
    }
  },
})
