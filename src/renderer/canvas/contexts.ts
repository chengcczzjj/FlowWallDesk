import { createContext } from 'react'

/** 壁纸抽帧 base64 data URL（用于组件毛玻璃背景） */
export const WallpaperFrameCtx = createContext<string | null>(null)

/** 当前组件在画布上的位置（用于毛玻璃偏移对齐） */
export const WidgetPosCtx = createContext<{ x: number; y: number }>({ x: 0, y: 0 })
