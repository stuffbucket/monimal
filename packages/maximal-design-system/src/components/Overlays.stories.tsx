import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { Button } from '../primitives/button'
import {
  ContextMenu,
  createToastManager,
  Menu,
  Menubar,
  Popover,
  ToastProvider,
  Tooltip,
} from './overlays'

const meta = {
  title: 'Components/Overlays',
  globals: { shell: 'design-system' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const toastManager = createToastManager()
const menuItems = [
  { label: 'Open' },
  { label: 'Duplicate' },
  { label: 'Delete' },
]

function OverlaysShowcase() {
  return (
    <ToastProvider toastManager={toastManager}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacer-3)' }}>
        <Menu trigger={<Button>Open menu</Button>} items={menuItems} />
        <ContextMenu
          items={menuItems}
        >
          <div style={{ padding: 'var(--spacer-3)', border: 'var(--border-width-thin) solid var(--maximal-color-border-default)', borderRadius: 'var(--radius-large)' }}>
            Right-click this surface
          </div>
        </ContextMenu>
        <Menubar
          aria-label="Application menu"
          menus={[
            { label: 'File', items: menuItems },
            { label: 'Edit', items: [{ label: 'Undo' }, { label: 'Redo' }] },
          ]}
        />
        <Tooltip trigger={<Button>Hover for tooltip</Button>}>
          A Base UI tooltip
        </Tooltip>
        <Popover
          trigger={<Button>Open popover</Button>}
          title="Popover title"
          description="A reusable non-modal surface."
        >
          Popover content belongs to the consumer.
        </Popover>
        <Button
          variant="primary"
          onClick={() => toastManager.add({
            title: 'Saved',
            description: 'Your design-system changes are ready.',
            actionProps: { children: 'Undo' },
          })}
        >
          Show toast
        </Button>
      </div>
    </ToastProvider>
  )
}

export const AllOverlays: Story = {
  render: () => <OverlaysShowcase />,
}
