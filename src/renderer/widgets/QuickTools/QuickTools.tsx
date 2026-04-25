import { Wrench } from 'lucide-react'
import { FrostedGlassBackground } from '../FrostedGlassBackground'

function ToolIcon({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 6, border: '1px solid rgba(0,0,0,0.08)',
        color: '#1a1a1a',
      }}>
        <Wrench size={18} />
      </div>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
    </div>
  )
}

export function QuickToolsWidget() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      <FrostedGlassBackground />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 20, width: '100%', height: '100%' }}>
        <ToolIcon label="便签" />
        <ToolIcon label="截图" />
        <ToolIcon label="设置" />
        <ToolIcon label="重启" />
      </div>
    </div>
  )
}
