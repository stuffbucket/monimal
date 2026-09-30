import { useEffect, useState, type ReactElement } from 'react'

import {
  FormField,
  Select,
  Slider,
  TextInput,
} from '@maximal/maximal-electron/renderer'

import {
  MATERIAL_PRESETS,
  readMaterialPreference,
  saveMaterialPreference,
  subscribeMaterialPreference,
  type MaterialLighting,
  type MaterialPreference,
  type MaterialPreset,
  type MaterialQuality,
} from '../../material-preference'

const TIMEZONE_OPTIONS = [
  'UTC',
  ...Intl.supportedValuesOf('timeZone').filter((timezone) => timezone !== 'UTC'),
].map((timezone) => ({
  value: timezone,
  label: timezone.replaceAll('_', ' '),
}))

const STRENGTH_OPTIONS = [
  { value: 0.25, label: 'Subtle' },
  { value: 0.5, label: 'Soft' },
  { value: 0.75, label: 'Balanced' },
  { value: 1, label: 'Strong' },
] as const

const MOTION_OPTIONS = [
  { value: 0, label: 'Still' },
  { value: 0.25, label: 'Slow' },
  { value: 0.5, label: 'Gentle' },
  { value: 0.75, label: 'Active' },
  { value: 1, label: 'Fluid' },
] as const

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
      <FormField label="Timezone">
        {(field) => (
          <Select<string>
            {...field}
            value={material.timezone}
            options={TIMEZONE_OPTIONS}
            disabled={disabled}
            onChange={(timezone) => update({ ...material, timezone })}
            aria-label="Material lighting timezone"
            testId="material-timezone"
          />
        )}
      </FormField>
      <FormField
        label="Latitude"
        hint="Kept for this app session and used only to calculate the sun angle."
      >
        {(field) => (
          <TextInput
            {...field}
            value={latitude}
            disabled={disabled}
            onChange={setLatitude}
            onBlur={() => commit('latitude', latitude)}
            aria-label="Material lighting latitude"
            testId="material-latitude"
          />
        )}
      </FormField>
      <FormField
        label="Longitude"
        hint="Kept for this app session; Maximal does not request device location."
      >
        {(field) => (
          <TextInput
            {...field}
            value={longitude}
            disabled={disabled}
            onChange={setLongitude}
            onBlur={() => commit('longitude', longitude)}
            aria-label="Material lighting longitude"
            testId="material-longitude"
          />
        )}
      </FormField>
    </div>
  )
}

export function MaterialSettings({
  disabled,
}: {
  disabled: boolean
}): ReactElement {
  const [material, setMaterial] = useState(readMaterialPreference)

  useEffect(() => subscribeMaterialPreference((next) => {
    setMaterial(next)
  }), [])

  const update = (next: MaterialPreference): void => {
    saveMaterialPreference(next)
    setMaterial(next)
  }
  const cost = MATERIAL_PRESETS.find(({ value }) => value === material.preset)?.cost

  return (
    <div className="material-settings" data-testid="material-settings">
      <div className="material-settings__grid">
        <FormField
          label="Material"
          hint={`${cost ?? 'Low'} GPU cost. One fullscreen draw.`}
        >
          {(field) => (
            <Select<MaterialPreset>
              {...field}
              value={material.preset}
              options={MATERIAL_PRESETS.map(({ value, label }) => ({
                value,
                label,
              }))}
              disabled={disabled}
              onChange={(preset) => update({ ...material, preset })}
              aria-label="Background material"
              testId="material-preset"
            />
          )}
        </FormField>
        <FormField
          label="Quality"
          hint="Caps resolution and frame rate to control battery and GPU use."
        >
          {(field) => (
            <Select<MaterialQuality>
              {...field}
              value={material.quality}
              options={[
                { value: 'battery', label: 'Battery saver' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'high', label: 'High fidelity' },
              ]}
              disabled={disabled}
              onChange={(quality) => update({ ...material, quality })}
              aria-label="Material quality"
              testId="material-quality"
            />
          )}
        </FormField>
        <div className="material-settings__field material-settings__field--wide">
          <FormField label="Strength">
            {(field) => (
              <Slider
                {...field}
                label="Material strength"
                value={material.strength}
                options={STRENGTH_OPTIONS}
                disabled={disabled}
                onChange={(strength) => update({ ...material, strength })}
                testId="material-strength"
              />
            )}
          </FormField>
        </div>
        <div className="material-settings__field material-settings__field--wide">
          <FormField
            label="Motion"
            hint="Reduce motion overrides this setting and freezes the material."
          >
            {(field) => (
              <Slider
                {...field}
                label="Material motion"
                value={material.motion}
                options={MOTION_OPTIONS}
                disabled={disabled}
                onChange={(motion) => update({ ...material, motion })}
                testId="material-motion"
              />
            )}
          </FormField>
        </div>
        <FormField
          label="Lighting"
          hint="Timezone lighting follows a locally calculated solar arc."
        >
          {(field) => (
            <Select<MaterialLighting>
              {...field}
              value={material.lighting}
              options={[
                { value: 'fixed', label: 'Fixed studio light' },
                { value: 'timezone', label: 'Date, time, and location' },
              ]}
              disabled={disabled}
              onChange={(lighting) => update({ ...material, lighting })}
              aria-label="Material lighting"
              testId="material-lighting"
            />
          )}
        </FormField>
        {material.lighting === 'timezone' ? (
          <SolarLocationSettings
            key={`${String(material.latitude)}:${String(material.longitude)}`}
            material={material}
            disabled={disabled}
            update={update}
          />
        ) : null}
      </div>
    </div>
  )
}
