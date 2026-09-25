import { useEffect, useState, type ReactElement } from 'react'
import { Button, Dialog } from 'stuffbucket-electron/renderer'

export function ThirdPartyLicensesDialog(): ReactElement {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.maximal.onOpenLicenses(() => {
    setOpen(true)
    setText(null)
    setError(null)
    void window.maximal.licenses.text().then(setText, (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Unable to load license information.')
    })
  }), [])

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Third Party Licenses"
      description="License notices for software included with Maximal."
      showTitle
      showDescription
      className="dialog license-dialog"
      testId="third-party-licenses-dialog"
    >
      <div className="license-dialog__reader" role="region" aria-label="Third party license notices">
        {error ? <p role="alert">{error}</p> : text === null ? <p>Loading licenses...</p> : (
          <pre className="license-dialog__text">{text}</pre>
        )}
      </div>
      <div className="license-dialog__actions">
        <Button variant="primary" onClick={() => setOpen(false)}>Close</Button>
      </div>
      <style>{`
        .license-dialog {
          width: min(48rem, calc(100vw - var(--shell-space-5, 24px)));
          max-height: min(44rem, calc(100vh - var(--shell-space-5, 24px)));
        }
        .license-dialog__reader {
          min-height: 0;
          max-height: min(32rem, calc(100vh - 15rem));
          overflow: auto;
          padding: var(--shell-space-3, 12px);
          border: 1px solid var(--shell-border);
          border-radius: var(--shell-radius, 6px);
          background: var(--shell-canvas);
        }
        .license-dialog__text {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font: var(--shell-text-sm, 0.875rem)/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          color: var(--shell-text);
        }
        .license-dialog__actions {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </Dialog>
  )
}