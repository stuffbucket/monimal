import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import { TERMINAL_ICON_URLS } from '@maximal/maximal-assets/terminal-icons';
import {
  Button,
  Dialog,
  MenuItem,
  MenuRoot,
  Tooltip,
} from '@maximal/maximal-design-system';

import type {
  AgentEffort,
  AgentModelOption,
  AskAccepted,
  AssistantAttachment,
  AssistantChat,
  AssistantChatListQuery,
  AssistantChatMessage,
  AssistantChatUpdate,
  AssistantOverlayPreferences,
  AssistantRunDelta,
  AssistantRunEnd,
  AssistantRunApprovalDecision,
  AssistantRunApprovalRequest,
  AssistantRunToolEvent,
  ModelDownloadProgress,
  ModelDownloadRequest,
  ModelProgress,
  ProviderStatus,
} from '../contracts.js';
import { HARNESS_CONFIG, HARNESS_COPY } from '../constants.js';
import { CandyPaint } from './CandyPaint.js';
import {
  isCurrentGeneration,
  matchesApproval,
  matchesDownload,
  matchesOwnership,
} from './async-ownership.js';
import {
  INITIAL_OVERLAY_OPERATION_STATE,
  overlayOperationCanSubmit,
  overlayOperationCanSwitchChat,
  overlayOperationIsBusy,
  overlayOperationTransition,
} from './overlay-operation.js';

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

interface OverlayMenuItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ size?: number }>;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

function overlayMenuItem({
  id,
  label,
  description,
  icon: Icon,
  selected = false,
  disabled,
  onSelect,
}: OverlayMenuItem): ReactNode {
  return (
    <MenuItem
      aria-current={selected ? 'true' : undefined}
      className={selected ? 'mh-menu-item--selected' : undefined}
      data-testid={`menu-${id}`}
      description={description}
      disabled={disabled}
      key={id}
      leading={Icon ? <Icon size={16} /> : undefined}
      onClick={onSelect}
      trailing={
        selected
          ? <span aria-hidden="true" className="mh-menu-item__indicator">✓</span>
          : undefined
      }
    >
      {label}
    </MenuItem>
  );
}

export interface HarnessTransport {
  initialRunId?: string;
  initialDownload?: ModelDownloadRequest;
  hide: () => Promise<void>;
  provider: () => Promise<ProviderStatus>;
  selectModel: (modelKey: string) => Promise<ProviderStatus>;
  selectEffort: (effort: AgentEffort) => Promise<ProviderStatus>;
  ask: (
    prompt: string,
    runId: string,
    chatId?: string,
    attachments?: AssistantAttachment[],
  ) => Promise<AskAccepted>;
  steer: (prompt: string, chatId?: string) => Promise<boolean>;
  abort: () => Promise<void>;
  approve: (request: AssistantRunApprovalDecision) => Promise<void>;
  ensureModel: (request: ModelDownloadRequest) => Promise<ModelDownloadProgress>;
  preferences: () => Promise<AssistantOverlayPreferences>;
  updatePreferences: (
    update: Partial<Pick<
      AssistantOverlayPreferences,
      'candy' | 'approval' | 'outputFont'
    >>,
  ) => Promise<AssistantOverlayPreferences>;
  onDelta: (listener: (event: AssistantRunDelta) => void) => () => void;
  onTool: (listener: (event: AssistantRunToolEvent) => void) => () => void;
  onApproval: (listener: (request: AssistantRunApprovalRequest) => void) => () => void;
  onEnd: (listener: (event: AssistantRunEnd) => void) => () => void;
  onModelProgress: (listener: (event: ModelDownloadProgress) => void) => () => void;
  onShown: (listener: () => void) => () => void;
  onDismissRequested: (listener: () => void) => () => void;
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
    terminal: (id: string, cols: number, rows: number) => Promise<unknown>;
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

interface ConversationMessage {
  id: string;
  role: AssistantChatMessage['role'];
  content: string;
}

interface PendingAttachment extends AssistantAttachment {
  kind: 'image' | 'document';
}

function ManualPermissionIcon() {
  return <span className="mh-permission-icon" aria-hidden="true">✋</span>;
}

function ReadOnlyPermissionIcon() {
  return <span className="mh-permission-icon" aria-hidden="true">▤</span>;
}

function AssistedPermissionIcon() {
  return <span className="mh-permission-icon" aria-hidden="true">✦</span>;
}

function AutomaticPermissionIcon() {
  return <span className="mh-permission-icon" aria-hidden="true">▷</span>;
}

const PERMISSION_ORDER: AssistantOverlayPreferences['approval'][] = [
  'all',
  'read-only',
  'writes',
  'none',
];

function permissionPresentation(approval: AssistantOverlayPreferences['approval']) {
  switch (approval) {
    case 'all':
      return { label: 'Manually approve', Icon: ManualPermissionIcon };
    case 'read-only':
      return { label: 'Read only', Icon: ReadOnlyPermissionIcon };
    case 'writes':
      return { label: 'Assisted', Icon: AssistedPermissionIcon };
    case 'none':
      return { label: 'Automatically approve', Icon: AutomaticPermissionIcon };
  }
}

const EFFORT_LABELS: Record<AgentEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Maximum',
};

const DOCUMENT_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/yaml',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/xml',
  'text/yaml',
]);
const MAX_ATTACHMENT_BYTES = 10_000_000;
const MAX_ATTACHMENT_TOTAL_BYTES = 25_000_000;

async function attachmentFromFile(file: File): Promise<PendingAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name || 'This file'} exceeds the 10 MB attachment limit.`);
  }
  if (file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'));
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('The image could not be encoded.'));
          return;
        }
        resolve(reader.result);
      };
      reader.readAsDataURL(file);
    });
    return {
      name: file.name || 'Clipboard image',
      mimeType: file.type,
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
      kind: 'image',
    };
  }
  if (file.type.startsWith('text/') || DOCUMENT_TYPES.has(file.type)) {
    return {
      name: file.name,
      mimeType: file.type || 'text/plain',
      data: await file.text(),
      kind: 'document',
    };
  }
  throw new Error(`${file.name || 'This file'} is not a supported image or text document.`);
}

function selectedModel(status: ProviderStatus): AgentModelOption | undefined {
  if (status.state !== 'ready') return undefined;
  return status.models.find((model) => model.key === status.modelKey);
}

function toolActivityLabel(tool: string): string {
  const normalized = tool.toLocaleLowerCase();
  if (normalized.includes('search')) return 'Searching the web';
  if (normalized.includes('read')) return 'Reading context';
  if (normalized.includes('write') || normalized.includes('edit')) return 'Updating files';
  if (normalized.includes('bash') || normalized.includes('shell')) return 'Running a command';
  return `Using ${tool}`;
}

function inactiveStatusLabel(status: ProviderStatus): string {
  switch (status.state) {
    case 'probing':
      return HARNESS_COPY.overlay.probing;
    case 'select-model':
      return HARNESS_COPY.overlay.modelSelectionRequired;
    case 'needs-model':
      return HARNESS_COPY.overlay.modelMissing(status.model);
    case 'unavailable':
      return status.reason;
    case 'ready':
      return '';
  }
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
  const [animationPhase, setAnimationPhase] = useState<'entering' | 'open' | 'exiting'>(
    'entering',
  );
  const [status, setStatus] = useState<ProviderStatus>({ state: 'probing' });
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [approval, setApproval] = useState<AssistantRunApprovalRequest>();
  const [download, setDownload] = useState<ModelProgress>();
  const [error, setError] = useState<string>();
  const [operation, dispatchOperation] = useReducer(
    overlayOperationTransition,
    INITIAL_OVERLAY_OPERATION_STATE,
  );
  const [recentChats, setRecentChats] = useState<AssistantChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>();
  const [preferences, setPreferences] = useState<AssistantOverlayPreferences>({
    candy: true,
    approval: 'writes',
    outputFont: 'auto',
    hotkey: '',
  });
  const [permissionSelected, setPermissionSelected] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [outputExpanded, setOutputExpanded] = useState(true);
  const [backgrounded, setBackgrounded] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [terminalConfirmation, setTerminalConfirmation] = useState(false);
  const [approvalResolving, setApprovalResolving] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const modelPicker = useRef<HTMLButtonElement>(null);
  const answerBox = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissalStarted = useRef(false);
  const dismissalCompleted = useRef(false);
  const operationRef = useRef(operation);
  const providerGeneration = useRef(0);
  const chatListGeneration = useRef(0);
  const chatLoadGeneration = useRef(0);
  const preferenceGeneration = useRef(0);
  const pendingMessageSequence = useRef(0);
  const activeRunId = useRef<string | undefined>(transport.initialRunId);
  const downloadSequence = useRef(0);
  const activeDownload = useRef<ModelDownloadRequest | undefined>(
    transport.initialDownload,
  );
  const approvalRef = useRef(approval);
  operationRef.current = operation;
  approvalRef.current = approval;
  const busy = overlayOperationIsBusy(operation);

  useEffect(() => () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const finishDismissal = useCallback(() => {
    if (dismissalCompleted.current) return;
    dismissalCompleted.current = true;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = undefined;
    void transport.hide();
  }, [transport]);

  const hide = useCallback(() => {
    if (dismissalStarted.current) return;
    dismissalStarted.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finishDismissal();
      return;
    }
    setAnimationPhase('exiting');
    dismissTimer.current = setTimeout(finishDismissal, 250);
  }, [finishDismissal]);

  const summon = useCallback(() => {
    dismissalStarted.current = false;
    dismissalCompleted.current = false;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = undefined;
    setAnimationPhase('entering');
    input.current?.focus();
    requestAnimationFrame(() => input.current?.focus());
  }, []);

  const onCardAnimationEnd = useCallback(
    (event: AnimationEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.dataset.testid !== 'overlay-card') {
        return;
      }
      if (animationPhase === 'exiting') {
        finishDismissal();
        return;
      }
      if (animationPhase === 'entering') {
        setAnimationPhase('open');
        input.current?.focus();
      }
    },
    [animationPhase, finishDismissal],
  );

  useEffect(() => transport.onDismissRequested(hide), [hide, transport]);
  useEffect(() => transport.onShown(summon), [summon, transport]);
  useEffect(() => {
    document.addEventListener('animationend', onCardAnimationEnd);
    return () => document.removeEventListener('animationend', onCardAnimationEnd);
  }, [onCardAnimationEnd]);

  // Probe on every summon. A backend can come up while the card is closed, and
  // wiggle's promise is that it connects the moment one appears.
  useEffect(() => {
    const probe = () => {
      const generation = ++providerGeneration.current;
      void transport.provider().then((next) => {
        if (isCurrentGeneration(providerGeneration.current, generation)) setStatus(next);
      }).catch(() => {
        if (isCurrentGeneration(providerGeneration.current, generation)) {
          setStatus({ state: 'unavailable', reason: HARNESS_COPY.overlay.requestFailed });
        }
      });
    };
    probe();
    window.addEventListener('focus', probe);
    return () => window.removeEventListener('focus', probe);
  }, [transport]);

  const reloadChats = useCallback(() => {
    const generation = ++chatListGeneration.current;
    void transport.chats.list({
      status: 'active',
      sort: 'activity',
      direction: 'desc',
      limit: 5,
    }).then((result) => {
      if (chatListGeneration.current === generation) setRecentChats(result.chats);
    }).catch(() => {
      if (chatListGeneration.current === generation) {
        setError('Recent conversations could not be loaded.');
      }
    });
  }, [transport]);

  useEffect(reloadChats, [reloadChats]);

  const loadChat = useCallback((id: string) => {
    if (!overlayOperationCanSwitchChat(operationRef.current)) return;
    const generation = ++chatLoadGeneration.current;
    void transport.chats.open(id).then(() =>
      transport.chats.messages(id)).then((messages) => {
        if (
          chatLoadGeneration.current !== generation
          || !overlayOperationCanSwitchChat(operationRef.current)
        ) return;
        setActiveChatId(id);
        setMessages(messages.map((entry) => ({
          id: String(entry.id),
          role: entry.role,
          content: entry.content,
        })));
        setAnswer('');
        reloadChats();
      }).catch(() => {
        if (chatLoadGeneration.current === generation) {
          setError('The conversation could not be loaded.');
        }
      });
  }, [reloadChats, transport]);

  useEffect(
    () => transport.onChatSelected(loadChat),
    [loadChat, transport],
  );

  useEffect(() => {
    summon();
    window.addEventListener('focus', summon);
    return () => window.removeEventListener('focus', summon);
  }, [summon]);

  useEffect(() => {
    const generation = ++preferenceGeneration.current;
    void transport.preferences().then((next) => {
      if (preferenceGeneration.current === generation) setPreferences(next);
    }).catch(() => {
      if (preferenceGeneration.current === generation) {
        setError('Assistant preferences could not be loaded.');
      }
    });
    return transport.onPreferences((next) => {
      preferenceGeneration.current += 1;
      setPreferences(next);
    });
  }, [transport]);

  useEffect(() => {
    if (status.state === 'ready') input.current?.focus();
    if (status.state === 'select-model') {
      modelPicker.current?.focus();
    }
  }, [status.state]);

  /* ------------------------------------------------------------- streaming */

  useTransportEvent(transport.onDelta, (event) => {
    if (!matchesOwnership(activeRunId.current, event.runId)) return;
    setAnswer((current) => current + event.text);
  });

  useTransportEvent(transport.onTool, ({ runId, id, name, phase, isError }) => {
    if (!matchesOwnership(activeRunId.current, runId)) return;
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

  useTransportEvent(transport.onApproval, (request) => {
    if (!matchesOwnership(activeRunId.current, request.runId)) return;
    setApproval(request);
  });

  /**
   * The one-time model download.
   *
   * Re-probe once it finishes, so the card moves from "not downloaded" to a
   * ready backend without the user having to dismiss and summon again.
   */
  const applyModelProgress = useCallback((event: ModelDownloadProgress) => {
    if (!matchesDownload(activeDownload.current, event)) return;
    const { progress } = event;
    setDownload(progress);
    if (progress.state === 'ready') {
      activeDownload.current = undefined;
      const generation = ++providerGeneration.current;
      void transport.provider().then((next) => {
        if (isCurrentGeneration(providerGeneration.current, generation)) setStatus(next);
      }).catch(() => {
        if (isCurrentGeneration(providerGeneration.current, generation)) {
          setStatus({ state: 'unavailable', reason: HARNESS_COPY.overlay.requestFailed });
        }
      });
    }
  }, [transport]);

  useTransportEvent(transport.onModelProgress, applyModelProgress);

  const startDownload = useCallback(() => {
    if (status.state !== 'needs-model') return;
    const request = {
      downloadId: `download-${String(++downloadSequence.current)}`,
      model: status.model,
    };
    activeDownload.current = request;
    setDownload({ state: 'downloading', received: 0, total: 0 });
    void transport.ensureModel(request).then(applyModelProgress).catch(() => {
      if (!matchesDownload(activeDownload.current, request)) return;
      activeDownload.current = undefined;
      setDownload({ state: 'error', reason: HARNESS_COPY.overlay.requestFailed });
    });
  }, [applyModelProgress, status, transport]);

  const selectModel = useCallback(
    (modelKey: string) => {
      const generation = ++providerGeneration.current;
      activeDownload.current = undefined;
      setError(undefined);
      void transport.selectModel(modelKey).then((next) => {
        if (isCurrentGeneration(providerGeneration.current, generation)) setStatus(next);
      }).catch(() => {
        if (isCurrentGeneration(providerGeneration.current, generation)) {
          setError(HARNESS_COPY.overlay.requestFailed);
        }
      });
    },
    [transport],
  );

  const selectEffort = useCallback(
    (effort: AgentEffort) => {
      const generation = ++providerGeneration.current;
      setError(undefined);
      void transport.selectEffort(effort).then((next) => {
        if (isCurrentGeneration(providerGeneration.current, generation)) setStatus(next);
      }).catch(() => {
        if (isCurrentGeneration(providerGeneration.current, generation)) {
          setError(HARNESS_COPY.overlay.requestFailed);
        }
      });
    },
    [transport],
  );

  useTransportEvent(transport.onEnd, ({ runId, result }) => {
    if (!matchesOwnership(activeRunId.current, runId)) return;
    activeRunId.current = undefined;
    dispatchOperation({ type: 'end' });
    setApproval(undefined);
    setApprovalResolving(false);
    if (!result.ok) setError(result.error);
    if (
      backgrounded
      && typeof Notification !== 'undefined'
      && Notification.permission === 'granted'
    ) {
      new Notification('Maximal Assistant', {
        body: result.ok ? 'Your response is ready.' : result.error,
      });
      setBackgrounded(false);
    }
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
      if (!approval || approvalResolving) return;
      const request = approval;
      setApprovalResolving(true);
      void transport.approve({
        runId: request.runId,
        id: request.id,
        allow,
        remember,
      }).then(() => {
        if (!matchesApproval(activeRunId.current, approvalRef.current, request)) return;
        setApproval(undefined);
        setApprovalResolving(false);
      }).catch(() => {
        if (!matchesApproval(activeRunId.current, approvalRef.current, request)) return;
        setApprovalResolving(false);
        setError('The approval decision could not be sent.');
      });
    },
    [approval, approvalResolving, transport],
  );

  const updateApprovalPreference = useCallback(
    (approval: AssistantOverlayPreferences['approval']) => {
      setPermissionSelected(true);
      void transport.updatePreferences({ approval }).then(setPreferences).catch(() => {
        setPermissionSelected(false);
        setError('Assistant preferences could not be updated.');
      });
    },
    [transport],
  );

  // Follow streamed output only while the reader remains near the bottom.
  useEffect(() => {
    const box = answerBox.current;
    if (box && followOutput.current) box.scrollTop = box.scrollHeight;
  }, [answer]);

  /* ---------------------------------------------------------------- input */

  const addFiles = useCallback((files: FileList | readonly File[]) => {
    const candidates = [...files].slice(0, 8 - attachments.length);
    const pendingBytes = attachments.reduce(
      (total, attachment) => total + attachment.data.length,
      0,
    );
    const candidateBytes = candidates.reduce((total, file) => total + file.size, 0);
    if (pendingBytes + candidateBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      setError('Attachments exceed the 25 MB combined limit.');
      return;
    }
    void Promise.all(candidates.map(attachmentFromFile)).then((added) => {
      setAttachments((current) => [...current, ...added].slice(0, 8));
      setError(undefined);
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [attachments.length]);

  const submit = useCallback(() => {
    const text = prompt.trim();
    if (!text && attachments.length === 0) return;
    if (text === '/exit' || text === '/quit') {
      hide();
      return;
    }
    if (text === '/terminal' || text === '!') {
      if (!activeChatId) {
        setError('Start a conversation before opening it in the terminal.');
        return;
      }
      void transport.chats.terminal(activeChatId, 80, 24).then(
        () => transport.hide(),
        () => setError('The conversation could not be opened in the terminal.'),
      );
      return;
    }
    if (!overlayOperationCanSubmit(operation)) return;
    const pendingId = `pending-${String(++pendingMessageSequence.current)}`;
    const submittedAttachments = attachments;
    const displayText = text || `Attached ${String(attachments.length)} file(s)`;
    const documentContext = attachments
      .filter((attachment) => attachment.kind === 'document')
      .map((attachment) =>
        `<attachment name="${attachment.name}">\n${attachment.data}\n</attachment>`)
      .join('\n\n');
    const effectivePrompt = [
      text.startsWith('!')
        ? `Run this exact shell command with the bash tool and report its output:\n${text.slice(1).trim()}`
        : text,
      documentContext,
    ].filter(Boolean).join('\n\n');

    setPromptHistory((current) => [displayText, ...current.filter((entry) => entry !== displayText)]
      .slice(0, 100));
    setHistoryIndex(-1);
    setPrompt('');
    setAttachments([]);
    setMessages((current) => [
      ...current,
      {
        id: pendingId,
        role: 'user',
        content: displayText,
      },
    ]);
    setOutputExpanded(true);
    followOutput.current = true;

    const restoreDraft = () => {
      setPrompt((current) => current || text);
      setAttachments((current) => current.length > 0 ? current : submittedAttachments);
    };

    if (operation === 'running') {
      const steeringPrompt = effectivePrompt.replace(/^\/btw(?:\s+|$)/, '').trim();
      void transport.steer(steeringPrompt, activeChatId).then((accepted) => {
        if (!accepted) {
          setMessages((current) => current.filter((entry) => entry.id !== pendingId));
          restoreDraft();
          setError('The current response could not be steered.');
        }
      }).catch(() => {
        setMessages((current) => current.filter((entry) => entry.id !== pendingId));
        restoreDraft();
        setError(HARNESS_COPY.overlay.requestFailed);
      });
      return;
    }

    const runId = pendingId;
    activeRunId.current = runId;
    dispatchOperation({ type: 'submit' });
    setAnswer('');
    setTools([]);
    setError(undefined);

    const imageAttachments = attachments
      .filter((attachment) => attachment.kind === 'image')
      .map(({ name, mimeType, data }) => ({ name, mimeType, data }));
    const ask = imageAttachments.length === 0
      ? transport.ask(effectivePrompt, runId, activeChatId)
      : transport.ask(
          effectivePrompt,
          runId,
          activeChatId,
          imageAttachments,
        );
    void ask.then((accepted) => {
      if (!matchesOwnership(activeRunId.current, runId)) return;
      if (accepted.started) {
        if (accepted.runId !== runId) {
          activeRunId.current = undefined;
          dispatchOperation({ type: 'request-rejected' });
          restoreDraft();
          setMessages((current) => current.filter((entry) => entry.id !== pendingId));
          setError('The response started with an unexpected operation identity.');
          return;
        }
        dispatchOperation({ type: 'request-accepted' });
        setActiveChatId(accepted.chatId);
        reloadChats();
        return;
      }
      activeRunId.current = undefined;
      dispatchOperation({ type: 'request-rejected' });
      restoreDraft();
      setMessages((current) => current.filter((entry) => entry.id !== pendingId));
      setError(accepted.reason);
    }).catch(() => {
      if (!matchesOwnership(activeRunId.current, runId)) return;
      activeRunId.current = undefined;
      dispatchOperation({ type: 'request-rejected' });
      restoreDraft();
      setMessages((current) => current.filter((entry) => entry.id !== pendingId));
      setError(HARNESS_COPY.overlay.requestFailed);
    });
  }, [activeChatId, attachments, hide, operation, prompt, reloadChats, transport]);

  const abort = useCallback(() => {
    if (operation === 'idle' || operation.startsWith('aborting:')) return;
    const runId = activeRunId.current;
    dispatchOperation({ type: 'abort' });
    void transport.abort().catch(() => {
      if (
        runId === undefined
        || !matchesOwnership(activeRunId.current, runId)
        || operationRef.current === 'idle'
      ) return;
      dispatchOperation({ type: 'abort-failed' });
      setError('The current response could not be stopped.');
    });
  }, [operation, transport]);

  const openInTerminal = useCallback(() => {
    if (!activeChatId) return;
    setTerminalConfirmation(false);
    void transport.chats.terminal(activeChatId, 80, 24).then(
      () => transport.hide(),
      () => setError('The conversation could not be opened in the terminal.'),
    );
  }, [activeChatId, transport]);

  /**
   * Command+Enter, when a tool call is waiting.
   *
   * A pending prompt owns the keyboard. The textarea's own Enter handler sends
   * a prompt, so this has to win: it runs on the dialog, above the field, and
   * stops the event there.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.metaKey && event.key === 'Tab') {
        event.preventDefault();
        const index = PERMISSION_ORDER.indexOf(preferences.approval);
        const approval = PERMISSION_ORDER[(index + 1) % PERMISSION_ORDER.length] ?? 'all';
        updateApprovalPreference(approval);
        return;
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === 'o') {
        event.preventDefault();
        setOutputExpanded((current) => !current);
        return;
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === 'b') {
        if (
          busy
          && typeof Notification !== 'undefined'
          && Notification.permission === 'granted'
        ) {
          event.preventDefault();
          setBackgrounded(true);
          hide();
        }
        return;
      }
      if (approval && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        decide(true);
      }
    },
    [approval, busy, decide, hide, preferences.approval, updateApprovalPreference],
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
  const onEscape = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      if (approval) {
        decide(false);
        return;
      }
      if (busy) {
        abort();
        return;
      }
      if (prompt || attachments.length > 0) {
        setPrompt('');
        setAttachments([]);
        setHistoryIndex(-1);
        return;
      }
      hide();
    },
    [abort, approval, attachments.length, busy, decide, hide, prompt],
  );

  const ready = status.state === 'ready';
  const currentModel = selectedModel(status);
  const currentPermission = permissionPresentation(preferences.approval);
  const CurrentPermissionIcon = currentPermission.Icon;
  const runningTool = [...tools].reverse().find((entry) => entry.state === 'running');
  const hasAssistantResponse =
    answer.trim().length > 0
    || messages.some(
      (message) => message.role === 'assistant' && message.content.trim().length > 0,
    );
  const selectedModelUnavailable =
    status.state === 'select-model' && status.preferredModel !== undefined;
  const showStage = outputExpanded && (
    messages.length > 0
    || answer.length > 0
    || error !== undefined
    || approval !== undefined
    || tools.length > 0
    || status.state === 'needs-model'
    || selectedModelUnavailable
    || terminalConfirmation
  );

  return (
    /*
     * Always open. This window's visibility is the main process's business —
     * `hide` is an IPC call — so the dialog is a description of what the window
     * contains, not a thing that opens and closes.
     *
     * It was a plain div with a click handler before: no role, no accessible
     * name, no focus trap, and Tab walked straight out of the card into
     * nothing. The design-system dialog supplies all four; the three behaviours
     * that were already right are preserved through its callbacks rather than
     * a window listener.
     */
    <>
      <div
        className="mh-click-away"
        data-testid="overlay-click-away"
        onPointerDown={hide}
      />
      <Dialog
        open
        modal={false}
        title={HARNESS_COPY.overlay.title}
        className={`mh-card mh-card--${animationPhase}${
          showStage ? ' mh-card--expanded' : ''
        }${
          preferences.candy ? ' mh-card-candy mh-candy-surface' : ''
        } mh-card--font-${preferences.outputFont}`}
        overlayClassName="mh-dialog-backdrop"
        viewportClassName="mh-dialog-viewport"
        popupProps={{ 'data-testid': 'overlay-card' }}
        onKeyDown={onKeyDown}
        onEscapeKeyDown={onEscape}
      >
        {preferences.candy && <CandyPaint />}
        <header className="mh-card__header">
          <img
            className="mh-card__icon mh-candy-surface__icon"
            src={TERMINAL_ICON_URLS.maximal}
            alt=""
          />
          <div className="mh-card__identity mh-candy-surface__text">
            <strong>Maximal Assistant</strong>
            <span>{preferences.hotkey}</span>
          </div>
          <div className="mh-card__conversation">
            <span>Conversation</span>
            <MenuRoot
              popupProps={{
                className: 'mh-control-menu mh-control-menu--conversation',
                'data-testid': 'overlay-conversation-menu',
              }}
              trigger={(
                <Button
                  className="mh-select-trigger"
                  data-testid="overlay-conversation"
                  disabled={!overlayOperationCanSwitchChat(operation)}
                >
                  <span>{activeChatId
                    ? recentChats.find((chat) => chat.id === activeChatId)?.title ?? 'Recent chat'
                    : 'New chat'}</span>
                  <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
                </Button>
              )}
            >
              {[
                {
                  id: 'new',
                  label: 'New chat',
                  selected: activeChatId === undefined,
                  onSelect: () => {
                    setActiveChatId(undefined);
                    setMessages([]);
                    setAnswer('');
                  },
                },
                ...recentChats.map((chat) => ({
                  id: chat.id,
                  label: chat.title,
                  selected: chat.id === activeChatId,
                  onSelect: () => loadChat(chat.id),
                })),
              ].map(overlayMenuItem)}
            </MenuRoot>
          </div>
        </header>
        {showStage && (
          <div className="mh-card__stage" data-testid="overlay-stage">
            <div
              className={`mh-card__answer${scrolling ? ' mh-card__answer-scrolling' : ''}`}
              ref={answerBox}
              data-testid="overlay-answer"
              onScroll={(event) => {
                const box = event.currentTarget;
                followOutput.current =
                  box.scrollHeight - box.scrollTop - box.clientHeight < 24;
                setScrolling(true);
                if (scrollTimer.current) clearTimeout(scrollTimer.current);
                scrollTimer.current = setTimeout(() => setScrolling(false), 700);
              }}
            >
              {messages.map((message) => (
                <article
                  className={`mh-message mh-message--${message.role}`}
                  key={message.id}
                  data-role={message.role}
                >
                  <span className="mh-message__role">
                    {message.role === 'user'
                      ? 'You'
                      : message.role === 'assistant'
                        ? 'Maximal'
                        : 'System'}
                  </span>
                  <ResponseContent text={message.content} />
                </article>
              ))}
              {selectedModelUnavailable && (
                <article
                  className="mh-message mh-message--system"
                  data-testid="overlay-model-unavailable"
                >
                  <span className="mh-message__role">System</span>
                  <ResponseContent text={HARNESS_COPY.overlay.selectedModelUnavailable} />
                </article>
              )}
              {answer && (
                <article className="mh-message mh-message--assistant" data-role="assistant">
                  <span className="mh-message__role">Maximal</span>
                  <Tooltip
                    trigger={<button
                      type="button"
                      className="mh-answer-copy"
                      onClick={() => {
                        void navigator.clipboard.writeText(answer).catch(() => {
                          setError('The response could not be copied.');
                        });
                      }}
                      aria-label="Copy response"
                    >
                      <span aria-hidden="true" />
                    </button>}
                  >
                    Copy response
                  </Tooltip>
                  <ResponseContent text={answer} />
                </article>
              )}
              {error && <span className="mh-card__error">{error}</span>}
              {status.state === 'needs-model' && (
                <article className="mh-message mh-message--system" data-testid="overlay-setup">
                  <span className="mh-message__role">System</span>
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
                      <Button
                        className="mh-pill"
                        variant="primary"
                        onClick={startDownload}
                        data-testid="overlay-download-start"
                      >
                        {download?.state === 'error'
                          ? HARNESS_COPY.overlay.tryAgain
                          : HARNESS_COPY.overlay.download}
                      </Button>
                    </div>
                  )}
                  {download?.state === 'error' && (
                    <span className="mh-card__error" data-testid="overlay-download-error">
                      {download.reason}
                    </span>
                  )}
                </article>
              )}
              {tools.length > 0 && (
                <div className="mh-tool-list" aria-label="Tool activity" data-testid="overlay-tools">
                  {tools.map((entry) => (
                    <details
                      className={`mh-tool mh-tool-${entry.state}`}
                      key={entry.id}
                      open={entry.state === 'running'}
                    >
                      <summary>
                        <span className="mh-tool__indicator" aria-hidden="true" />
                        <span>{toolActivityLabel(entry.name)}</span>
                        <span className="mh-tool__chevron" aria-hidden="true">⌄</span>
                      </summary>
                      <div className="mh-tool__detail">
                        <code>{entry.name}</code>
                        <span>{entry.state}</span>
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {approval && (
                <article className="mh-message mh-message--approval" data-testid="overlay-approval">
                  <span className="mh-message__role">Permission required</span>
                  <div className="mh-approval__head">
                    {HARNESS_COPY.overlay.runToolPrefix}{' '}
                    <code className="mh-approval__tool">{approval.tool}</code>
                    {HARNESS_COPY.overlay.questionMark}
                  </div>
                  <pre className="mh-approval__summary" data-testid="overlay-approval-summary">
                    {approval.summary}
                  </pre>
                  <div className="mh-approval__actions">
                    <Button
                      className="mh-pill"
                      onClick={() => decide(false)}
                      data-testid="overlay-deny"
                      disabled={approvalResolving}
                    >
                      {HARNESS_COPY.overlay.skip}
                      <kbd>Esc</kbd>
                    </Button>
                    <Button
                      className="mh-pill"
                      variant="primary"
                      onClick={() => decide(true)}
                      data-testid="overlay-allow"
                      disabled={approvalResolving}
                    >
                      {HARNESS_COPY.overlay.allow}
                      <kbd>⌘↵</kbd>
                    </Button>
                  </div>
                </article>
              )}
              {terminalConfirmation && (
                <article
                  className="mh-message mh-message--approval"
                  data-testid="overlay-terminal-confirmation"
                >
                  <span className="mh-message__role">Open in terminal</span>
                  <div className="mh-approval__head">
                    Launch this conversation in a Maximal terminal?
                  </div>
                  <div className="mh-approval__actions">
                    <Button
                      onClick={() => setTerminalConfirmation(false)}
                      data-testid="overlay-terminal-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={openInTerminal}
                      data-testid="overlay-terminal-confirm"
                    >
                      Open terminal
                    </Button>
                  </div>
                </article>
              )}
            </div>
          </div>
        )}

        {(status.state === 'ready' || status.state === 'select-model') && (
          <div className="mh-model-picker">
            <span className="mh-model-picker__label">
              {HARNESS_COPY.overlay.modelPickerLabel}
            </span>
            <MenuRoot
              popupProps={{
                className: 'mh-control-menu mh-control-menu--model',
                'data-testid': 'overlay-model-menu',
              }}
              trigger={(
                <Button
                  ref={modelPicker}
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
                </Button>
              )}
            >
              {conciseModels(
                status.models,
                status.state === 'ready' ? status.modelKey : undefined,
              ).map((model) => ({
                id: model.key,
                label: model.label,
                selected: status.state === 'ready' && model.key === status.modelKey,
                onSelect: () => selectModel(model.key),
              })).map(overlayMenuItem)}
            </MenuRoot>
            {status.state === 'ready' && currentModel?.efforts.length ? (
              <MenuRoot
                popupProps={{
                  className: 'mh-control-menu mh-control-menu--effort',
                  'data-testid': 'overlay-effort-menu',
                }}
                trigger={(
                  <Button
                    className="mh-select-trigger mh-select-trigger--effort"
                    data-testid="overlay-effort"
                  >
                    <span>{status.effort ? EFFORT_LABELS[status.effort] : 'Effort'}</span>
                    <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
                  </Button>
                )}
              >
                {currentModel.efforts.map((effort) => ({
                  id: effort,
                  label: EFFORT_LABELS[effort],
                  selected: status.effort === effort,
                  onSelect: () => selectEffort(effort),
                })).map(overlayMenuItem)}
              </MenuRoot>
            ) : null}
          </div>
        )}

        <div className="mh-permission-picker">
          <span>Tool permissions</span>
          <MenuRoot
            popupProps={{
              className: 'mh-control-menu mh-control-menu--permissions',
              'data-testid': 'overlay-permissions-menu',
            }}
            trigger={(
              <Button
                className="mh-select-trigger"
                data-testid="overlay-permissions"
              >
                <span className="mh-permission-picker__value">
                  {permissionSelected && <CurrentPermissionIcon />}
                  {permissionSelected ? currentPermission.label : 'Permissions'}
                </span>
                <span className="mh-select-trigger__chevron" aria-hidden="true">⌄</span>
              </Button>
            )}
          >
            {[
              {
                id: 'all',
                label: 'Manually approve',
                description: 'Confirm every tool before it runs.',
                icon: ManualPermissionIcon,
              },
              {
                id: 'read-only',
                label: 'Read only',
                description: 'Inspect files and context without making changes.',
                icon: ReadOnlyPermissionIcon,
              },
              {
                id: 'writes',
                label: 'Assisted',
                description: 'Reads run automatically. Changes need approval.',
                icon: AssistedPermissionIcon,
              },
              {
                id: 'none',
                label: 'Automatically approve',
                description: 'Run all tools without prompting.',
                icon: AutomaticPermissionIcon,
              },
            ].map((item) => ({
              ...item,
              selected: preferences.approval === item.id,
              onSelect: () => {
                const approval = item.id as AssistantOverlayPreferences['approval'];
                updateApprovalPreference(approval);
              },
            })).map(overlayMenuItem)}
          </MenuRoot>
        </div>

        <div
          className="mh-card__prompt"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            if (event.dataTransfer.files.length === 0) return;
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
        >
          <img
            className="mh-card__prompt-icon"
            src={TERMINAL_ICON_URLS.maximal}
            alt=""
          />
          <input
            ref={fileInput}
            className="mh-file-input"
            type="file"
            multiple
            accept="image/*,text/*,.json,.md,.csv,.xml,.yaml,.yml"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
            tabIndex={-1}
            aria-hidden="true"
            data-testid="overlay-file-input"
          />
          <div className="mh-composer">
            {attachments.length > 0 && (
              <div className="mh-attachments" data-testid="overlay-attachments">
                {attachments.map((attachment, index) => (
                  <Tooltip
                    key={`${attachment.name}-${String(index)}`}
                    trigger={<button
                      type="button"
                      className="mh-attachment"
                      onClick={() => {
                        setAttachments((current) =>
                          current.filter((_, currentIndex) => currentIndex !== index));
                      }}
                      aria-label={`Remove ${attachment.name}`}
                    >
                      <span aria-hidden="true">{attachment.kind === 'image' ? '▧' : '▤'}</span>
                      <span>{attachment.name}</span>
                      <span aria-hidden="true">×</span>
                    </button>}
                  >
                    {`Remove ${attachment.name}`}
                  </Tooltip>
                ))}
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
            onPaste={(event) => {
              const files = [...event.clipboardData.items]
                .filter((item) => item.kind === 'file')
                .flatMap((item) => {
                  const file = item.getAsFile();
                  return file ? [file] : [];
                });
              if (files.length === 0) return;
              event.preventDefault();
              addFiles(files);
            }}
            onKeyDown={(event) => {
              if (approval) return;
              if (
                event.key === 'ArrowUp'
                && !event.altKey
                && !event.ctrlKey
                && !event.metaKey
                && event.currentTarget.selectionStart === 0
                && !prompt.includes('\n')
                && promptHistory.length > 0
              ) {
                event.preventDefault();
                const next = Math.min(historyIndex + 1, promptHistory.length - 1);
                setHistoryIndex(next);
                setPrompt(promptHistory[next] ?? '');
                return;
              }
              if (
                event.key === 'ArrowDown'
                && !event.altKey
                && !event.ctrlKey
                && !event.metaKey
                && event.currentTarget.selectionStart === prompt.length
                && !prompt.includes('\n')
                && historyIndex >= 0
              ) {
                event.preventDefault();
                const next = historyIndex - 1;
                setHistoryIndex(next);
                setPrompt(next < 0 ? '' : promptHistory[next] ?? '');
                return;
              }
              // Enter sends. Shift and Enter makes a new line.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            data-testid="overlay-input"
          />
          </div>
          <div className="mh-composer__actions">
            <Tooltip
              trigger={<button
                type="button"
                className="mh-composer__button"
                aria-label="Attach files"
                onClick={() => {
                  fileInput.current?.click();
                }}
                data-testid="overlay-attach"
              >
                <span aria-hidden="true">+</span>
              </button>}
            >
              Attach files
            </Tooltip>
            <Tooltip
              trigger={<button
                type="button"
                className="mh-composer__button"
                aria-label="Open conversation in terminal"
                disabled={activeChatId === undefined || !hasAssistantResponse}
                onClick={() => {
                  setTerminalConfirmation(true);
                  setOutputExpanded(true);
                }}
                data-testid="overlay-open-terminal"
              >
                <svg
                  className="mh-terminal-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                  <path d="m6 7 2 2-2 2M10.5 12h3.5" />
                </svg>
              </button>}
            >
              Open conversation in terminal
            </Tooltip>
            <Tooltip
              trigger={<button
                type="button"
                className="mh-composer__button mh-composer__button-send"
                aria-label={busy ? 'Stop response' : 'Send message'}
                disabled={!busy && (!ready || (prompt.trim().length === 0 && attachments.length === 0))}
                onClick={() => {
                  if (busy) {
                    abort();
                  } else {
                    submit();
                  }
                }}
                data-testid={busy ? 'overlay-stop' : 'overlay-send'}
              >
                <span aria-hidden="true" className={busy ? 'mh-stop-icon' : 'mh-send-icon'}>
                  {busy ? '■' : '↑'}
                </span>
              </button>}
            >
              {busy ? 'Stop response' : 'Send message'}
            </Tooltip>
          </div>
        </div>

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
                  : inactiveStatusLabel(status)}
          </span>
        </div>
      </Dialog>
    </>
  );
}
