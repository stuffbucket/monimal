import { useEffect, useRef, useState } from 'react';

import {
  createTerminalEmulator,
  type GhosttyWindowAdjustment,
  type TerminalEmulator,
  type TerminalEmulatorKind,
  type TerminalTheme,
} from '../lib/terminal-emulator.js';
import type {
  DetachableTerminalTransport,
  TerminalDescriptor,
  TerminalTransport,
} from '../lib/terminal-transport.js';
import {
  animationFrameScheduler,
  TerminalAcknowledgements,
  TerminalResizes,
} from '../lib/terminal-ack.js';
import type { TerminalViewId } from '../lib/terminal-workspace.js';

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

/** The host element carries the terminal instance, for end-to-end tests. */
export type TerminalHost = HTMLDivElement & { __terminal?: TerminalEmulator };

interface TerminalViewCommonProps extends TerminalDescriptor {
  /** Renderer identity. Transport operations remain addressed by `id`. */
  viewId?: TerminalViewId;
  /** Terminal engine. The default is `xterm`. */
  emulator?: TerminalEmulatorKind;
  /** Window geometry and background effects applied only by the Ghostty adapter. */
  ghosttyWindow?: GhosttyWindowAdjustment;
  /** Literal colours. Resolve with `readTerminalTheme`. */
  theme?: TerminalTheme;
  testId?: string;
  /** Increasing token for explicit split-navigation focus requests. */
  focusRequest?: number;
  focusIndicator?: boolean;
  onFocus?: () => void;
  onSplit?: (direction: TerminalSplitDirection) => void;
  onNavigateSplit?: (direction: 'previous' | 'next') => void;
  onExit?: (exitCode: number) => void;
  onError?: (error: unknown) => void;
  onTitleChange?: (title: string) => void;
}

export type TerminalSplitDirection = 'right' | 'down';

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
    | { disposition: 'preserve'; transport: TerminalTransport }
  );

/**
 * One terminal, drawn by the configured emulator.
 *
 * It takes a transport rather than reaching for a bridge, which is what keeps
 * this package free of any particular IPC contract: build one with
 * `createTerminalTransport` and name your own channels. The emulator inherits
 * nothing from CSS, so `theme` carries literal colours — `readTerminalTheme`
 * with `SHELL_TERMINAL_PROPERTIES` resolves them from the shell contract.
 */
export function TerminalView({
  id,
  viewId,
  cwd,
  shell,
  ariaLabel = 'Terminal',
  transport,
  disposition = 'terminate',
  emulator = 'xterm',
  ghosttyWindow,
  theme,
  testId = 'terminal',
  focusRequest = 0,
  focusIndicator = false,
  onFocus,
  onSplit,
  onNavigateSplit,
  onExit,
  onError,
  onTitleChange,
}: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<TerminalEmulator | undefined>(undefined);
  const lifecycle = useRef({ id, generation: 0 });
  const callbacks = useRef({ onSplit, onNavigateSplit, onExit, onError, onTitleChange });
  const pendingFocusRequest = useRef(focusRequest);
  const handledFocusRequest = useRef(0);
  const [startFailed, setStartFailed] = useState(false);
  const [startAttempt, setStartAttempt] = useState(0);
  const [hasFocus, setHasFocus] = useState(false);
  callbacks.current = { onSplit, onNavigateSplit, onExit, onError, onTitleChange };
  pendingFocusRequest.current = focusRequest;

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
    const generation = lifecycle.current.generation + 1;
    lifecycle.current = { id, generation };

    let disposed = false;
    let failed = false;
    let spawnAttempted = false;
    let term: TerminalEmulator | undefined;
    let unsubscribe: (() => void) | undefined;
    let cleanupObserver: (() => void) | undefined;
    const reportFailure = (error?: unknown): void => {
      if (disposed || failed) return;
      failed = true;
      callbacks.current.onError?.(error);
      cleanupObserver?.();
      cleanupObserver = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
      if (terminal.current === term) terminal.current = undefined;
      term?.dispose();
      term = undefined;
      setStartFailed(true);
      if (spawnAttempted) void transport.terminate(id).catch(() => undefined);
    };
    const acknowledgements = new TerminalAcknowledgements(
      (sequence) => {
        if (disposed || failed) return;
        const acknowledgement = transport.ack?.(id, sequence);
        if (acknowledgement) void acknowledgement.catch(reportFailure);
      },
      animationFrameScheduler,
    );
    const resizes = new TerminalResizes(
      (cols, rows) => {
        if (!disposed && !failed) {
          void transport.resize(id, cols, rows).catch(reportFailure);
        }
      },
      animationFrameScheduler,
    );

    void Promise.resolve().then(async () => {
      if (disposed || !host.current) return;

      term = await createTerminalEmulator(emulator, theme, ghosttyWindow);
      if (disposed || !host.current) {
        term.dispose();
        return;
      }
      await term.open(host.current);
      if (disposed || !host.current) {
        term.dispose();
        return;
      }
      term.fit();
      terminal.current = term;
      if (pendingFocusRequest.current > handledFocusRequest.current) {
        handledFocusRequest.current = pendingFocusRequest.current;
        term.focus();
      }

      // The buffer is the stable assertion surface across canvas and DOM renderers.
      (host.current as TerminalHost).__terminal = term;

      term.onData((data) => {
        if (!disposed && !failed) {
          void transport.write(id, data).catch(reportFailure);
        }
      });

      term.onResize(({ cols, rows }) => {
        resizes.update(cols, rows);
      });

      term.onKeyEvent((event) => {
        if (event.type !== 'keydown' || !event.metaKey) return false;
        const key = event.key.toLowerCase();
        if (key === 'd' && callbacks.current.onSplit) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.current.onSplit(event.shiftKey ? 'down' : 'right');
          return true;
        }
        if ((key === '[' || key === ']') && callbacks.current.onNavigateSplit) {
          callbacks.current.onNavigateSplit(key === '[' ? 'previous' : 'next');
          return true;
        }
        if (key === 'k') {
          term?.clear();
          return true;
        }
        if (key === 'a') {
          term?.selectAll();
          return true;
        }
        if (event.key === 'Home') {
          term?.scrollToTop();
          return true;
        }
        if (event.key === 'End') {
          term?.scrollToBottom();
          return true;
        }
        return false;
      });

      term.onTitleChange((title) => {
        callbacks.current.onTitleChange?.(title);
      });

      unsubscribe = transport.subscribe(id, (event) => {
        if (failed) return;
        if (event.type === 'data') {
          term?.write(event.data, () => {
            if (event.sequence !== undefined) acknowledgements.consume(event.sequence);
          });
        }
        else if (callbacks.current.onExit) {
          callbacks.current.onExit(event.exitCode);
        }
        else {
          term?.write(
            `\r\n\x1b[2m[process exited with ${String(event.exitCode)}]\x1b[0m\r\n`,
          );
        }
      });

        spawnAttempted = true;
        await transport.spawn({ id, cwd, shell, cols: term.cols, rows: term.rows });

      // The panel group resizes the host without a window resize, so a
      // ResizeObserver is the only reliable trigger.
      const observer = new ResizeObserver(() => {
        if (!disposed) term?.fit();
      });
      observer.observe(element);
      cleanupObserver = () => observer.disconnect();
    }).catch(reportFailure);

    return () => {
      disposed = true;
      acknowledgements.dispose();
      resizes.dispose();
      cleanupObserver?.();
      unsubscribe?.();
      const disposition = onUnmount.current;
      queueMicrotask(() => {
        const current = lifecycle.current;
        const remountedSameSession = current.generation !== generation && current.id === id;
        if (!remountedSameSession && disposition === 'terminate') {
          void transport.terminate(id).catch(() => undefined);
        }
      });
      if (terminal.current === term) terminal.current = undefined;
      term?.dispose();
    };
  }, [emulator, id, startAttempt]);

  useEffect(() => {
    if (focusRequest <= handledFocusRequest.current || !terminal.current) return;
    handledFocusRequest.current = focusRequest;
    terminal.current.focus();
  }, [focusRequest]);

  useEffect(() => {
    const restoreWindowFocus = () => {
      setHasFocus(Boolean(host.current?.contains(document.activeElement)));
    };
    const relinquishWindowFocus = () => setHasFocus(false);
    window.addEventListener('focus', restoreWindowFocus);
    window.addEventListener('blur', relinquishWindowFocus);
    return () => {
      window.removeEventListener('focus', restoreWindowFocus);
      window.removeEventListener('blur', relinquishWindowFocus);
    };
  }, []);

  return (
    <div
      className="terminal"
      data-testid={testId}
      data-view-id={viewId}
      data-focused={hasFocus || undefined}
      data-focus-indicator={focusIndicator || undefined}
      role="group"
      aria-label={ariaLabel}
      ref={host}
      onFocus={() => {
        setHasFocus(true);
        onFocus?.();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(false);
        }
      }}
      onPointerDown={onFocus}
    >
      {startFailed && (
        <div className="terminal__error" role="alert">
          <span>Terminal could not start.</span>
          <button
            type="button"
            onClick={() => {
              setStartFailed(false);
              setStartAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
