/** 壁纸资源描述（来自 assets/wallpaper/*）*/
export interface WallpaperItem {
  /** 文件夹名（唯一 id）*/
  id: string
  /** 显示名 */
  name: string
  /** 主资源（视频/图片/html）绝对路径或自定义协议 URL */
  source: string
  /** 类型：video / image / web */
  type: 'video' | 'image' | 'web'
  /** 预览图（可选）*/
  preview?: string
  /** 原始 FlowWallDeskInfo.json 的额外字段 */
  meta?: Record<string, unknown>
  /** 壁纸独立设置 */
  settings?: WallpaperSettings
}

/** 每个壁纸独立的显示设置 */
export interface WallpaperSettings {
  volume?: number
  speed?: number
  scaling?: string
  flip?: string
}

/** 当前应用中的壁纸状态 */
export interface WallpaperState {
  current?: WallpaperItem
  volume: number
  muted: boolean
}

/** 桌面组件元数据 */
export interface WidgetInstance {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  enabled: boolean
  config?: Record<string, unknown>
}

/* ===== 数据服务类型 ===== */

/** 新闻条目 */
export interface NewsItem {
  index: number
  title: string
  hot?: string
  url?: string
}

/** 股票行情 */
export interface StockItem {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
}

/** 股票代码配置 */
export interface StockSymbol {
  code: string
  name: string
  market: string // '1' = 沪市, '0' = 深市
}

/** API 端点元数据（供 LLM 了解能力和限制） */
export interface ApiEndpointMeta {
  id: string
  name: string
  description: string
  provider: string
  baseUrl: string
  rateLimit: { maxRequests: number; periodMs: number; description: string }
  dataSchema: Record<string, string>
  configurable: { key: string; type: string; description: string; options?: string[] }[]
  currentUsage: { fetchCount: number; lastFetchTime: number | null; errorCount: number }
}
