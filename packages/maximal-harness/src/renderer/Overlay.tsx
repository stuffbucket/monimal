import { useCallback, useEffect, useRef, useState } from 'react';

import { Dialog } from '@stuffbucket/maximal-electron/renderer';

import type {
  AgentApprovalRequest,
  AgentEnd,
  AgentToolEvent,
  ApproveRequest,
  AskAccepted,
  ModelProgress,
  ProviderStatus,
} from '../contracts.js';
import { escapeAction, outsideAction } from './overlay-keys.js';

export interface HarnessTransport {
  hide: () => Promise<void>;
  provider: () => Promise<ProviderStatus>;
  ask: (prompt: string) => Promise<AskAccepted>;
  abort: () => Promise<void>;
  approve: (request: ApproveRequest) => Promise<void>;
  ensureModel: () => Promise<ModelProgress>;
  onDelta: (listener: (text: string) => void) => () => void;
  onTool: (listener: (event: AgentToolEvent) => void) => () => void;
  onApproval: (listener: (request: AgentApprovalRequest) => void) => () => void;
  onEnd: (listener: (result: AgentEnd) => void) => () => void;
  onModelProgress: (listener: (progress: ModelProgress) => void) => () => void;
}

function useTransportEvent<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  listener: (value: T) => void,
): void {
  const current = useRef(listener);
  current.current = listener;
  useEffect(() => subscribe((value) => current.current(value)), [subscribe]);
}

/**
 * The floating command card, backed by the pi coding agent.
 *
 * The window is a full-screen transparent panel. Everything visible here is
 * CSS: a dim scrim, and a card near the bottom of the display. That split
 * comes from `stuffbucket/wiggle`, and it keeps the native surface small.
 *
 * The answer streams. `overlay:ask` returns as soon as the run starts, and
 * text arrives as `agent:delta` events, so a long answer appears as it is
 * written rather than all at once at the end.
 *
 * `overlay-entry.tsx` owns `createRoot` so this module remains a stable React
 * Fast Refresh boundary during development.
 */

function providerLabel(status: ProviderStatus): string {
  switch (status.state) {
    case 'probing':
      return 'Looking for a local model…';
    case 'ready':
      return `${status.provider} · ${status.model}`;
    case 'needs-model':
      return `${status.model} is not downloaded yet`;
    case 'unavailable':
      return status.reason;
  }
}

/** Bytes as a short human figure. Progress text should not jitter in width. */
function megabytes(bytes: number): string {
  return `${String(Math.round(bytes / 1_000_000))} MB`;
}

export function Overlay({ transport }: { transport: HarnessTransport }) {
  const [status, setStatus] = useState<ProviderStatus>({ state: 'probing' });
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [tool, setTool] = useState<string>();
  const [approval, setApproval] = useState<AgentApprovalRequest>();
  const [download, setDownload] = useState<ModelProgress>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const answerBox = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    void transport.hide();
  }, [transport]);

  // Probe on every summon. A backend can come up while the card is closed, and
  // wiggle's promise is that it connects the moment one appears.
  useEffect(() => {
    const probe = () => {
      void transport.provider().then(setStatus);
    };
    probe();
    window.addEventListener('focus', probe);
    return () => window.removeEventListener('focus', probe);
  }, [transport]);

  useEffect(() => {
    const focus = () => input.current?.focus();
    focus();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  useEffect(() => {
    if (status.state === 'ready') input.current?.focus();
  }, [status.state]);

  /* ------------------------------------------------------------- streaming */

  useTransportEvent(transport.onDelta, (text) => {
    setAnswer((current) => current + text);
  });

  useTransportEvent(transport.onTool, ({ name, phase }) => {
    // Show the running tool, then clear it. The user cares that the agent is
    // touching their machine, not about the arguments.
    setTool(phase === 'start' ? name : undefined);
  });

  useTransportEvent(transport.onApproval, setApproval);

  /**
   * The one-time model download.
   *
   * Re-probe once it finishes, so the card moves from "not downloaded" to a
   * ready backend without the user having to dismiss and summon again.
   */
  useTransportEvent(transport.onModelProgress, (progress) => {
    setDownload(progress);
    if (progress.state === 'ready') {
      void transport.provider().then(setStatus);
    }
  });

  const startDownload = useCallback(() => {
    setDownload({ state: 'downloading', received: 0, total: 0 });
    void transport.ensureModel().then(setDownload);
  }, [transport]);

  useTransportEvent(transport.onEnd, (result) => {
    setBusy(false);
    setTool(undefined);
    setApproval(undefined);
    if (!result.ok) setError(result.error);
  });

  /**
   * Answer the pending prompt.
   *
   * The prompt clears immediately rather than waiting for the reply. The main
   * process settles the gate, and a second answer for the same id is ignored,
   * so an impatient double press cannot approve the next call by accident.
   */
  const decide = useCallback(
    (allow: boolean, remember = false) => {
      if (!approval) return;
      void transport.approve({ id: approval.id, allow, remember });
      setApproval(undefined);
    },
    [approval, transport],
  );

  // Keep the newest text in view while it streams.
  useEffect(() => {
    const box = answerBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [answer]);

  /* ---------------------------------------------------------------- input */

  const submit = useCallback(() => {
    const text = prompt.trim();
    if (!text || busy) return;

    setBusy(true);
    setPrompt('');
    setAnswer('');
    setError(undefined);

    void transport.ask(text).then((accepted) => {
      if (accepted.started) return;
      setBusy(false);
      setPrompt(text);
      setError(accepted.reason);
    }).catch(() => {
      setBusy(false);
      setPrompt(text);
      setError('The request could not be started.');
    });
  }, [prompt, busy, transport]);

  /**
   * Enter, when a tool call is waiting.
   *
   * A pending prompt owns the keyboard. The textarea's own Enter handler sends
   * a prompt, so this has to win: it runs on the dialog, above the field, and
   * stops the event there.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!approval) return;
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      decide(true);
    },
    [approval, decide],
  );

  /**
   * Escape, in the order the user means it.
   *
   * Answer the question in front of them first, then stop a run, and only
   * dismiss when there is nothing else to do. Otherwise a long answer keeps
   * streaming into a card nobody can see.
   *
   * `preventDefault` because the dialog never closes itself: this window's
   * visibility belongs to the main process, and `hide` is an IPC call.
   */
  const act = useCallback(
    (action: string) => {
      if (action === 'deny') decide(false);
      else if (action === 'abort') {
        void transport.abort();
        setBusy(false);
      } else hide();
    },
    [decide, hide, transport],
  );

  const onEscape = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      act(escapeAction(Boolean(approval), busy));
    },
    [act, approval, busy],
  );

  /**
   * A click outside the card.
   *
   * Dismissing with a question on screen answers it. Leaving the gate open
   * would park the run until the timeout, and every summon in that window
   * would report the agent as busy.
   */
  const onOutside = useCallback(
    (event: Event) => {
      event.preventDefault();
      for (const action of outsideAction(Boolean(approval))) act(action);
    },
    [act, approval],
  );

  const ready = status.state === 'ready';

  return (
    /*
     * Always open. This window's visibility is the main process's business —
     * `hide` is an IPC call — so the dialog is a description of what the window
     * contains, not a thing that opens and closes.
     *
     * It was a plain div with a click handler before: no role, no accessible
     * name, no focus trap, and Tab walked straight out of the card into
     * nothing. Radix supplies all four; the three behaviours that were already
     * right are preserved through its callbacks rather than a window listener.
     */
    <Dialog
      open
      title="Ask the agent"
      className="sb-shell mh-card"
      overlayClassName="mh-scrim"
      testId="overlay-card"
      onKeyDown={onKeyDown}
      onEscapeKeyDown={onEscape}
      onPointerDownOutside={onOutside}
    >
        {(answer || error) && (
          <div
            className="mh-card__answer"
            ref={answerBox}
            data-testid="overlay-answer"
          >
            {answer}
            {error && <span className="mh-card__error">{error}</span>}
          </div>
        )}

        {status.state === 'needs-model' && (
          <div className="mh-setup" data-testid="overlay-setup">
            <div className="mh-setup__head">
              Download {status.model} to answer without a proxy?
            </div>
            <p className="mh-setup__body">
              About {status.approxMb} MB, once. It runs on this machine, so
              nothing leaves it and there is no key to paste.
            </p>

            {download?.state === 'downloading' ? (
              <div className="mh-setup__progress" data-testid="overlay-download">
                <div
                  className="mh-setup__bar"
                  style={{
                    // Width is data, not decoration, so it stays inline.
                    width: download.total
                      ? `${String(Math.round((download.received / download.total) * 100))}%`
                      : '0%',
                  }}
                />
                <span className="mh-setup__figure">
                  {download.total
                    ? `${megabytes(download.received)} of ${megabytes(download.total)}`
                    : 'Starting…'}
                </span>
              </div>
            ) : (
              <div className="mh-setup__actions">
                <button
                  type="button"
                  className="mh-approval__button mh-approval__button--primary"
                  onClick={startDownload}
                  data-testid="overlay-download-start"
                >
                  {download?.state === 'error' ? 'Try again' : 'Download'}
                </button>
              </div>
            )}

            {download?.state === 'error' && (
              <span className="mh-card__error" data-testid="overlay-download-error">
                {download.reason}
              </span>
            )}
          </div>
        )}

        {approval && (
          <div className="mh-approval" data-testid="overlay-approval">
            <div className="mh-approval__head">
              Run <code className="mh-approval__tool">{approval.tool}</code>?
            </div>
            <pre className="mh-approval__summary" data-testid="overlay-approval-summary">
              {approval.summary}
            </pre>
            <div className="mh-approval__actions">
              <button
                type="button"
                className="mh-approval__button"
                onClick={() => decide(false)}
                data-testid="overlay-deny"
              >
                Deny
              </button>
              <button
                type="button"
                className="mh-approval__button mh-approval__button--primary"
                onClick={() => decide(true)}
                data-testid="overlay-allow"
              >
                Allow
              </button>
              <button
                type="button"
                className="mh-approval__button"
                onClick={() => decide(true, true)}
                data-testid="overlay-allow-always"
              >
                Allow every {approval.tool}
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={input}
          className="mh-card__input"
          rows={2}
          placeholder={ready ? 'Ask anything…' : 'Waiting for a local model…'}
          value={prompt}
          disabled={!ready}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (approval) return;
            // Enter sends. Shift and Enter makes a new line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          data-testid="overlay-input"
        />

        <div className="mh-card__footer">
          <span
            className={`mh-card__status mh-card__status--${status.state}`}
            data-testid="overlay-status"
          >
            {approval
              ? `Waiting for you to approve ${approval.tool}`
              : tool
                ? `Running ${tool}…`
                : busy
                  ? 'Thinking…'
                  : providerLabel(status)}
          </span>
          <span className="mh-card__hint">
            {approval
              ? 'Enter to allow · Esc to deny'
              : busy
                ? 'Esc to stop'
                : 'Enter to send · Esc to dismiss'}
          </span>
        </div>
    </Dialog>
  );
}
