import { useCallback, useEffect, useRef, useState } from 'react';

import { Dialog, Menu } from '@maximal/maximal-electron/renderer';
import { TERMINAL_ICON_URLS } from '@maximal/maximal-assets/terminal-icons';

import type {
  AgentApprovalRequest,
  AgentEffort,
  AgentEnd,
  AgentModelOption,
  AgentToolEvent,
  ApproveRequest,
  AskAccepted,
  AssistantChat,
  AssistantChatListQuery,
  AssistantChatMessage,
  AssistantChatUpdate,
  AssistantOverlayPreferences,
  ModelProgress,
  ProviderStatus,
} from '../contracts.js';
import { HARNESS_CONFIG, HARNESS_COPY } from '../constants.js';
import { escapeAction } from './overlay-keys.js';

function conciseModels(
  models: readonly AgentModelOption[],
  selectedKey?: string,
): AgentModelOption[] {
  const choices = new Map<string, AgentModelOption>();
  for (const model of models) {
    const identity = model.label.trim().toLocaleLowerCase();
    if (!choices.has(identity) || model.key === selectedKey) {
      choices.set(identity, model);
    }
  }
  return [...choices.values()];
}

export interface HarnessTransport {
  hide: () => Promise<void>;
  provider: () => Promise<ProviderStatus>;
  selectModel: (modelKey: string) => Promise<ProviderStatus>;
  selectEffort: (effort: AgentEffort) => Promise<ProviderStatus>;
  ask: (prompt: string, chatId?: string) => Promise<AskAccepted>;
  abort: () => Promise<void>;
  approve: (request: ApproveRequest) => Promise<void>;
  ensureModel: () => Promise<ModelProgress>;
  preferences: () => Promise<AssistantOverlayPreferences>;
  updatePreferences: (
    update: Partial<Pick<AssistantOverlayPreferences, 'candy' | 'approval'>>,
  ) => Promise<AssistantOverlayPreferences>;
  onDelta: (listener: (text: string) => void) => () => void;
  onTool: (listener: (event: AgentToolEvent) => void) => () => void;
  onApproval: (listener: (request: AgentApprovalRequest) => void) => () => void;
  onEnd: (listener: (result: AgentEnd) => void) => () => void;
  onModelProgress: (listener: (progress: ModelProgress) => void) => () => void;
  onPreferences: (
    listener: (preferences: AssistantOverlayPreferences) => void,
  ) => () => void;
  onChatSelected: (listener: (id: string) => void) => () => void;
  chats: {
    list: (query?: AssistantChatListQuery) => Promise<{
      chats: AssistantChat[];
      total: number;
    }>;
    create: (title?: string) => Promise<AssistantChat>;
    open: (id: string) => Promise<AssistantChat>;
    update: (id: string, update: AssistantChatUpdate) => Promise<AssistantChat>;
    remove: (id: string) => Promise<void>;
    messages: (id: string) => Promise<AssistantChatMessage[]>;
  };
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
 * The native window is a compact transparent panel. The card fills that
 * surface with a narrow transparent edge for its shadow.
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
      return HARNESS_COPY.overlay.probing;
    case 'ready': {
      const model = status.models.find((entry) => entry.key === status.modelKey);
      return `${status.provider} · ${model?.label ?? status.model}`;
    }
    case 'select-model':
      return HARNESS_COPY.overlay.modelSelectionRequired;
    case 'needs-model':
      return HARNESS_COPY.overlay.modelMissing(status.model);
    case 'unavailable':
      return status.reason;
  }
}

/** Bytes as a short human figure. Progress text should not jitter in width. */
function megabytes(bytes: number): string {
  return HARNESS_COPY.overlay.megabytes(
    Math.round(bytes / HARNESS_CONFIG.overlay.bytesPerMegabyte),
  );
}

interface ToolActivity {
  id: string;
  name: string;
  state: 'running' | 'complete' | 'failed';
}

function selectedModel(status: ProviderStatus): AgentModelOption | undefined {
  if (status.state !== 'ready') return undefined;
  return status.models.find((model) => model.key === status.modelKey);
}

function ResponseContent({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="mh-response">
      {blocks.map((block, index) => {
        if (block.startsWith('```')) {
          const content = block.slice(3, -3);
          const firstNewline = content.indexOf('\n');
          const language = firstNewline < 0 ? '' : content.slice(0, firstNewline).trim();
          const code = firstNewline < 0 ? content : content.slice(firstNewline + 1);
          return (
            <div className="mh-response__code-wrap" key={index}>
              {language && <span className="mh-response__language">{language}</span>}
              <pre className="mh-response__code"><code>{code}</code></pre>
            </div>
          );
        }
        return <div className="mh-response__text" key={index}>{block}</div>;
      })}
    </div>
  );
}

export function Overlay({ transport }: { transport: HarnessTransport }) {
  const [status, setStatus] = useState<ProviderStatus>({ state: 'probing' });
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [approval, setApproval] = useState<AgentApprovalRequest>();
  const [download, setDownload] = useState<ModelProgress>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [recentChats, setRecentChats] = useState<AssistantChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>();
  const [preferences, setPreferences] = useState<AssistantOverlayPreferences>({
    candy: true,
    approval: 'writes',
    hotkey: '',
  });
  const input = useRef<HTMLTextAreaElement>(null);
  const modelPicker = useRef<HTMLButtonElement>(null);
  const answerBox = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);

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

  const reloadChats = useCallback(() => {
    void transport.chats.list({
      status: 'active',
      sort: 'activity',
      direction: 'desc',
      limit: 5,
    }).then((result) => setRecentChats(result.chats));
  }, [transport]);

  useEffect(reloadChats, [reloadChats]);

  const loadChat = useCallback((id: string) => {
    void transport.chats.open(id).then(() =>
      transport.chats.messages(id)).then((messages) => {
        setActiveChatId(id);
        setAnswer(messages.map((entry) =>
          `${entry.role === 'user' ? 'You' : 'Maximal'}: ${entry.content}`,
        ).join('\n\n'));
        reloadChats();
      });
  }, [reloadChats, transport]);

  useEffect(
    () => transport.onChatSelected(loadChat),
    [loadChat, transport],
  );

  useEffect(() => {
    const focus = () => input.current?.focus();
    focus();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  useEffect(() => {
    void transport.preferences().then(setPreferences);
    return transport.onPreferences(setPreferences);
  }, [transport]);

  useEffect(() => {
    if (status.state === 'ready') input.current?.focus();
    if (status.state === 'select-model') {
      modelPicker.current?.focus();
    }
  }, [status.state]);

  /* ------------------------------------------------------------- streaming */

  useTransportEvent(transport.onDelta, (text) => {
    setAnswer((current) => current + text);
  });

  useTransportEvent(transport.onTool, ({ id, name, phase, isError }) => {
    setTools((current) => {
      if (phase === 'start') {
        const started: ToolActivity = {
          id,
          name,
          state: 'running',
        };
        return [...current.filter((entry) => entry.id !== id), started].slice(-6);
      }
      return current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              state: isError ? 'failed' : 'complete',
            }
          : entry,
      );
    });
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

  const selectModel = useCallback(
    (modelKey: string) => {
      setError(undefined);
      void transport.selectModel(modelKey).then((next) => {
        setStatus(next);
      }).catch(() => {
        setError(HARNESS_COPY.overlay.requestFailed);
      });
    },
    [transport],
  );

  const selectEffort = useCallback(
    (effort: AgentEffort) => {
      setError(undefined);
      void transport.selectEffort(effort).then((next) => {
        setStatus(next);
      }).catch(() => {
        setError(HARNESS_COPY.overlay.requestFailed);
      });
    },
    [transport],
  );

  useTransportEvent(transport.onEnd, (result) => {
    setBusy(false);
    setApproval(undefined);
    if (!result.ok) setError(result.error);
    reloadChats();
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

  // Follow streamed output only while the reader remains near the bottom.
  useEffect(() => {
    const box = answerBox.current;
    if (box && followOutput.current) box.scrollTop = box.scrollHeight;
  }, [answer]);

  /* ---------------------------------------------------------------- input */

  const submit = useCallback(() => {
    const text = prompt.trim();
    if (!text || busy) return;

    setBusy(true);
    setPrompt('');
    setAnswer('');
    setTools([]);
    setError(undefined);
    followOutput.current = true;

    void transport.ask(text, activeChatId).then((accepted) => {
      if (accepted.started) {
        setActiveChatId(accepted.chatId);
        reloadChats();
        return;
      }
      setBusy(false);
      setPrompt(text);
      setError(accepted.reason);
    }).catch(() => {
      setBusy(false);
      setPrompt(text);
      setError(HARNESS_COPY.overlay.requestFailed);
    });
  }, [activeChatId, busy, prompt, reloadChats, transport]);

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

  const ready = status.state === 'ready';
  const currentModel = selectedModel(status);
  const runningTool = [...tools].reverse().find((entry) => entry.state === 'running');

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
      modal={false}
      title={HARNESS_COPY.overlay.title}
      className={`sb-shell mh-card${
        preferences.candy ? ' mh-card--candy shell-candy-surface' : ''
      }`}
      testId="overlay-card"
      onKeyDown={onKeyDown}
      onEscapeKeyDown={onEscape}
    >
        <div className="mh-drag-handle" aria-hidden="true"><span /></div>
        <header className="mh-card__header">
          <img
            className="mh-card__icon shell-candy-surface__icon"
            src={TERMINAL_ICON_URLS.maximal}
            alt=""
          />
          <div className="mh-card__identity shell-candy-surface__text">
            <strong>Maximal Assistant</strong>
            <span>{preferences.hotkey}</span>
          </div>
          <div className="mh-card__conversation">
            <span>Conversation</span>
            <Menu
              align="end"
              contentClassName="mh-control-menu"
              testId="overlay-conversation-menu"
              trigger={(
                <button
                  type="button"
                  className="mh-select-trigger"
                  data-testid="overlay-conversation"
                >
                  <span>{activeChatId
                    ? recentChats.find((chat) => chat.id === activeChatId)?.title ?? 'Recent chat'
                    : 'New chat'}</span>
                  <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
                </button>
              )}
              items={[
                {
                  id: 'new',
                  label: 'New chat',
                  selected: activeChatId === undefined,
                  onSelect: () => {
                    setActiveChatId(undefined);
                    setAnswer('');
                  },
                },
                ...recentChats.map((chat) => ({
                  id: chat.id,
                  label: chat.title,
                  selected: chat.id === activeChatId,
                  onSelect: () => loadChat(chat.id),
                })),
              ]}
            />
          </div>
        </header>
        {(answer || error) && (
          <div
            className="mh-card__answer"
            ref={answerBox}
            data-testid="overlay-answer"
            onScroll={(event) => {
              const box = event.currentTarget;
              followOutput.current =
                box.scrollHeight - box.scrollTop - box.clientHeight < 24;
            }}
          >
            {answer && (
              <>
                <button
                  type="button"
                  className="mh-answer-copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(answer).catch(() => {
                      setError('The response could not be copied.');
                    });
                  }}
                  aria-label="Copy response"
                  title="Copy response"
                >
                  <span aria-hidden="true" />
                </button>
                <ResponseContent text={answer} />
              </>
            )}
            {error && <span className="mh-card__error">{error}</span>}
          </div>
        )}

        {status.state === 'needs-model' && (
          <div className="mh-setup" data-testid="overlay-setup">
            <div className="mh-setup__head">
              {HARNESS_COPY.overlay.downloadPrompt(status.model)}
            </div>
            <p className="mh-setup__body">
              {HARNESS_COPY.overlay.downloadSummary(status.approxMb)}
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
                    : HARNESS_COPY.overlay.downloadStarting}
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
                  {download?.state === 'error'
                    ? HARNESS_COPY.overlay.tryAgain
                    : HARNESS_COPY.overlay.download}
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

        {(status.state === 'ready' || status.state === 'select-model') && (
          <div className="mh-model-picker">
            <span className="mh-model-picker__label">
              {HARNESS_COPY.overlay.modelPickerLabel}
            </span>
            <Menu
              align="end"
              contentClassName="mh-control-menu mh-control-menu--models"
              testId="overlay-model-menu"
              onCloseAutoFocus={(event) => event.preventDefault()}
              trigger={(
                <button
                  ref={modelPicker}
                  type="button"
                  className="mh-select-trigger mh-select-trigger--model"
                  data-testid="overlay-model-picker"
                >
                  <span>
                    {status.state === 'ready'
                      ? status.models.find((model) => model.key === status.modelKey)?.label
                        ?? status.model
                      : HARNESS_COPY.overlay.modelSelectionRequired}
                  </span>
                  <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
                </button>
              )}
              items={conciseModels(
                status.models,
                status.state === 'ready' ? status.modelKey : undefined,
              ).map((model) => ({
                id: model.key,
                label: model.label,
                selected: status.state === 'ready' && model.key === status.modelKey,
                onSelect: () => selectModel(model.key),
              }))}
            />
            {status.state === 'ready' && currentModel?.efforts.length ? (
              <Menu
                align="end"
                contentClassName="mh-control-menu"
                testId="overlay-effort-menu"
                trigger={(
                  <button
                    type="button"
                    className="mh-select-trigger mh-select-trigger--effort"
                    data-testid="overlay-effort"
                  >
                    <span>{status.effort ?? 'Effort'}</span>
                    <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
                  </button>
                )}
                items={currentModel.efforts.map((effort) => ({
                  id: effort,
                  label: effort,
                  selected: status.effort === effort,
                  onSelect: () => selectEffort(effort),
                }))}
              />
            ) : null}
          </div>
        )}

        {tools.length > 0 && (
          <div className="mh-tool-list" aria-label="Tool activity" data-testid="overlay-tools">
            {tools.map((entry) => (
              <div className={`mh-tool mh-tool--${entry.state}`} key={entry.id}>
                <span className="mh-tool__indicator" aria-hidden="true" />
                <code>{entry.name}</code>
                <span>{entry.state}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mh-permission-picker">
          <span>Tool permissions</span>
          <Menu
            align="end"
            contentClassName="mh-control-menu"
            testId="overlay-permissions-menu"
            trigger={(
              <button
                type="button"
                className="mh-select-trigger"
                data-testid="overlay-permissions"
              >
                <span>{preferences.approval === 'all'
                  ? 'Ask every time'
                  : preferences.approval === 'writes'
                    ? 'Ask before changes'
                    : 'Allow tools'}</span>
                <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
              </button>
            )}
            items={[
              {
                id: 'all',
                label: 'Ask for every tool',
                description: 'Approval is required before any tool runs.',
              },
              {
                id: 'writes',
                label: 'Ask before changes',
                description: 'Read-only tools run without interruption.',
              },
              {
                id: 'none',
                label: 'Allow tools',
                description: 'Tools run without asking for approval.',
              },
            ].map((item) => ({
              ...item,
              selected: preferences.approval === item.id,
              onSelect: () => {
                const approval = item.id as AssistantOverlayPreferences['approval'];
                void transport.updatePreferences({ approval }).then(setPreferences);
              },
            }))}
          />
        </div>

        {approval && (
          <div className="mh-approval" data-testid="overlay-approval">
            <div className="mh-approval__head">
              {HARNESS_COPY.overlay.runToolPrefix}{' '}
              <code className="mh-approval__tool">{approval.tool}</code>
              {HARNESS_COPY.overlay.questionMark}
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
                {HARNESS_COPY.overlay.deny}
              </button>
              <button
                type="button"
                className="mh-approval__button mh-approval__button--primary"
                onClick={() => decide(true)}
                data-testid="overlay-allow"
              >
                {HARNESS_COPY.overlay.allow}
              </button>
              <button
                type="button"
                className="mh-approval__button"
                onClick={() => decide(true, true)}
                data-testid="overlay-allow-always"
              >
                {HARNESS_COPY.overlay.allowAlways(approval.tool)}
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={input}
          className="mh-card__input"
          rows={HARNESS_CONFIG.overlay.inputRows}
          placeholder={
            ready
              ? HARNESS_COPY.overlay.readyPlaceholder
              : HARNESS_COPY.overlay.waitingPlaceholder
          }
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
              ? HARNESS_COPY.overlay.approvalStatus(approval.tool)
              : runningTool
                ? HARNESS_COPY.overlay.running(runningTool.name)
                : busy
                  ? HARNESS_COPY.overlay.thinking
                  : providerLabel(status)}
          </span>
          <span className="mh-card__hint">
            {approval
              ? HARNESS_COPY.overlay.approvalHint
              : busy
                ? HARNESS_COPY.overlay.stopHint
                : HARNESS_COPY.overlay.dismissHint}
          </span>
        </div>
    </Dialog>
  );
}
