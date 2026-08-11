import { FitAddon, Terminal as GhosttyTerminal, init } from 'ghostty-web';
import type { ITheme } from 'ghostty-web';
import { useEffect, useRef } from 'react';

import type {
  DetachableTerminalTransport,
  TerminalDescriptor,
  TerminalTransport,
} from '../lib/terminal-transport.js';

/**
 * A real terminal, driven by an injected transport.
 *
 * **The theme is fixed for a session.** The emulator draws to a canvas, so it
 * inherits nothing from CSS and is handed literal colours at construction.
 * `options.theme` after `open()` is a no-op that logs a warning, and the
 * supported route, `reset()`, wipes the screen and the scrollback. Losing a
 * build log to a theme toggle is the worse trade, so a terminal keeps the
 * scheme it opened in and a new tab picks up the current one.
 *
 * **Unmounting terminates the session, unless the caller says otherwise.** See
 * `disposition`.
 */

/** `init()` is shared, so several tabs opening at once await one load. */
let wasmReady: Promise<void> | undefined;
function ensureWasm(): Promise<void> {
  wasmReady ??= init();
  return wasmReady;
}

/** The host element carries the terminal instance, for end-to-end tests. */
export type TerminalHost = HTMLDivElement & { __terminal?: GhosttyTerminal };

interface TerminalViewCommonProps extends TerminalDescriptor {
  /** Literal colours. Resolve with `readTerminalTheme`. */
  theme?: ITheme;
  testId?: string;
}

/**
 * The view's own lifetime, and the session's, as two decisions.
 *
 * `detach` needs a transport that can list its sessions, because a shell that
 * outlives every view and that nothing can enumerate is a process the user
 * cannot see and cannot stop. Requiring `list` here is what stops half the
 * feature shipping.
 */
export type TerminalViewProps = TerminalViewCommonProps &
  (
    | { disposition?: 'terminate'; transport: TerminalTransport }
    | { disposition: 'detach'; transport: DetachableTerminalTransport }
  );

/**
 * One terminal, drawn by `ghostty-web` into a canvas.
 *
 * It takes a transport rather than reaching for a bridge, which is what keeps
 * this package free of any particular IPC contract: build one with
 * `createTerminalTransport` and name your own channels. The emulator inherits
 * nothing from CSS, so `theme` carries literal colours — `readTerminalTheme`
 * with `SHELL_TERMINAL_PROPERTIES` resolves them from the shell contract.
 */
export function TerminalView({
  id,
  cwd,
  shell,
  ariaLabel = 'Terminal',
  transport,
  disposition = 'terminate',
  theme,
  testId = 'terminal',
}: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);

  // The disposition is read at cleanup rather than at mount, so a caller that
  // changes it while a session runs gets the current answer.
  const onUnmount = useRef(disposition);
  onUnmount.current = disposition;

  // `id` identifies the session for this view's lifetime. Re-running this
  // effect would orphan a shell, so the descriptor fields read at spawn time
  // are deliberately not dependencies.
  useEffect(() => {
    const element = host.current;
    if (!element) return;

    let disposed = false;
    let term: GhosttyTerminal | undefined;
    let unsubscribe: (() => void) | undefined;
    let cleanupObserver: (() => void) | undefined;

    void ensureWasm().then(() => {
      // The view can unmount while the WebAssembly module loads.
      if (disposed || !host.current) return;

      term = new GhosttyTerminal({
        fontSize: 13,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        ...(theme ? { theme } : {}),
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();

      // The emulator draws to a canvas, so there is no text in the DOM to
      // assert on. Exposing the instance lets a test read the real buffer.
      (host.current as TerminalHost).__terminal = term;

      term.onData((data) => {
        void transport.write(id, data);
      });

      term.onResize(({ cols, rows }) => {
        void transport.resize(id, cols, rows);
      });

      unsubscribe = transport.subscribe(id, (event) => {
        if (event.type === 'data') term?.write(event.data);
        else {
          term?.write(
            `\r\n\x1b[2m[process exited with ${String(event.exitCode)}]\x1b[0m\r\n`,
          );
        }
      });

      void transport.spawn({ id, cwd, shell, cols: term.cols, rows: term.rows });

      // The panel group resizes the host without a window resize, so a
      // ResizeObserver is the only reliable trigger.
      const observer = new ResizeObserver(() => fit.fit());
      observer.observe(element);
      cleanupObserver = () => observer.disconnect();
    });

    return () => {
      disposed = true;
      cleanupObserver?.();
      unsubscribe?.();
      if (onUnmount.current === 'terminate') void transport.terminate(id);
      term?.dispose();
    };
  }, [id]);

  return (
    <div
      className="terminal"
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
      ref={host}
    />
  );
}
