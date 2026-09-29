import { useId } from 'react'
import type { WallpaperDisplayMode } from '@shared/types'

const LEFT = { x: 1, y: 1.5, width: 13, height: 9.5 }
const RIGHT = { x: 18, y: 1.5, width: 13, height: 9.5 }

/**
 * Two-monitor pictogram for a wallpaper layout: which screens get a picture,
 * whether it is the same picture, and whether one picture spans both.
 */
export function DisplayModeGlyph({ mode, size = 22 }: { mode: WallpaperDisplayMode; size?: number }) {
  const id = useId()
  const clip = `${id}-screens`
  const filled = (side: 'left' | 'right') => mode !== 'primary' || side === 'left'
  const hill = (x: number) => `M${x} 9.4 Q ${x + 3.6} 5.6 ${x + 7.2} 7.6 T ${x + 13} 6.4 V 11 H ${x} Z`

  return (
    <svg
      className="display-mode-glyph"
      width={size}
      height={(size * 17) / 32}
      viewBox="0 0 32 17"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <rect {...LEFT} rx="1.8" />
          <rect {...RIGHT} rx="1.8" />
        </clipPath>
      </defs>
      {[LEFT, RIGHT].map((screen, index) => {
        const side = index === 0 ? 'left' : 'right'
        return filled(side) ? (
          <rect key={side} {...screen} rx="1.8" fill="currentColor" opacity={mode === 'per-display' && side === 'right' ? 0.62 : 0.95} />
        ) : (
          <rect
            key={side}
            x={screen.x + 0.6}
            y={screen.y + 0.6}
            width={screen.width - 1.2}
            height={screen.height - 1.2}
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="2 1.6"
            opacity="0.5"
          />
        )
      })}
      <g clipPath={`url(#${clip})`} fill="var(--glyph-detail, #fff)">
        {mode === 'span' ? (
          <path d="M1 9.2 Q 9 3.8 16 7.2 T 31 5.8 V 11 H 1 Z" opacity="0.9" />
        ) : (
          <>
            <circle cx={LEFT.x + 9.6} cy={LEFT.y + 3} r="1.5" opacity="0.95" />
            <path d={hill(LEFT.x)} opacity="0.9" />
            {mode === 'duplicate' && (
              <>
                <circle cx={RIGHT.x + 9.6} cy={RIGHT.y + 3} r="1.5" opacity="0.95" />
                <path d={hill(RIGHT.x)} opacity="0.9" />
              </>
            )}
            {mode === 'per-display' && (
              <>
                <circle cx={RIGHT.x + 3.4} cy={RIGHT.y + 3.4} r="1.7" opacity="0.95" />
                <path d={`M${RIGHT.x} 11 L ${RIGHT.x + 5} 6.2 L ${RIGHT.x + 8} 8.6 L ${RIGHT.x + 10.4} 6.8 L ${RIGHT.x + 13} 9 V 11 Z`} opacity="0.9" />
              </>
            )}
          </>
        )}
      </g>
      {[LEFT, RIGHT].map((screen) => (
        <path
          key={screen.x}
          d={`M${screen.x + screen.width / 2} 11.4 V 14.2 M${screen.x + screen.width / 2 - 3} 15.2 H ${screen.x + screen.width / 2 + 3}`}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity={filled(screen === LEFT ? 'left' : 'right') ? 0.75 : 0.4}
        />
      ))}
    </svg>
  )
}
