import type { ReactElement } from 'react'

import { Note } from 'stuffbucket-electron/renderer'

import { AuthorizedScreen } from './AuthorizedScreen'
import { BootScreen } from './BootScreen'
import { assertNever } from './model'
import { PendingScreen } from './PendingScreen'
import { ProblemScreen } from './ProblemScreen'
import { SignInScreen } from './SignInScreen'
import { useFirstRun } from './useFirstRun'

// The first-run orchestrator: switches on `FirstRunPhase.kind` and renders
// exactly one screen component, so there is always exactly one primary
// heading (`<h1>`) on screen. Owns mounting the `useFirstRun` hook and the
// one-time style injection; every screen component below is presentational
// and depends only on its own props.
//
// Resumability is entirely a property of `useFirstRun`/`deriveFirstRunPhase`
// (model.ts, useFirstRun.ts): on mount they read whatever the core lifecycle
// and `auth/status` report right now, so this component itself has no
// "first visit" vs. "reopened" branch to get wrong — every phase below is
// just as reachable on a resumed run as on a fresh one.

export function FirstRun(): ReactElement {
  const { phase, busy, signIn, restart, signOut, openVerificationUrl } = useFirstRun()

  switch (phase.kind) {
    case 'boot':
      return <BootScreen boot={phase.boot} />

    case 'loading':
      return (
        <div className="first-run-screen">
          <h1 className="first-run-heading">Maximal</h1>
          <Note live="polite">Checking sign-in status…</Note>
        </div>
      )

    case 'signed-out':
      return <SignInScreen busy={busy} onSignIn={signIn} />

    case 'pending':
      return (
        <PendingScreen
          userCode={phase.userCode}
          verificationUri={phase.verificationUri}
          remainingMs={phase.remainingMs}
          polling={phase.polling}
          busy={busy}
          onOpenVerification={openVerificationUrl}
        />
      )

    case 'authorized':
      return <AuthorizedScreen login={phase.login} busy={busy} onSignOut={signOut} />

    case 'authorization-denied':
      return (
        <ProblemScreen
          kind="authorization-denied"
          message={phase.message}
          busy={busy}
          onRestart={restart}
          onOpenUrl={openVerificationUrl}
        />
      )

    case 'device-code-expired':
      return <ProblemScreen kind="device-code-expired" busy={busy} onRestart={restart} onOpenUrl={openVerificationUrl} />

    case 'offline':
      return (
        <ProblemScreen kind="offline" message={phase.message} busy={busy} onRestart={restart} onOpenUrl={openVerificationUrl} />
      )

    case 'fatal':
      return (
        <ProblemScreen
          kind="fatal"
          message={phase.message}
          remediationUrl={phase.remediationUrl}
          busy={busy}
          onRestart={restart}
          onOpenUrl={openVerificationUrl}
        />
      )

    default:
      return assertNever(phase)
  }
}

// ---- Styles ----
//
// Injected once on import (guarded by element id so Vite HMR reloads don't
// pile up duplicate <style> tags). Every screen component in this directory
// only references these classnames; this file is the single place the rules
// are declared.
//
// What is left is what `stuffbucket-electron/renderer` publishes no component
// for. `Note` took the two note rules; `Button` took the five button rules,
// the link-button rule and the shared focus outline with them — and with them
// the `.sb-shell` prefix they carried to out-specify the package's own
// `button` reset. That prefix was never load-bearing: the package ships every
// rule inside `@layer sb-shell.base`, and an unlayered rule outranks a layered
// one whatever its specificity, so these rules already won. It is moot either
// way now, because the button is the package's.
//
// The rest of this file is the gap list: a screen column, a page heading, a
// row of actions, a big monospace value, a screen-reader-only utility, and a
// spinner.
const FIRST_RUN_CSS = `
/*
 * The screen: a narrow centred column. The package has no page or screen
 * layout primitive — ShellLayout is the window frame and Callout is a
 * region inside content — so this stays.
 */
.first-run-screen {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--shell-space-3, 12px);
  max-width: 480px;
  margin: 0 auto;
  padding: var(--shell-space-5, 24px);
  color: var(--shell-text, #f5f5f5);
}

/*
 * The one <h1> per screen. The package publishes no heading: Toolbar will
 * render one but drags a view-mode switch in with it, and Callout's and
 * InspectorPanel's titles are both 11px uppercase eyebrows.
 */
.first-run-heading {
  margin: 0;
  font-size: 1.4em;
  font-weight: 600;
}

/* A row of actions. Callout has an actions slot for exactly this, but it
   comes attached to a titled region, and these screens already have their
   heading. */
.first-run-actions {
  display: flex;
  gap: var(--shell-space-2, 8px);
  align-items: center;
}

.first-run-device-code {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--shell-space-2, 8px);
}

/* The device code itself: one large monospace value, read off a screen and
   typed into another device. Nothing published is close — Field is a 13px
   label/value row and Tag is a pill. */
.first-run-device-code__code {
  margin: 0;
  padding: var(--shell-space-2, 8px) var(--shell-space-4, 16px);
  border-radius: var(--shell-radius, 6px);
  background: var(--shell-hover, rgb(255 255 255 / 0.06));
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace);
  font-size: 1.6em;
  font-weight: 700;
  letter-spacing: 0.08em;
}

/* The package has this rule — .tab__close-keyboard — but does not publish it
   under a name a consumer can use, so every consumer writes it again. */
.first-run-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* No published spinner, progress bar or meter. */
.first-run-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--shell-border, #2a2a2a);
  border-top-color: var(--shell-accent, #5198a6);
  border-radius: 9999px;
  animation: first-run-spin 800ms linear infinite;
}

@keyframes first-run-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .first-run-spinner {
    animation: none;
    /* A static ring still communicates "in progress" without motion. */
    border-top-color: var(--shell-border, #2a2a2a);
    opacity: 0.6;
  }
}
`

const FIRST_RUN_STYLE_ID = 'first-run-styles'

if (typeof document !== 'undefined' && !document.getElementById(FIRST_RUN_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = FIRST_RUN_STYLE_ID
  style.textContent = FIRST_RUN_CSS
  document.head.appendChild(style)
}
