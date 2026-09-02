import type { ReactElement } from 'react'

import { Button, Note } from 'stuffbucket-electron/renderer'

// Signed-out screen: the entry point into the device flow. One primary
// heading, one primary action.

interface SignInScreenProps {
  busy: boolean
  onSignIn: () => void
}

export function SignInScreen({ busy, onSignIn }: SignInScreenProps): ReactElement {
  return (
    <div className="first-run-screen">
      <h1 className="first-run-heading">Sign in to Maximal</h1>
      <Note>
        Maximal uses your GitHub account to authorize access. You'll get a code to enter on
        GitHub's site — nothing to type here.
      </Note>
      <Button variant="primary" onClick={onSignIn} disabled={busy}>
        {busy ? 'Starting…' : 'Sign in with GitHub'}
      </Button>
    </div>
  )
}
