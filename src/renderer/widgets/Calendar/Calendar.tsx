import { useEffect, useState } from 'react'
import { FrostedGlassBackground } from '../FrostedGlassBackground'

export function CalendarWidget() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' })
  const day = now.getDate()
  const monthStr = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
        color: '#1a1a1a',
      }}
    >
      <FrostedGlassBackground />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#c42b1c', marginBottom: 8 }}>
          {weekday}
        </div>
        <div style={{ fontSize: 48, fontWeight: 'bold', lineHeight: 1, marginBottom: 8 }}>{day}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{monthStr}</div>
      </div>
    </div>
  )
}
