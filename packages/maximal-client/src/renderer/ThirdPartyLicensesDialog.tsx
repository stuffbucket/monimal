import { useEffect, useState, type ReactElement } from 'react'
import { Button, Dialog } from '@maximal/maximal-electron/renderer'

export function ThirdPartyLicensesDialog(): ReactElement {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      window.maximal.onOpenLicenses(() => {
        setOpen(true)
        setText(null)
        setError(null)
        void window.maximal.licenses.text().then(setText, (cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load license information.',
          )
        })
      }),
    [],
  )

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
      <div
        className="license-dialog__reader"
        role="region"
        aria-label="Third party license notices"
      >
        {error ? (
          <p role="alert">{error}</p>
        ) : text === null ? (
          <p>Loading licenses...</p>
        ) : (
          <pre className="license-dialog__text">{text}</pre>
        )}
      </div>
      <div className="license-dialog__actions">
        <Button variant="primary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </Dialog>
  )
}
