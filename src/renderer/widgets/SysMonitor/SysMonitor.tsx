import { FrostedGlassBackground } from '../FrostedGlassBackground'

export function SysMonitorWidget() {
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
        fontSize: 12,
      }}
    >
      <FrostedGlassBackground />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 20, width: '100%', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontWeight: 600 }}>
        <span>CPU Util</span>
        <span>34%</span>
      </div>
      <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.08)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: '34%', height: '100%', background: '#0078d4' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontWeight: 600 }}>
        <span>Memory</span>
        <span>12.4 GB / 32.0 GB</span>
      </div>
      <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ width: '40%', height: '100%', background: '#f0a030' }} />
      </div>
      </div>
    </div>
  )
}
