import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { ReactElement } from 'react'

import gridTokens from '../../tokens/grid.json'
import '../foundation-reference.css'
import './grid-tokens.css'

const SPACERS = [
  ['0', '--spacer-0'],
  ['1', '--spacer-1'],
  ['2', '--spacer-2'],
  ['3', '--spacer-3'],
  ['4', '--spacer-4'],
  ['5', '--spacer-5'],
  ['6', '--spacer-6'],
] as const
const RADIUS_NAMES = ['none', 'small', 'medium', 'large', 'full'] as const

function TokenLabel({ name, value }: { name: string; value: number }): ReactElement {
  return (
    <>
      <code>{name}</code>
      <span>{value}px</span>
    </>
  )
}

function SpacingScale(): ReactElement {
  return (
    <section className="grid-token-section" aria-labelledby="spacing-heading">
      <div className="grid-token-copy">
        <h2 id="spacing-heading">Spacing</h2>
        <p>A 4px-based scale for consistent layout, padding, and margins.</p>
      </div>
      <div className="grid-token-table" role="table" aria-label="Spacing tokens">
        {SPACERS.map(([name, property]) => {
          const value = gridTokens.spacer[name].$value.value
          return (
            <div className="grid-token-row" role="row" key={name}>
              <TokenLabel name={`spacer-${name}`} value={value} />
              <span
                className="grid-token-spacing-swatch"
                style={{ inlineSize: `var(${property})` }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HeightScale(): ReactElement {
  const compact = gridTokens.height.control.compact.$value.value
  const standard = gridTokens.height.row.standard.$value.value
  const heading = gridTokens.height.row.heading.$value.value

  return (
    <section className="grid-token-section" aria-labelledby="height-heading">
      <div className="grid-token-copy">
        <h2 id="height-heading">Control and row heights</h2>
        <p>Compact controls align inside heading rows, while repeating item rows stay dense.</p>
      </div>
      <div className="grid-token-height-demo">
        <div className="grid-token-height-heading">
          <strong>Pages</strong>
          <button type="button" aria-label="Add page">+</button>
        </div>
        <div className="grid-token-height-row grid-token-height-row--selected">
          <span className="grid-token-height-control">Cover</span>
        </div>
        <div className="grid-token-height-row">Typography</div>
      </div>
      <dl className="grid-token-definitions">
        <div><dt><code>height-control-compact</code></dt><dd>{compact}px</dd></div>
        <div><dt><code>height-row-standard</code></dt><dd>{standard}px</dd></div>
        <div><dt><code>height-row-heading</code></dt><dd>{heading}px</dd></div>
      </dl>
    </section>
  )
}

function RadiusScale(): ReactElement {
  return (
    <section className="grid-token-section" aria-labelledby="radius-heading">
      <div className="grid-token-copy">
        <h2 id="radius-heading">Radii</h2>
        <p>Inner 5px controls nest within 13px containers at the default 8px spacing.</p>
      </div>
      <div className="grid-token-radius-list">
        {RADIUS_NAMES.map((name) => {
          const value = gridTokens.radius[name].$value.value
          return (
            <div className="grid-token-radius-item" key={name}>
              <TokenLabel name={`radius-${name}`} value={value} />
              <span
                className={`grid-token-radius-swatch grid-token-radius-swatch--${name}`}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GridTokens(): ReactElement {
  return (
    <main className="grid-tokens">
      <header className="grid-tokens__header">
        <p>Foundations</p>
        <h1>Grid tokens</h1>
        <span>Geometry for a dense, predictable product interface.</span>
      </header>
      <SpacingScale />
      <HeightScale />
      <RadiusScale />
    </main>
  )
}

const meta = {
  title: 'Foundations/Grid',
  component: GridTokens,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GridTokens>

export default meta
type Story = StoryObj<typeof meta>

export const Tokens: Story = {}