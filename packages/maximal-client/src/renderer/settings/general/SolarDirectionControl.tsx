import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'

import {
  solarLightDirection,
  type MaterialPreference,
} from '../../material-preference'

type SolarAxisStyle = CSSProperties & { '--solar-angle': number }

function normalizedOffset(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180
}

function markerPosition(direction: Float32Array): {
  left: string
  top: string
} {
  const length = Math.hypot(direction[0] ?? 0, direction[1] ?? -1) || 1
  const radius = 42
  return {
    left: `${String(50 + ((direction[0] ?? 0) / length) * radius)}%`,
    top: `${String(50 + ((direction[1] ?? -1) / length) * radius)}%`,
  }
}

export function SolarDirectionControl({
  material,
  disabled,
  onChange,
}: {
  material: MaterialPreference
  disabled: boolean
  onChange: (offset: number) => void
}): ReactElement {
  const dialRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef(material.solarFacingOffset)
  const [draftOffset, setDraftOffset] = useState(material.solarFacingOffset)
  const calculated = solarLightDirection({
    ...material,
    solarFacingOffset: 0,
  })
  const adjusted = solarLightDirection({
    ...material,
    solarFacingOffset: draftOffset,
  })
  const adjustedAngle =
    Math.atan2(adjusted[1] ?? -1, adjusted[0] ?? 0) * 180 / Math.PI
  const axisStyle: SolarAxisStyle = { '--solar-angle': adjustedAngle }

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const bounds = dialRef.current?.getBoundingClientRect()
    if (bounds === undefined) return
    const pointerAngle = Math.atan2(
      event.clientY - (bounds.top + bounds.height / 2),
      event.clientX - (bounds.left + bounds.width / 2),
    )
    const calculatedAngle = Math.atan2(
      calculated[1] ?? -1,
      calculated[0] ?? 0,
    )
    const offset = normalizedOffset(
      (pointerAngle - calculatedAngle) * 180 / Math.PI,
    )
    draftRef.current = offset
    setDraftOffset(offset)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.shiftKey ? 15 : 5
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(normalizedOffset(material.solarFacingOffset - delta))
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(normalizedOffset(material.solarFacingOffset + delta))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(0)
    }
  }
  return (
    <div className="solar-direction">
      <div
        ref={dialRef}
        className="solar-direction__dial"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Sun facing offset"
        aria-valuemin={-180}
        aria-valuemax={180}
        aria-valuenow={Math.round(draftOffset)}
        aria-valuetext={`${String(Math.round(draftOffset))} degrees from calculated sun`}
        aria-disabled={disabled}
        data-testid="material-solar-direction"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          updateFromPointer(event)
        }}
        onPointerMove={(event) => {
          if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event)
          }
        }}
        onPointerUp={(event) => {
          if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return
          updateFromPointer(event)
          event.currentTarget.releasePointerCapture(event.pointerId)
          onChange(draftRef.current)
        }}
        onPointerCancel={() => {
          draftRef.current = material.solarFacingOffset
          setDraftOffset(material.solarFacingOffset)
        }}
      >
        <span
          className="solar-direction__axis"
          style={axisStyle}
          aria-hidden="true"
        />
        <span
          className="solar-direction__calculated"
          style={markerPosition(calculated)}
          aria-hidden="true"
        />
        <span
          className="solar-direction__sun"
          style={markerPosition(adjusted)}
          aria-hidden="true"
        >
          ☀
        </span>
      </div>
      <div className="solar-direction__legend">
        <span><i className="solar-direction__legend-calculated" /> Calculated</span>
        <span><i className="solar-direction__legend-adjusted" /> Facing</span>
        <output>{Math.round(draftOffset)}° offset</output>
      </div>
      <p>
        Drag the sun to match the direction you are facing. The outlined marker
        is where Maximal calculates the sun to be.
      </p>
    </div>
  )
}
