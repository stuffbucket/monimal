import type { ReactElement } from 'react'
import { TerminalView } from '@maximal/maximal-terminal/renderer'

import { terminalTransport } from '../terminal/transport'
import {
  useTerminalPresentation,
  type TerminalTypographySource,
} from '../terminal/useTerminalPresentation'

const DESIGN_SYSTEM_TERMINAL_PROPERTIES = {
  background: '--maximal-color-bg-secondary',
  foreground: '--maximal-color-text-default',
  cursor: '--maximal-color-text-brand',
}

export interface DesignSystemTerminalProps {
  sessionId: string
  title: string
  typography: TerminalTypographySource
  onExit: () => void
  onTitleChange: (title: string) => void
}

/** One detachable session per tab; split panes remain a legacy-renderer feature. */
export function DesignSystemTerminal({
  sessionId,
  title,
  typography,
  onExit,
  onTitleChange,
}: DesignSystemTerminalProps): ReactElement {
  const presentation = useTerminalPresentation(typography, DESIGN_SYSTEM_TERMINAL_PROPERTIES)
  return (
    <section aria-label={title} className="maximal-terminal">
      {presentation.typographyError ? (
        <p role="alert">Terminal typography settings could not be loaded.</p>
      ) : null}
      <TerminalView
        ariaLabel={title}
        disposition="detach"
        emulator="ghostty"
        ghosttyWindow={presentation.appearance.window}
        id={sessionId}
        onExit={onExit}
        onTitleChange={onTitleChange}
        theme={presentation.appearance.theme}
        transport={terminalTransport}
        typography={presentation.typography}
      />
    </section>
  )
}
