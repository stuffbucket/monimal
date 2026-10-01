import {
  terminalFontFeatureSettings,
  terminalFontVariationSettings,
  terminalThickenStrokeEm,
  type TerminalTypography,
} from '@maximal/maximal-terminal/renderer'
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'

const PREVIEW_WIDTH = 1200
const PREVIEW_HEIGHT = 620
const MAX_RASTER_SCALE = 4
const RAMP_CACHE_LIMIT = 64
const rampCache = new Map<string, string>()

export function previewRasterScale(devicePixelRatio: number): number {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, MAX_RASTER_SCALE)
    : 1
}

export function thickenStrokeWidth(size: number, strength: number): number {
  return size * terminalThickenStrokeEm(strength)
}

function canvasFont(
  size: number,
  weight: number,
  family: string,
): string {
  const resolved = family === 'ui-monospace'
    ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
    : JSON.stringify(family)
  return `${String(weight)} ${String(size)}px ${resolved}`
}

export function drawSample(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  typography: TerminalTypography,
  size: number,
  weight: number,
): void {
  context.font = canvasFont(size, weight, typography.fontFamily)
  context.fillStyle = '#f2ead3'
  if ('letterSpacing' in context) {
    context.letterSpacing = `${String(typography.tracking / 100)}em`
  }
  const shiftedY = y - (size * typography.baseline / 100)
  if (typography.thicken) {
    context.strokeStyle = '#f2ead3'
    context.lineWidth = thickenStrokeWidth(size, typography.thickenStrength)
    context.lineJoin = 'round'
    context.miterLimit = 2
    context.strokeText(text, x, shiftedY)
  }
  context.fillText(text, x, shiftedY)
}

function createRampPng(
  typography: TerminalTypography,
  rasterScale: number,
): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(PREVIEW_WIDTH * rasterScale)
  canvas.height = Math.ceil(PREVIEW_HEIGHT * rasterScale)
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.scale(rasterScale, rasterScale)

  context.fillStyle = '#181713'
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  const gradient = context.createLinearGradient(960, 0, PREVIEW_WIDTH, 160)
  gradient.addColorStop(0, '#9d7cff')
  gradient.addColorStop(0.5, '#51a8b8')
  gradient.addColorStop(1, '#e5ad45')
  context.fillStyle = gradient
  context.fillRect(960, 24, 210, 54)
  context.fillStyle = '#111318'
  context.font = '600 17px ui-monospace, monospace'
  context.fillText('KITTY GRAPHICS', 990, 58)

  context.fillStyle = '#968d78'
  context.font = '600 19px ui-monospace, monospace'
  context.fillText('TERMINAL TYPOGRAPHY', 30, 48)
  context.font = '500 16px ui-monospace, monospace'
  context.fillText(
    `${String(typography.fontSize)}pt  wght ${String(typography.fontWeight)}  leading ${String(typography.cellHeight)}%  tracking ${String(typography.tracking)}%  baseline ${String(typography.baseline)}%`,
    300,
    48,
  )
  context.font = '500 18px ui-monospace, monospace'
  context.fillText('TYPE RAMP', 30, 96)
  const sizes = [12, 14, 16, 18, 22, 28]
  let y = 138
  for (const size of sizes) {
    context.fillStyle = '#968d78'
    context.font = '500 17px ui-monospace, monospace'
    context.fillText(`${String(size)}pt`, 30, y)
    drawSample(
      context,
      '00 1lI rn/m 5S 8B   Hamburgefontsiv 001lI',
      110,
      y,
      typography,
      size,
      typography.fontWeight,
    )
    y += size * (1.55 + typography.cellHeight / 100)
  }

  context.fillStyle = '#968d78'
  context.font = '500 18px ui-monospace, monospace'
  context.fillText(
    `CURRENT SETTING  ${String(typography.fontSize)}pt / ${String(typography.fontWeight)}`,
    30,
    342,
  )
  drawSample(
    context,
    'Hamburgefontsiv  Aa0  1lI  rn/m  {} => !=',
    30,
    394,
    typography,
    typography.fontSize * (96 / 72),
    typography.fontWeight,
  )

  context.fillStyle = '#968d78'
  context.font = '500 18px ui-monospace, monospace'
  context.fillText('WEIGHT RAMP', 30, 438)
  const weights = [50, 275, 525, 750, 1000]
  for (const [index, weight] of weights.entries()) {
    const x = 30 + (index * 230)
    context.fillStyle = weight === typography.fontWeight ? '#e5ad45' : '#968d78'
    context.font = '500 17px ui-monospace, monospace'
    context.fillText(
      `${weight === typography.fontWeight ? '>' : ' '} ${String(weight)}`,
      x,
      486,
    )
    drawSample(
      context,
      'Aa0 {} => !=',
      x,
      538,
      typography,
      22,
      weight,
    )
  }

  return canvas.toDataURL('image/png')
}

function rampCacheKey(
  typography: TerminalTypography,
  rasterScale: number,
): string {
  return JSON.stringify([
    rasterScale,
    typography.fontFamily,
    typography.fontSize,
    typography.fontWeight,
    typography.cellHeight,
    typography.tracking,
    typography.baseline,
    typography.thicken,
    typography.thickenStrength,
    typography.ligatures,
    typography.fontFeatures,
  ])
}

function cacheRamp(key: string, source: string): void {
  rampCache.delete(key)
  rampCache.set(key, source)
  if (rampCache.size <= RAMP_CACHE_LIMIT) return
  const oldest = rampCache.keys().next().value
  if (oldest !== undefined) rampCache.delete(oldest)
}

async function renderRampPng(
  typography: TerminalTypography,
  rasterScale: number,
): Promise<string | null> {
  if (document.fonts !== undefined) {
    await document.fonts.load(canvasFont(
      typography.fontSize * (96 / 72),
      typography.fontWeight,
      typography.fontFamily,
    ))
  }
  return createRampPng(typography, rasterScale)
}

export function variationSampleStyle(
  typography: TerminalTypography,
): CSSProperties {
  const fontSizePixels = typography.fontSize * (96 / 72)
  const stroke = Number(terminalThickenStrokeEm(
    typography.thickenStrength,
  ).toFixed(4))
  return {
    fontFamily: typography.fontFamily === 'ui-monospace'
      ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
      : typography.fontFamily,
    fontSize: `${String(fontSizePixels)}px`,
    fontWeight: typography.fontWeight,
    fontOpticalSizing: 'auto',
    fontVariationSettings: terminalFontVariationSettings(typography),
    fontFeatureSettings: terminalFontFeatureSettings(typography),
    fontVariantLigatures: typography.ligatures ? 'normal' : 'none',
    letterSpacing: `${String(typography.tracking / 100)}em`,
    lineHeight: 1.2 * (1 + typography.cellHeight / 100),
    position: 'relative',
    top: `${String(-typography.baseline / 100)}em`,
    WebkitTextStroke: typography.thicken && typography.thickenStrength > 0
      ? `${String(stroke)}em currentColor`
      : '0 currentColor',
  }
}

function usePreviewRasterScale(): number {
  const [rasterScale, setRasterScale] = useState(
    () => previewRasterScale(window.devicePixelRatio),
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      const update = (): void => {
        setRasterScale(previewRasterScale(window.devicePixelRatio))
      }
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    let resolution = window.matchMedia(
      `(resolution: ${String(window.devicePixelRatio)}dppx)`,
    )
    const update = (): void => {
      setRasterScale(previewRasterScale(window.devicePixelRatio))
      resolution.removeEventListener('change', update)
      resolution = window.matchMedia(
        `(resolution: ${String(window.devicePixelRatio)}dppx)`,
      )
      resolution.addEventListener('change', update)
    }
    resolution.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      resolution.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return rasterScale
}

function CompactTypographyPreview({
  typography,
}: {
  typography: TerminalTypography | null
}): ReactElement {
  return (
    <div
      className="terminal-typography-preview terminal-typography-preview--compact"
      aria-label="Live terminal typography preview"
    >
      {typography === null ? (
        <div className="terminal-typography-preview__placeholder" role="status">
          Loading terminal preview…
        </div>
      ) : (
        <div className="terminal-typography-preview__proof">
          <span className="terminal-typography-preview__proof-label">
            LIVE PROOF / {String(typography.fontSize)}PT
          </span>
          <strong style={variationSampleStyle(typography)}>
            Hamburgefontsiv
          </strong>
          <span style={variationSampleStyle(typography)}>
            Aa Bb Gg 00 1lI rn/m {'{}'} =&gt; !=
          </span>
        </div>
      )}
    </div>
  )
}

export function TerminalTypographyPreview({
  typography,
  compact = false,
}: {
  typography: TerminalTypography | null
  compact?: boolean
}): ReactElement {
  const rasterScale = usePreviewRasterScale()
  const key = useMemo(
    () => typography === null
      ? null
      : rampCacheKey(typography, rasterScale),
    [rasterScale, typography],
  )
  const [source, setSource] = useState<string | null>(
    () => key === null ? null : (rampCache.get(key) ?? null),
  )
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const cachedSource = key === null ? undefined : rampCache.get(key)
  const displayedSource = cachedSource ?? source
  const failed = key !== null && failedKey === key
  const rendering = !compact
    && key !== null
    && cachedSource === undefined
    && !failed

  useEffect(() => {
    if (compact || typography === null || key === null) return
    const cached = rampCache.get(key)
    if (cached !== undefined) return
    let active = true
    const timer = window.setTimeout(() => {
      void renderRampPng(typography, rasterScale).then(
        (next) => {
          if (!active) return
          if (next === null) {
            setFailedKey(key)
            return
          }
          cacheRamp(key, next)
          setFailedKey(null)
          setSource(next)
        },
        () => {
          if (!active) return
          setFailedKey(key)
        },
      )
    }, 32)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [compact, key, rasterScale, typography])

  if (compact) return <CompactTypographyPreview typography={typography} />

  return (
    <div
      className="terminal-typography-preview"
      aria-label="Live terminal typography preview"
      aria-busy={rendering}
    >
      {displayedSource === null || displayedSource === undefined ? (
        <div
          className="terminal-typography-preview__placeholder"
          role="status"
        >
          {failed
            ? 'Live terminal preview unavailable.'
            : 'Rendering terminal preview…'}
        </div>
      ) : (
        <img
          className="terminal-typography-preview__image"
          src={displayedSource}
          alt="Terminal typography type and weight ramp"
        />
      )}
      {typography !== null
      && (
        Object.keys(typography.fontVariations).length > 0
        || Object.keys(typography.fontFeatures ?? {}).length > 0
      ) ? (
        <div className="terminal-typography-preview__variation">
          <span className="terminal-typography-preview__variation-label">
            LIVE FONT SETTINGS
          </span>
          <span
            className="terminal-typography-preview__variation-sample"
            style={variationSampleStyle(typography)}
          >
            Hamburgefontsiv Aa0 1lI rn/m {'{}'} =&gt; !=
          </span>
        </div>
        ) : null}
    </div>
  )
}
