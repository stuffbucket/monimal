import {
  Dialog,
} from '@maximal/maximal-electron/renderer'
import { X } from 'lucide-react'
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactElement,
} from 'react'

interface Hsv {
  hue: number
  saturation: number
  value: number
}

function hexToHsv(hex: string): Hsv {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2)
    else hue = 60 * (((red - green) / delta) + 4)
  }
  if (hue < 0) hue += 360
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  }
}

function hsvToHex({ hue, saturation, value }: Hsv): string {
  const chroma = value * saturation
  const segment = hue / 60
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
  const offset = value - chroma
  const [red, green, blue] = segment < 1
    ? [chroma, secondary, 0]
    : segment < 2
      ? [secondary, chroma, 0]
      : segment < 3
        ? [0, chroma, secondary]
        : segment < 4
          ? [0, secondary, chroma]
          : segment < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255)
      .toString(16).padStart(2, '0'))
    .join('')}`
}

export function TerminalColorPicker({
  label,
  value,
  testId,
  onPreview,
  onCommit,
}: {
  label: string
  value: string
  testId: string
  onPreview: (value: string) => void
  onCommit: (value: string) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [text, setText] = useState(value.toUpperCase())
  const committedValue = useRef(value)

  const update = (next: Hsv, commit: boolean): void => {
    const hex = hsvToHex(next)
    setHsv(next)
    setText(hex.toUpperCase())
    onPreview(hex)
    if (commit) {
      committedValue.current = hex
      onCommit(hex)
    }
  }
  const close = (): void => {
    onPreview(committedValue.current)
    setOpen(false)
  }
  const updateSaturationValue = (
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ): void => {
    const bounds = event.currentTarget.getBoundingClientRect()
    update({
      ...hsv,
      saturation: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      value: Math.min(1, Math.max(0, 1 - ((event.clientY - bounds.top) / bounds.height))),
    }, commit)
  }
  const commitText = (): void => {
    if (/^#[0-9a-f]{6}$/iu.test(text)) {
      const normalized = text.toLowerCase()
      setHsv(hexToHsv(normalized))
      onPreview(normalized)
      committedValue.current = normalized
      onCommit(normalized)
    } else {
      setText(value.toUpperCase())
    }
  }

  return (
    <>
      <button
        type="button"
        className="terminal-color-picker__trigger"
        aria-label={`${label} color`}
        style={{ backgroundColor: value }}
        onClick={() => {
          committedValue.current = value
          setHsv(hexToHsv(value))
          setText(value.toUpperCase())
          setOpen(true)
        }}
        data-testid={testId}
      />
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true)
          else close()
        }}
        title={`${label} color`}
        className="terminal-color-picker"
        testId={`${testId}-dialog`}
      >
        <div className="terminal-color-picker__header">
          <strong>Custom color</strong>
          <button
            type="button"
            className="terminal-color-picker__close"
            aria-label="Close color picker"
            onClick={close}
            data-testid={`${testId}-close`}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div
          className="terminal-color-picker__saturation"
          style={{
            '--terminal-picker-hue': `hsl(${String(hsv.hue)} 100% 50%)`,
          } as CSSProperties}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            updateSaturationValue(event, false)
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateSaturationValue(event, false)
            }
          }}
          onPointerUp={(event) => {
            updateSaturationValue(event, true)
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          data-testid={`${testId}-saturation`}
        >
          <span
            style={{
              left: `${String(hsv.saturation * 100)}%`,
              top: `${String((1 - hsv.value) * 100)}%`,
            }}
          />
        </div>
        <label className="terminal-color-picker__hue">
          <span>Hue</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={Math.round(hsv.hue)}
            aria-label={`${label} hue`}
            onChange={(event) => update({
              ...hsv,
              hue: Number(event.currentTarget.value),
            }, false)}
            onPointerUp={(event) => update({
              ...hsv,
              hue: Number(event.currentTarget.value),
            }, true)}
            onKeyUp={(event) => update({
              ...hsv,
              hue: Number(event.currentTarget.value),
            }, true)}
          />
        </label>
        <label className="terminal-color-picker__value">
          <span>Hex</span>
          <input
            value={text}
            aria-label={`${label} hex color`}
            spellCheck={false}
            onChange={(event) => {
              const next = event.currentTarget.value
              setText(next)
              if (/^#[0-9a-f]{6}$/iu.test(next)) {
                const normalized = next.toLowerCase()
                setHsv(hexToHsv(normalized))
                onPreview(normalized)
              }
            }}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitText()
                event.currentTarget.select()
              }
            }}
            data-testid={`${testId}-hex`}
          />
          <output>{text.toUpperCase()}</output>
        </label>
      </Dialog>
    </>
  )
}
