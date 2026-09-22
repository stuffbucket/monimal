import { Button, Dialog } from 'stuffbucket-electron/renderer'

interface MenuBarOnlyDialogProps {
  open: boolean
  remaining: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function MenuBarOnlyDialog({
  open,
  remaining,
  busy,
  onCancel,
  onConfirm,
}: MenuBarOnlyDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      title="Keep menu bar only?"
      description="Confirm before Maximal removes its Dock or taskbar entry."
      testId="menu-bar-mode-confirmation"
    >
      <h2 className="settings-dialog__heading">Keep menu bar only?</h2>
      <p>
        Maximal will restore its Dock or taskbar entry in{' '}
        <strong aria-live="polite">{remaining} seconds</strong> unless you keep
        this setting.
      </p>
      <div className="settings-dialog__actions">
        <Button onClick={onCancel} disabled={busy}>
          Revert
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          Keep menu bar only
        </Button>
      </div>
    </Dialog>
  )
}