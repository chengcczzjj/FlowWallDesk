import { Cat } from 'lucide-react'
import { FrostedGlassBackground } from '../FrostedGlassBackground'

export function PetWidget() {
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
      <FrostedGlassBackground overlayColor="rgba(253,249,243,0.75)" />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <Cat size={48} color="#5C4B3E" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#5C4B3E' }}>桌面萌宠</div>
      </div>
    </div>
  )
}
