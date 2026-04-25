import { useEffect, useRef, useState, useCallback } from 'react'
import { COLOR_THEMES } from '../shared/constants'

const generateSimulatedAudio = (time: number, length = 128): number[] => {
  const data = new Array(length).fill(0)
  const t = time * 0.001
  const beatPhase = (t * 2) % 1
  const beatIntensity = Math.pow(Math.max(0, 1 - beatPhase * 3), 2)
  const offBeatPhase = ((t * 2) + 0.5) % 1
  const offBeatIntensity = Math.pow(Math.max(0, 1 - offBeatPhase * 4), 2) * 0.5
  const melodyWave = Math.sin(t * 1.5) * 0.3 + 0.5

  for (let i = 0; i < length; i++) {
    const freqRatio = i / length
    let value = 0
    if (freqRatio < 0.15) {
      const bassFreq = Math.sin(t * 3 + i * 0.5) * 0.2
      value = (beatIntensity * 0.8 + bassFreq + 0.2) * (1 - freqRatio * 3)
    } else if (freqRatio < 0.5) {
      const melody1 = Math.sin(t * 2.5 + i * 0.3) * 0.25
      const melody2 = Math.sin(t * 4 + i * 0.15) * 0.15
      value = (melody1 + melody2 + melodyWave * 0.4) * (1 - freqRatio * 0.8) + offBeatIntensity * 0.3
    } else if (freqRatio < 0.75) {
      const harmony = Math.sin(t * 3 + i * 0.2) * 0.2
      const vocal = Math.sin(t * 5 + i * 0.1) * 0.15 * melodyWave
      value = (harmony + vocal + 0.15) * (1 - freqRatio * 0.6)
    } else {
      const hihat = (beatPhase < 0.1 || offBeatPhase < 0.08) ? 0.3 : 0.05
      const shimmer = Math.sin(t * 8 + i * 0.4) * 0.1
      value = (hihat + shimmer + 0.05) * (1 - freqRatio)
    }
    value += (Math.random() - 0.5) * 0.05
    data[i] = Math.max(0, Math.min(1, value))
  }
  return data
}

const hexToRgba = (hex: string, alpha: number) => {
  let r = 0, g = 0, b = 0
  if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16) }
  else if (hex.length === 7) { r = parseInt(hex.substring(1, 3), 16); g = parseInt(hex.substring(3, 5), 16); b = parseInt(hex.substring(5, 7), 16) }
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * 镜像频率映射 — 把频率数据从中间向两侧展开。
 * 中间 = 低频（能量最大），两侧 = 高频（能量递减）。
 * 返回 barsCount 个归一化值 (0-1)，中心最高两侧递减。
 */
function mirrorFrequencyMap(audioData: number[], barsCount: number): number[] {
  const totalBins = audioData.length
  if (totalBins === 0) return new Array(barsCount).fill(0)

  // 先按频段分组取平均
  const halfBars = Math.ceil(barsCount / 2)
  const halfData: number[] = []
  for (let i = 0; i < halfBars; i++) {
    const startBin = Math.floor((i / halfBars) * totalBins)
    const endBin = Math.max(startBin + 1, Math.floor(((i + 1) / halfBars) * totalBins))
    let sum = 0, count = 0
    for (let b = startBin; b < endBin && b < totalBins; b++) {
      sum += audioData[b]
      count++
    }
    halfData.push(count > 0 ? sum / count : 0)
  }

  // 镜像：中心=低频，两侧=高频
  const result = new Array(barsCount).fill(0)
  const center = Math.floor(barsCount / 2)
  for (let i = 0; i < halfBars; i++) {
    const value = halfData[i]
    // i=0 是低频 → 放中间，i越大越高频 → 放两侧
    if (center + i < barsCount) result[center + i] = value
    if (center - i >= 0) result[center - i] = value
  }
  return result
}

interface AudioWidgetProps {
  config?: Record<string, unknown>
}

export function AudioWidget({ config }: AudioWidgetProps) {
  const style = (config?.style as string) || 'bars'
  const themeId = (config?.themeId as string) || 'white'
  const opacity = (config?.opacity as number) ?? 1

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const simulatedTimeRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [useSystem, setUseSystem] = useState(false)

  // 获取容器实际像素尺寸
  const getCanvasSize = useCallback(() => {
    if (containerRef.current) {
      return { w: containerRef.current.offsetWidth, h: containerRef.current.offsetHeight }
    }
    return { w: 300, h: 150 }
  }, [])

  // 尝试捕获系统音频
  useEffect(() => {
    let cancelled = false
    const initSystemAudio = async () => {
      try {
        // Electron 中通过 getDisplayMedia 获取系统回环音频
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: { width: 1, height: 1, frameRate: 1 },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        // 停掉视频轨（只需要音频）
        stream.getVideoTracks().forEach(t => t.stop())
        const audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser
        streamRef.current = stream
        setUseSystem(true)
      } catch {
        // 失败时回退到模拟数据
        setUseSystem(false)
      }
    }
    initSystemAudio()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      analyserRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bufferLength = 128

    const renderFrame = () => {
      animationFrameRef.current = requestAnimationFrame(renderFrame)

      // 每帧读取容器实际尺寸，使 canvas 自适应
      const { w, h } = getCanvasSize()
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const centerY = h / 2

      let audioData: number[]
      if (useSystem && analyserRef.current) {
        const raw = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(raw)
        audioData = Array.from(raw.slice(0, bufferLength)).map(v => v / 255)
      } else {
        simulatedTimeRef.current += 16
        audioData = generateSimulatedAudio(simulatedTimeRef.current, bufferLength)
      }

      ctx.clearRect(0, 0, w, h)

      if (themeId) {
        const theme = COLOR_THEMES.find(t => t.id === themeId) || COLOR_THEMES[0]
        let colorStart = theme.base
        let colorEnd = theme.base
        const gradientMatch = theme.textGradient.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/g)
        if (gradientMatch && gradientMatch.length >= 2) { colorStart = gradientMatch[0]; colorEnd = gradientMatch[1] }
        else if (gradientMatch && gradientMatch.length === 1) { colorStart = gradientMatch[0]; colorEnd = gradientMatch[0] }
        const gradient = ctx.createLinearGradient(0, h, 0, 0)
        gradient.addColorStop(0, hexToRgba(colorStart, 1))
        gradient.addColorStop(1, hexToRgba(colorEnd, 0.2))
        ctx.fillStyle = gradient
        ctx.strokeStyle = gradient
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#ffffff'
      }

      if (style === 'bars') {
        const barsCount = 64
        const mapped = mirrorFrequencyMap(audioData, barsCount)
        const gap = 2
        const barWidth = (w - (barsCount - 1) * gap) / barsCount
        for (let i = 0; i < barsCount; i++) {
          const value = mapped[i]
          if (value < 0.04) continue
          const barHeight = value * h
          const x = i * (barWidth + gap)
          if (typeof (ctx as unknown as Record<string, unknown>).roundRect === 'function') {
            ctx.beginPath()
            ;(ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number[]) => void }).roundRect(x, h - barHeight, barWidth, barHeight, [2, 2, 0, 0])
            ctx.fill()
          } else {
            ctx.fillRect(x, h - barHeight, barWidth, barHeight)
          }
        }
      } else if (style === 'wave') {
        const barsCount = 128
        const mapped = mirrorFrequencyMap(audioData, barsCount)
        ctx.lineWidth = 2
        ctx.beginPath()
        const sliceWidth = w / barsCount
        for (let i = 0; i < barsCount; i++) {
          const v = mapped[i] * 2
          const y = Math.max(0, Math.min(v * h / 2, h))
          const x = i * sliceWidth
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h / 2)
        ctx.stroke()
      } else if (style === 'spectrum') {
        const barsCount = 128
        const mapped = mirrorFrequencyMap(audioData, barsCount)
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let i = 0; i < barsCount; i++) {
          const barHeight = mapped[i] * h * 0.95
          const x = (i / barsCount) * w
          const y = Math.max(0, h - barHeight)
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.globalAlpha = 0.5
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.stroke()
      } else if (style === 'dna') {
        const bars = 40
        const mapped = mirrorFrequencyMap(audioData, bars)
        const gap = 4
        const bw = (w - (bars - 1) * gap) / bars
        for (let i = 0; i < bars; i++) {
          const bh = mapped[i] * (h / 2) * 0.85
          const x = i * (bw + gap)
          ctx.fillRect(x, centerY - bh - 2, bw, bh)
          ctx.fillRect(x, centerY + 2, bw, bh)
        }
      }
    }
    renderFrame()
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [useSystem, style, themeId, opacity, getCanvasSize])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: opacity,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  )
}
