import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactElement } from 'react'
import { Button, Dialog } from '@maximal/maximal-electron/renderer'

export function ThirdPartyLicensesDialog(): ReactElement {
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['desktop', 'licenses', 'text'],
    queryFn: () => window.maximal.licenses.text(),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
  })

  useEffect(
    () =>
      window.maximal.onOpenLicenses(() => {
        setOpen(true)
      }),
    [],
  )

  const error = query.error instanceof Error
    ? query.error.message
    : query.error === null
      ? null
      : 'Unable to load license information.'

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
        ) : query.data === undefined ? (
          <p>Loading licenses...</p>
        ) : (
          <pre className="license-dialog__text" data-shell-selectable="true">
            {query.data}
          </pre>
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
