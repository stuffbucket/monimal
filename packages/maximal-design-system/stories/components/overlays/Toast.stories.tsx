import type { Meta, StoryObj } from '@storybook/react-vite'
import { useCallback, useEffect, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@maximal/maximal-design-system/primitives'
import '@maximal/maximal-design-system/styles.css'
import { ToastProvider, useToastManager } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Toast',
  globals: { shell: 'design-system' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type ToastOptions = Parameters<ReturnType<typeof useToastManager>['add']>[0]

function ToastMaterializer({
  focusToast = false,
  toast,
}: {
  focusToast?: boolean
  toast: ToastOptions
}) {
  const { add, close } = useToastManager()
  const [initialToast] = useState(toast)
  const showToast = useCallback(() => add(initialToast), [add, initialToast])

  useEffect(() => {
    const id = showToast()
    const animationFrame = focusToast
      ? requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('[role="alertdialog"]')?.focus()
        })
      : undefined

    return () => {
      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame)
      }
      close(id)
    }
  }, [close, focusToast, showToast])

  return <Button onClick={showToast}>Show toast</Button>
}

function ToastFixture({
  focusToast,
  toast,
}: {
  focusToast?: boolean
  toast: ToastOptions
}) {
  return (
    <ToastProvider timeout={60000}>
      <ToastMaterializer
        {...(focusToast === undefined ? {} : { focusToast })}
        toast={toast}
      />
    </ToastProvider>
  )
}

export const Plain: Story = {
  render: () => (
    <ToastFixture
      toast={{
        title: 'Changes saved',
        description: 'Your project is up to date.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show toast' }))
    const body = within(canvasElement.ownerDocument.body)
    const toasts = await body.findAllByRole('dialog', { name: 'Changes saved' })
    const toast = toasts.at(-1)

    await expect(toast).toBeDefined()
    if (toast === undefined) return
    toast.focus()
    await userEvent.tab()
    const dismiss = within(toast).getByRole('button', { name: 'Dismiss notification' })
    await expect(dismiss).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(dismiss).not.toBeInTheDocument())
  },
}

export const Action: Story = {
  render: () => (
    <ToastFixture
      toast={{
        title: 'Project archived',
        description: 'The project was moved to the archive.',
        actionProps: {
          children: 'Undo',
          style: {
            color: 'var(--maximal-color-text-default)',
            background: 'var(--maximal-color-bg-default)',
          },
        },
      }}
    />
  ),
}

export const HighPriority: Story = {
  render: () => (
    <ToastFixture
      focusToast
      toast={{
        title: 'Connection lost',
        description: 'Reconnect to continue syncing changes.',
        priority: 'high',
        timeout: 0,
      }}
    />
  ),
}

export const Persistent: Story = {
  render: () => (
    <ToastFixture
      toast={{
        title: 'Export in progress',
        description: 'This notification remains until dismissed.',
        timeout: 0,
      }}
    />
  ),
}
