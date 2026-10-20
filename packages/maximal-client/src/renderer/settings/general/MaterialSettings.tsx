import { useState, type ReactElement } from 'react'
import { Select, Slider, TextInput } from '@maximal/maximal-design-system'

import { Note } from '@maximal/maximal-electron/renderer'

import { ControlNotes } from '../ControlNotes'
import {
  MATERIAL_PRESETS,
  type MaterialLighting,
  type MaterialPreference,
  type MaterialPreset,
  type MaterialQuality,
  type MaterialSolarEffect,
} from '../../material-preference'
import type { useMaterialPreference } from '../../useMaterialPreference'
import { SolarDirectionControl } from './SolarDirectionControl'

const TIMEZONE_OPTIONS = [
  'UTC',
  ...Intl.supportedValuesOf('timeZone').filter((timezone) => timezone !== 'UTC'),
].map((timezone) => ({
  value: timezone,
  label: timezone.replaceAll('_', ' '),
}))

const PERCENT: Intl.NumberFormatOptions = { style: 'percent' }

function SolarFollowSettings({
  material,
  disabled,
  update,
}: {
  material: MaterialPreference
  disabled: boolean
  update: (next: MaterialPreference) => void
}): ReactElement {
  return (
    <>
      <div className="material-settings__solar-direction">
        <SolarDirectionControl
          key={String(material.solarFacingOffset)}
          material={material}
          disabled={disabled}
          onChange={(solarFacingOffset) =>
            update({ ...material, solarFacingOffset })}
        />
      </div>
      <div className="material-settings__solar-strength">
        <ControlNotes hint="Controls how strongly the calculated sun direction shapes the material.">
          {(describedBy) => (
            <Slider
              label="Follow strength"
              aria-describedby={describedBy}
              value={material.solarFollowStrength}
              min={0}
              max={1}
              step={0.25}
              format={PERCENT}
              disabled={disabled}
              onValueChange={(solarFollowStrength) =>
                update({ ...material, solarFollowStrength })}
              data-testid="material-solar-strength"
            />
          )}
        </ControlNotes>
      </div>
      <ControlNotes hint="Atmosphere is a broad glow. Broken-cloud rays add soft, visible shafts.">
        {(describedBy) => (
          <Select<MaterialSolarEffect>
            label="Sunlight"
            value={material.solarEffect}
            options={[
              { value: 'atmospheric', label: 'Atmospheric glow' },
              { value: 'rays', label: 'Rays through broken clouds' },
            ]}
            disabled={disabled}
            onValueChange={(solarEffect) => update({ ...material, solarEffect })}
            triggerProps={{
              'aria-describedby': describedBy,
              'aria-label': 'Follow the sun effect',
              'data-testid': 'material-solar-effect',
            }}
          />
        )}
      </ControlNotes>
    </>
  )
}

function SolarLocationSettings({
  material,
  disabled,
  update,
}: {
  material: MaterialPreference
  disabled: boolean
  update: (next: MaterialPreference) => void
}): ReactElement {
  const [latitude, setLatitude] = useState(String(material.latitude))
  const [longitude, setLongitude] = useState(String(material.longitude))

  const commit = (
    coordinate: 'latitude' | 'longitude',
    draft: string,
  ): void => {
    const value = Number(draft)
    if (!Number.isFinite(value)) {
      if (coordinate === 'latitude') setLatitude(String(material.latitude))
      else setLongitude(String(material.longitude))
      return
    }
    const minimum = coordinate === 'latitude' ? -90 : -180
    const maximum = coordinate === 'latitude' ? 90 : 180
    update({
      ...material,
      [coordinate]: Math.min(maximum, Math.max(minimum, value)),
    })
  }

  return (
    <div className="material-settings__location">
      <Select<string>
        label="Timezone"
        value={material.timezone}
        options={TIMEZONE_OPTIONS}
        disabled={disabled}
        onValueChange={(timezone) => update({ ...material, timezone })}
        triggerProps={{
          'aria-label': 'Material lighting timezone',
          'data-testid': 'material-timezone',
        }}
      />
      <TextInput
        aria-label="Material lighting latitude"
        data-testid="material-latitude"
        description="Kept for this app session and used only to calculate the sun angle."
        label="Latitude"
        value={latitude}
        disabled={disabled}
        onChange={(event) => setLatitude(event.currentTarget.value)}
        onBlur={() => commit('latitude', latitude)}
      />
      <TextInput
        aria-label="Material lighting longitude"
        data-testid="material-longitude"
        description="Kept for this app session; Maximal does not request device location."
        label="Longitude"
        value={longitude}
        disabled={disabled}
        onChange={(event) => setLongitude(event.currentTarget.value)}
        onBlur={() => commit('longitude', longitude)}
      />
      <SolarFollowSettings
        material={material}
        disabled={disabled}
        update={update}
      />
    </div>
  )
}

interface MaterialSettingsProps {
  disabled: boolean
  preference: ReturnType<typeof useMaterialPreference>
}

export function MaterialSettings({
  disabled,
  preference,
}: MaterialSettingsProps): ReactElement {
  const material = preference.state
  if (material === null) {
    return <Note live="polite">Loading material preferences…</Note>
  }

  const update = (next: MaterialPreference): void => {
    void preference.set(next)
  }
  const cost = MATERIAL_PRESETS.find(({ value }) => value === material.preset)?.cost

  return (
    <div className="material-settings" data-testid="material-settings">
      <div className="material-settings__grid">
        <ControlNotes hint={`${cost ?? 'Low'} GPU cost. One fullscreen draw.`}>
          {(describedBy) => (
            <Select<MaterialPreset>
              label="Material"
              value={material.preset}
              options={MATERIAL_PRESETS.map(({ value, label }) => ({
                value,
                label,
              }))}
              disabled={disabled || preference.busy}
              onValueChange={(preset) => update({ ...material, preset })}
              triggerProps={{
                'aria-describedby': describedBy,
                'aria-label': 'Background material',
                'data-testid': 'material-preset',
              }}
            />
          )}
        </ControlNotes>
        <ControlNotes hint="Caps resolution and frame rate to control battery and GPU use.">
          {(describedBy) => (
            <Select<MaterialQuality>
              label="Quality"
              value={material.quality}
              options={[
                { value: 'battery', label: 'Battery saver' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'high', label: 'High fidelity' },
              ]}
              disabled={disabled || preference.busy}
              onValueChange={(quality) => update({ ...material, quality })}
              triggerProps={{
                'aria-describedby': describedBy,
                'aria-label': 'Material quality',
                'data-testid': 'material-quality',
              }}
            />
          )}
        </ControlNotes>
        <div className="material-settings__field material-settings__field--wide">
          <Slider
            label="Strength"
            value={material.strength}
            min={0.25}
            max={1}
            step={0.25}
            format={PERCENT}
            disabled={disabled || preference.busy}
            onValueChange={(strength) => update({ ...material, strength })}
            data-testid="material-strength"
          />
        </div>
        <div className="material-settings__field material-settings__field--wide">
          <ControlNotes hint="Reduce motion overrides this setting and freezes the material.">
            {(describedBy) => (
              <Slider
                label="Motion"
                aria-describedby={describedBy}
                value={material.motion}
                min={0}
                max={1}
                step={0.25}
                format={PERCENT}
                disabled={disabled || preference.busy}
                onValueChange={(motion) => update({ ...material, motion })}
                data-testid="material-motion"
              />
            )}
          </ControlNotes>
        </div>
        <ControlNotes hint="Timezone lighting follows a locally calculated solar arc.">
          {(describedBy) => (
            <Select<MaterialLighting>
              label="Lighting"
              value={material.lighting}
              options={[
                { value: 'fixed', label: 'Fixed studio light' },
                { value: 'timezone', label: 'Date, time, and location' },
              ]}
              disabled={disabled || preference.busy}
              onValueChange={(lighting) => update({ ...material, lighting })}
              triggerProps={{
                'aria-describedby': describedBy,
                'aria-label': 'Material lighting',
                'data-testid': 'material-lighting',
              }}
            />
          )}
        </ControlNotes>
        {material.lighting === 'timezone' ? (
          <SolarLocationSettings
            key={`${String(material.latitude)}:${String(material.longitude)}`}
            material={material}
            disabled={disabled || preference.busy}
            update={update}
          />
        ) : null}
      </div>
    </div>
  )
}
