import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { ReactElement } from 'react'

import elevationTokens from '../../tokens/elevation.json'
import '../foundation-reference.css'
import './elevations.css'

const LEVELS = ['100', '200', '300', '400', '500'] as const

function ElevationSample({ level }: { level: typeof LEVELS[number] }): ReactElement {
  return (
    <div className="elevation-sample">
      <span className={`elevation-swatch elevation-swatch--${level}`} aria-hidden="true" />
      <code>--elevation-{level}</code>
    </div>
  )
}

function ElevationDetails({ level }: { level: typeof LEVELS[number] }): ReactElement {
  const token = elevationTokens.elevation[level]
  const metadata = token.$extensions['dev.maximal.elevation']
  return (
    <section className="elevation-level" aria-labelledby={`elevation-${level}-heading`}>
      <div className="elevation-level__copy">
        <p>E {level}</p>
        <h2 id={`elevation-${level}-heading`}>{metadata.label}</h2>
        <span>{token.$description}</span>
        <ul>
          {metadata.examples.map((example) => <li key={example}>{example}</li>)}
        </ul>
      </div>
      <div className="elevation-comparison" aria-label={`E ${level} theme comparison`}>
        <div className="elevation-mode elevation-mode--light" data-theme="light">
          <span>Light mode</span>
          <ElevationSample level={level} />
        </div>
        <div className="elevation-mode elevation-mode--dark" data-theme="dark">
          <span>Dark mode</span>
          <ElevationSample level={level} />
        </div>
      </div>
    </section>
  )
}

function Elevations(): ReactElement {
  return (
    <main className="elevations">
      <header className="elevations__header">
        <p>Foundations</p>
        <h1>Elevations</h1>
        <span>
          Five preset levels create consistent depth across themes and screen resolutions.
          The shadow includes its own edge treatment, so elevated surfaces do not add an outer border.
        </span>
      </header>

      <section className="elevation-overview" aria-label="Elevation scale">
        {LEVELS.map((level) => <ElevationSample level={level} key={level} />)}
      </section>

      <div className="elevation-levels">
        {LEVELS.map((level) => <ElevationDetails level={level} key={level} />)}
      </div>
    </main>
  )
}

const meta = {
  title: 'Foundations/Elevations',
  component: Elevations,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Elevations>

export default meta
type Story = StoryObj<typeof meta>

export const Scale: Story = {}