import { FrostedGlassBackground } from '../FrostedGlassBackground'
import { PixelPetCanvas } from '@renderer/shared/PixelPetCanvas'
import {
  PIXEL_PET_STATES,
  createDefaultPixelPets,
  normalizePixelPet,
  normalizePixelPetSettings,
  resolvePixelPetPalette,
  type PixelPet,
  type PixelPetSettings,
} from '@renderer/shared/pixel-pet'

export function PetWidget({ config }: { config?: Record<string, unknown> }) {
  const { pet, settings } = readPixelPetWidgetConfig(config)
  const palette = resolvePixelPetPalette(pet, settings.theme)

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
      <FrostedGlassBackground overlayColor="rgba(253,249,243,0.70)" />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.34,
          backgroundImage: `linear-gradient(${palette.inkSoft}22 1px, transparent 1px), linear-gradient(90deg, ${palette.inkSoft}22 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          gap: 6,
        }}
      >
        <PixelPetCanvas pet={pet} settings={settings} width={112} height={90} />
        <div
          style={{
            maxWidth: '86%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 700,
            color: palette.ink,
          }}
        >
          {settings.petName || pet.name}
        </div>
        <div style={{ fontSize: 11, color: palette.inkSoft }}>{PIXEL_PET_STATES[settings.state].label}</div>
      </div>
    </div>
  )
}

function readPixelPetWidgetConfig(config?: Record<string, unknown>): { pet: PixelPet; settings: PixelPetSettings } {
  const defaults = createDefaultPixelPets()
  const fallbackSettings = normalizePixelPetSettings({}, defaults)
  const pixelConfig = isRecord(config?.pixelPet) ? config.pixelPet : {}
  const pet = isRecord(pixelConfig.pet) ? normalizePixelPet(pixelConfig.pet) : defaults[0]
  const settings = normalizePixelPetSettings(isRecord(pixelConfig.settings) ? pixelConfig.settings : fallbackSettings, [pet, ...defaults])
  return {
    pet,
    settings: {
      ...settings,
      petId: pet.id,
      petName: settings.petName || pet.name,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
