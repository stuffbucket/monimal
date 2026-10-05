import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import { useState, type ReactElement } from 'react'

import compactSource from './compact/icons.sheet.svg?url'
import { ICON_SETS, type IconSetName } from './catalog'
import prominentSource from './prominent/icons.sheet.svg?url'
import endpointSource from './stroke-endpoints/icons.sheet.svg?url'
import '../foundation-reference.css'
import './icons.css'

const SOURCES: Record<IconSetName, string> = {
  compact: compactSource,
  prominent: prominentSource,
  'stroke-endpoints': endpointSource,
}

const LABELS: Record<IconSetName, string> = {
  compact: 'Compact icons',
  prominent: 'Prominent icons',
  'stroke-endpoints': 'Stroke endpoints',
}

const ZOOM_LEVELS = [25, 50, 100] as const
type Zoom = typeof ZOOM_LEVELS[number]

function IconSheet({ setName }: { setName: IconSetName }): ReactElement {
  const [zoom, setZoom] = useState<Zoom>(25)
  const set = ICON_SETS[setName]

  return (
    <main className="icon-catalog">
      <header className="icon-catalog__header">
        <div>
          <p>Foundations / Icons</p>
          <h1>{LABELS[setName]}</h1>
          <span>{set.count} icons · {set.canvas}px canvas · <code>{set.namespaces.join(', ')}</code></span>
        </div>
        <div className="icon-catalog__zoom" role="group" aria-label="Preview zoom">
          {ZOOM_LEVELS.map((level) => (
            <button
              aria-pressed={zoom === level}
              key={level}
              onClick={() => setZoom(level)}
              type="button"
            >
              {level}%
            </button>
          ))}
        </div>
      </header>
      <div className="icon-catalog__viewport">
        <img
          alt={`${LABELS[setName]} reference sheet`}
          draggable="false"
          src={SOURCES[setName]}
          style={{ width: `${String(set.width * zoom / 100)}px` }}
        />
      </div>
    </main>
  )
}

const meta = {
  title: 'Foundations/Icons',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Compact16: Story = { render: () => <IconSheet setName="compact" /> }
export const Prominent24: Story = { render: () => <IconSheet setName="prominent" /> }
export const StrokeEndpoints: Story = { render: () => <IconSheet setName="stroke-endpoints" /> }
