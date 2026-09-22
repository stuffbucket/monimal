import { Field, FieldList, Note } from 'stuffbucket-electron/renderer'

import { displayAccountLogin } from '../../shared/account-login'
import { formatTimestamp } from '../../shared/format'
import type { AuthStatus } from '../capabilities'
import { DeviceCodePanel } from './DeviceCodePanel'

interface AccountStatusBodyProps {
  status: AuthStatus | null
  error: string | null
  busy: boolean
  onOpenVerification: (uri: string) => void
  onCancel: () => void
  onRequestNewCode: () => void
}

export function AccountStatusBody({
  status,
  error,
  busy,
  onOpenVerification,
  onCancel,
  onRequestNewCode,
}: AccountStatusBodyProps) {
  return (
    <>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {status === null ? (
        <Note live="polite">Loading account status…</Note>
      ) : status.state === 'unauthenticated' ? (
        <>
          <Note>Not signed in.</Note>
          {status.last_upstream_rejection ? (
            <Note status="needs-approval">
              {status.last_upstream_rejection.message}
            </Note>
          ) : null}
        </>
      ) : status.state === 'device_code_issued' ||
        status.state === 'polling' ? (
        <DeviceCodePanel
          status={status}
          busy={busy}
          onOpenVerification={() => onOpenVerification(status.verification_uri)}
          onCancel={onCancel}
          onRequestNewCode={onRequestNewCode}
        />
      ) : status.state === 'authenticated' ? (
        <>
          <FieldList>
            <Field
              label="Signed in as"
              value={displayAccountLogin(status.account_login)}
            />
            {status.account_type ? (
              <Field label="Plan" value={status.account_type} />
            ) : null}
            {status.connected_since ? (
              <Field
                label="Connected since"
                value={formatTimestamp(status.connected_since)}
              />
            ) : null}
          </FieldList>
          {status.last_upstream_rejection ? (
            <Note status="needs-approval">
              {status.last_upstream_rejection.message}
            </Note>
          ) : null}
        </>
      ) : (
        <Note status="failed" live="assertive">
          {status.error}
          {status.remediation_url ? (
            <>
              {' '}
              <button
                type="button"
                className="settings-link-button"
                onClick={() => onOpenVerification(status.remediation_url ?? '')}
              >
                Learn more
              </button>
            </>
          ) : null}
        </Note>
      )}
    </>
  )
}