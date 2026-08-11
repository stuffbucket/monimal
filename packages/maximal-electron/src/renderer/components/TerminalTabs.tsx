import type { ITheme } from 'ghostty-web';

import type {
  DetachableTerminalTransport,
  TerminalTransport,
} from '../lib/terminal-transport.js';
import { TerminalView } from './TerminalView.js';

/**
 * Every open terminal, with the inactive ones hidden.
 *
 * Hidden rather than unmounted, and that is a scrollback decision rather than a
 * lifetime one. `disposition="detach"` keeps the shell alive across an unmount,
 * but the scrollback lives in the emulator and dies with it, so a reattached
 * view gets the tail the host retained and nothing older. An inactive tab stays
 * mounted to keep all of it; detach covers the tab a user actually closes.
 */
interface TerminalTabsCommonProps {
  /** Which sessions are open. Which tabs those are is the caller's taxonomy. */
  ids: string[];
  activeId: string;
  /** Overrides the login shell. A capture fixture passes an impersonal one. */
  shell?: string;
  theme?: ITheme;
}

export type TerminalTabsProps = TerminalTabsCommonProps &
  (
    | { disposition?: 'terminate'; transport: TerminalTransport }
    | { disposition: 'detach'; transport: DetachableTerminalTransport }
  );

/**
 * One mounted terminal per id, with the inactive ones hidden rather than
 * unmounted.
 *
 * Unmounting would kill the emulator and lose the scrollback, so a tab a user
 * comes back to still holds what it printed. `disposition` decides what
 * closing does: `terminate` ends the session, `detach` leaves it running for
 * something else to reattach, and only the detachable transport allows it.
 */
export function TerminalTabs(props: TerminalTabsProps) {
  const { ids, activeId, shell, theme } = props;
  const session =
    props.disposition === 'detach'
      ? ({ disposition: 'detach', transport: props.transport } as const)
      : ({ disposition: 'terminate', transport: props.transport } as const);

  return (
    <>
      {ids.map((id) => (
        <div key={id} className="terminal-host" hidden={id !== activeId}>
          <TerminalView id={id} shell={shell} theme={theme} {...session} />
        </div>
      ))}
    </>
  );
}
