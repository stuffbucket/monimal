import type { Meta, StoryObj } from '@storybook/react-vite'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../primitives/button'
import '../../styles/index.css'
import { ToastProvider, useToastManager } from './index'

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
      <ToastMaterializer focusToast={focusToast} toast={toast} />
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
