import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { ScrollArea } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/ScrollArea',
  component: ScrollArea,
  globals: { shell: 'design-system' },
  args: {
    children: null,
  },
  argTypes: {
    children: { table: { disable: true } },
  },
} satisfies Meta<typeof ScrollArea>

export default meta
type Story = StoryObj<typeof meta>

function Rows() {
  return (
    <div style={{ display: 'grid', gap: 'var(--spacer-2)' }}>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index}>Scrollable row {index + 1}</div>
      ))}
    </div>
  )
}

function Columns() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--spacer-3)',
        width: 'var(--width-content-standard)',
      }}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          style={{ flex: '0 0 var(--width-sidebar-minimum)' }}
        >
          Scrollable column {index + 1}
        </div>
      ))}
    </div>
  )
}

export const VerticalOverflow: Story = {
  render: () => (
    <ScrollArea
      aria-label="Vertically scrolling content"
      role="region"
      style={{
        height: 'var(--width-sidebar-minimum)',
        width: 'var(--width-sidebar-minimum)',
      }}
    >
      <Rows />
    </ScrollArea>
  ),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', {
      name: 'Vertically scrolling content',
    })
    const viewport = region.querySelector<HTMLElement>('.maximal-scroll-area__viewport')

    await expect(viewport).not.toBeNull()
    if (viewport === null) return
    viewport.scrollTop = 80
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }))
    await expect(viewport.scrollTop).toBeGreaterThan(0)
  },
}

export const HorizontalOverflow: Story = {
  render: () => (
    <ScrollArea
      aria-label="Horizontally scrolling content"
      role="region"
      style={{ width: 'var(--width-sidebar-minimum)' }}
    >
      <Columns />
    </ScrollArea>
  ),
}

export const BothOverflow: Story = {
  render: () => (
    <ScrollArea
      aria-label="Content scrolling in both directions"
      role="region"
      style={{
        height: 'var(--width-sidebar-minimum)',
        width: 'var(--width-sidebar-minimum)',
      }}
    >
      <div style={{ width: 'var(--width-content-standard)' }}>
        <Rows />
      </div>
    </ScrollArea>
  ),
}
