import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { ReactElement } from 'react'

import typographyTokens from '../../tokens/typography.json'
import '../foundation-reference.css'
import './typography.css'

const HEADINGS = [
  { key: 'display', property: '--heading-display', sample: 'Expressive moments and important announcements' },
  { key: 'large', property: '--heading-large', sample: 'Large heading' },
  { key: 'medium', property: '--heading-medium', sample: 'Medium heading' },
  { key: 'small', property: '--heading-small', sample: 'Small heading' },
] as const

const BODY = [
  { key: 'large', strongKey: 'large-strong', label: 'Body Large' },
  { key: 'medium', strongKey: 'medium-strong', label: 'Body Medium' },
  { key: 'small', strongKey: 'small-strong', label: 'Body Small' },
] as const

function metrics(token: { $value: { fontSize: { value: number }; lineHeight: { value: number } } }): string {
  return `${String(token.$value.fontSize.value)}/${String(token.$value.lineHeight.value)}`
}

function HeadingRow({ entry }: { entry: typeof HEADINGS[number] }): ReactElement {
  const token = typographyTokens.heading[entry.key]
  return (
    <section className="typography-row" aria-labelledby={`${entry.key}-heading`}>
      <div className="typography-row__copy">
        <code id={`${entry.key}-heading`}>{entry.property.slice(2)}</code>
        <p>{token.$description}</p>
      </div>
      <div className={`typography-specimen typography-specimen--heading-${entry.key}`}>
        {entry.sample}
        <small>{metrics(token)}</small>
      </div>
    </section>
  )
}

function BodyRow({ entry }: { entry: typeof BODY[number] }): ReactElement {
  const token = typographyTokens.body[entry.key]
  const strongToken = typographyTokens.body[entry.strongKey]
  return (
    <section className="typography-row" aria-labelledby={`${entry.key}-heading`}>
      <div className="typography-row__copy">
        <code id={`${entry.key}-heading`}>{`body-${entry.key}`}</code>
        <p>{token.$description}</p>
      </div>
      <div className="typography-body-pair">
        <div className={`typography-specimen typography-specimen--body-${entry.key}`}>
          {entry.label} <small>{metrics(token)}</small>
        </div>
        <div className={`typography-specimen typography-specimen--body-${entry.strongKey}`}>
          {entry.label} Strong <small>{metrics(strongToken)}</small>
        </div>
      </div>
    </section>
  )
}

function Typography(): ReactElement {
  return (
    <main className="typography-tokens">
      <header className="typography-tokens__header">
        <p>Foundations</p>
        <h1>Typography tokens</h1>
        <span>
          Heading and body styles form a compact hierarchy. Body styles include strong variants
          so emphasis stays consistent across the interface.
        </span>
      </header>

      <div className="typography-token-list">
        {HEADINGS.map((entry) => <HeadingRow entry={entry} key={entry.key} />)}
        {BODY.map((entry) => <BodyRow entry={entry} key={entry.key} />)}
      </div>
    </main>
  )
}

const meta = {
  title: 'Foundations/Typography',
  component: Typography,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Typography>

export default meta
type Story = StoryObj<typeof meta>

export const Scale: Story = {}