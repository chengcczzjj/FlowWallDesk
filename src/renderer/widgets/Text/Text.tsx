export function TextWidget({ config }: { config?: Record<string, unknown> }) {
  const text = (config?.text as string) || '\u201CStay Hungry, Stay Foolish.\u201D'
  const author = (config?.author as string) || '— Steve Jobs'
  const isPreview = !!(config?._preview)

  const textColor = isPreview ? '#e0e0e0' : '#fff'
  const shadowColor = isPreview ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.6)'
  const authorShadow = isPreview ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 600, color: textColor, textShadow: `0 2px 8px ${shadowColor}`, lineHeight: 1.3 }}>{text}</div>
      <div style={{ fontSize: 14, opacity: 0.6, marginTop: 12, color: textColor, textShadow: `0 1px 4px ${authorShadow}` }}>{author}</div>
    </div>
  )
}
