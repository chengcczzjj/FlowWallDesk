/**
 * API 注册表 — 记录所有外部数据源的能力、限制和使用统计
 *
 * 设计目标：
 * 1. 供未来接入的大语言模型（LLM）查阅，了解可操作的数据源及约束
 * 2. 集中管理所有 API 元数据，方便扩展新数据源
 * 3. 运行时跟踪调用量、错误率，为智能调度提供依据
 */
import type { ApiEndpointMeta } from '@shared/types'
import { NEWS_SOURCES, newsUsage } from './news-service'
import { stocksUsage } from './stocks-service'

/**
 * 获取完整的 API 注册表快照
 * LLM 可通过此接口了解：
 *   - 有哪些数据源
 *   - 每个数据源的调用频率限制
 *   - 返回数据的字段说明
 *   - 可配置的参数及取值范围
 *   - 当前的调用统计（帮助 LLM 判断是否接近限流）
 */
export function getApiRegistry(): ApiEndpointMeta[] {
  return [
    {
      id: 'news-hotlist',
      name: '热搜新闻',
      description:
        '获取各平台热搜新闻列表。' +
        '可选来源：' + Object.entries(NEWS_SOURCES).map(([k, v]) => `${k}(${v.name})`).join('、') + '。' +
        '数据每分钟缓存一次，重复请求不消耗配额。',
      provider: 'codelife.cc / weibo.com',
      baseUrl: 'https://api.codelife.cc/api/top/list',
      rateLimit: {
        maxRequests: 120,
        periodMs: 3_600_000,
        description: '建议每小时不超过 120 次（含所有来源），服务端无硬性限制但高频会被临时封禁',
      },
      dataSchema: {
        index: 'number — 排名序号',
        title: 'string — 新闻/热搜标题',
        hot: 'string — 热度值（部分来源可能为空）',
        url: 'string — 原文链接（可在浏览器打开）',
      },
      configurable: [
        {
          key: 'source',
          type: 'enum',
          description: '数据来源平台',
          options: Object.keys(NEWS_SOURCES),
        },
        {
          key: 'refreshInterval',
          type: 'number',
          description: '自动刷新间隔（分钟），建议 ≥5',
          options: ['5', '10', '30', '60'],
        },
        {
          key: 'maxItems',
          type: 'number',
          description: '显示条数（1-20）',
          options: ['3', '5', '8', '10'],
        },
      ],
      currentUsage: { ...newsUsage },
    },
    {
      id: 'stocks-realtime',
      name: '股票实时行情',
      description:
        '获取 A 股个股及指数的实时行情（最新价、涨跌额、涨跌幅）。' +
        '通过 secid 参数指定股票列表，格式为 "市场.代码"（1=沪市, 0=深市）。' +
        '数据 10 秒缓存一次。交易时段外返回收盘价。',
      provider: '东方财富 push2 API',
      baseUrl: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
      rateLimit: {
        maxRequests: 360,
        periodMs: 3_600_000,
        description: '建议每小时不超过 360 次（即 ≥10 秒/次），无需 API Key，高频可能被限速',
      },
      dataSchema: {
        code: 'string — 股票代码（如 600519）',
        name: 'string — 股票名称（如 贵州茅台）',
        price: 'number | null — 最新价；停牌或暂无报价时为 null',
        change: 'number | null — 涨跌额（正=涨, 负=跌）',
        changePercent: 'number | null — 涨跌幅（%，正=涨, 负=跌）',
      },
      configurable: [
        {
          key: 'symbols',
          type: 'array<{code, name, market}>',
          description: '自选股列表。market: "1"=沪市(6/5/9开头), "0"=深市(0/2/3开头)',
        },
        {
          key: 'refreshInterval',
          type: 'number',
          description: '自动刷新间隔（秒），建议 ≥10',
          options: ['10', '30', '60'],
        },
      ],
      currentUsage: { ...stocksUsage },
    },
  ]
}
