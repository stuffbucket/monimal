import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import {
  Scrollbar,
  type ScrollbarOrientation,
  type ScrollbarVisibility,
} from '@maximal/maximal-design-system/components'
import './scrollbar-stories.css'

const meta = {
  title: 'Components/Scrollbar',
  component: Scrollbar,
  globals: { shell: 'design-system' },
  parameters: { controls: { disable: true } },
  args: { scroller: { current: null } },
} satisfies Meta<typeof Scrollbar>

export default meta
type Story = StoryObj<typeof meta>

function ScrollFrame({
  orientation = 'vertical',
  visibility = 'auto',
  label,
}: {
  orientation?: ScrollbarOrientation
  visibility?: ScrollbarVisibility
  label?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const vertical = orientation === 'vertical'
  return (
    <div className="maximal-story-scroll-frame">
      <div
        aria-label="Scrolling content"
        className="maximal-story-scroller"
        ref={scroller}
        role="region"
        tabIndex={0}
      >
        <div className={vertical ? 'maximal-story-scroll-rows' : 'maximal-story-scroll-columns'}>
          {Array.from({ length: vertical ? 30 : 12 }, (_, index) => (
            <span key={index}>{vertical ? `Row ${index + 1}` : `Column ${index + 1}`}</span>
          ))}
        </div>
      </div>
      <Scrollbar
        label={label}
        orientation={orientation}
        scroller={scroller}
        visibility={visibility}
      />
    </div>
  )
}

function parts(canvasElement: HTMLElement) {
  const track = canvasElement.querySelector<HTMLElement>('.maximal-scrollbar')
  const thumb = canvasElement.querySelector<HTMLElement>('.maximal-scrollbar__thumb')
  const scroller = canvasElement.querySelector<HTMLElement>('.maximal-story-scroller')
  if (!track || !thumb || !scroller) throw new Error('Scrollbar did not render')
  return { track, thumb, scroller }
}

function clampedLength(thumb: HTMLElement, vertical: boolean) {
  const style = getComputedStyle(thumb)
  const length = vertical ? thumb.offsetHeight : thumb.offsetWidth
  const minimum = Number.parseFloat(vertical ? style.minHeight : style.minWidth)
  const maximum = Number.parseFloat(vertical ? style.maxHeight : style.maxWidth)
  return { length, minimum, maximum }
}

export const Auto: Story = {
  render: () => <ScrollFrame />,
  play: async ({ canvasElement }) => {
    const { track, thumb, scroller } = parts(canvasElement)
    await waitFor(() => expect(track).toHaveAttribute('data-overflowing'))
    await expect(getComputedStyle(track).backgroundColor).toMatch(/, 0\)$/)
    await expect(Number(getComputedStyle(track).opacity)).toBe(0)
    const tokens = getComputedStyle(canvasElement.ownerDocument.documentElement)
    const token = (name: string) => tokens.getPropertyValue(name).trim()
    const reducedMotion = canvasElement.ownerDocument.defaultView
      ?.matchMedia('(prefers-reduced-motion: reduce)').matches === true
    if (reducedMotion) {
      await expect(getComputedStyle(track).transitionDuration).toBe('0s')
    } else {
      await expect(getComputedStyle(track).transitionTimingFunction).toBe(token('--easing-in'))
      await expect(getComputedStyle(track).transitionDelay)
        .toBe(`${String(Number.parseFloat(token('--duration-dwell')) / 1000)}s`)
    }

    scroller.scrollTop = scroller.scrollHeight
    await waitFor(() => expect(track).toHaveAttribute('data-revealed'))
    if (!reducedMotion) {
      await expect(getComputedStyle(track).transitionTimingFunction).toBe(token('--easing-out'))
      await expect(getComputedStyle(track).transitionDelay).toBe('0s')
    }
    await waitFor(() => expect(Number(getComputedStyle(track).opacity)).toBeGreaterThan(0.99))
    const { length, minimum, maximum } = clampedLength(thumb, true)
    await expect(length).toBeGreaterThanOrEqual(minimum)
    await expect(length).toBeLessThanOrEqual(maximum)
    await waitFor(() => expect(
      thumb.getBoundingClientRect().bottom,
    ).toBeCloseTo(track.getBoundingClientRect().bottom, 0))
  },
}

export const Always: Story = {
  render: () => <ScrollFrame visibility="always" />,
  play: async ({ canvasElement }) => {
    const { track, thumb } = parts(canvasElement)
    await waitFor(() => expect(Number(getComputedStyle(track).opacity)).toBe(1))
    const rest = thumb.getBoundingClientRect().width

    thumb.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await waitFor(() => expect(thumb).toHaveAttribute('data-hovered'))
    await waitFor(() => expect(thumb.getBoundingClientRect().width).toBeGreaterThan(rest))
    thumb.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
    await waitFor(() => expect(thumb.getBoundingClientRect().width).toBe(rest))
  },
}

export const Horizontal: Story = {
  render: () => <ScrollFrame orientation="horizontal" visibility="always" />,
  play: async ({ canvasElement }) => {
    const { thumb } = parts(canvasElement)
    await waitFor(() => {
      const { length, minimum, maximum } = clampedLength(thumb, false)
      expect(length).toBeGreaterThanOrEqual(minimum)
      expect(length).toBeLessThanOrEqual(maximum)
    })
  },
}

export const KeyboardOperable: Story = {
  render: () => <ScrollFrame label="Scroll rows" visibility="always" />,
  play: async ({ canvasElement }) => {
    const { scroller } = parts(canvasElement)
    const scrollbar = await within(canvasElement).findByRole('scrollbar', { name: 'Scroll rows' })
    scrollbar.focus()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0))
    await waitFor(() => expect(Number(scrollbar.getAttribute('aria-valuenow'))).toBeGreaterThan(0))
  },
}
