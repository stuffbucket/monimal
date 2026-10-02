import { detachedSessions, terminalPaneSessionIds, type TerminalSession } from '@maximal/maximal-terminal/renderer'
import type { TerminalLaunchResult } from '@maximal/maximal-electron/renderer'

export function terminalSessionRoots(sessions: TerminalSession[]): TerminalSession[] {
  const paneLeaves = sessions.flatMap((session) => session.pane
    ? terminalPaneSessionIds(session.pane).filter((id) => id !== session.id)
    : [])
  return detachedSessions(sessions, paneLeaves)
}

export function terminalSessionResult(session: TerminalSession): TerminalLaunchResult {
  return {
    sessionId: session.id,
    label: session.title ?? session.shell.split(/[\\/]/).at(-1) ?? 'Terminal',
    canRunInBackground: session.canRunInBackground ?? false,
  }
}
