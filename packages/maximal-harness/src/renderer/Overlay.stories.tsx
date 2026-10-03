import { useEffect, type ReactNode } from 'react';

import type {
  AgentApprovalRequest,
  AgentEnd,
  AgentModelOption,
  AgentToolEvent,
  AssistantOverlayPreferences,
  ModelProgress,
  ProviderStatus,
} from '../contracts.js';
import '../styles.css';
import { Overlay, type HarnessTransport } from './Overlay.js';

interface StoryContext {
  canvasElement: HTMLElement;
}

interface Story {
  render: () => ReactNode;
  play: (context: StoryContext) => Promise<void>;
}

const MODELS: AgentModelOption[] = [
  {
    key: 'embedded:qwen3:4b',
    label: 'Qwen3 4B',
    model: 'qwen3:4b',
    provider: 'embedded',
    description: 'Private, on-device assistant',
    efforts: ['low', 'medium', 'high'],
  },
  {
    key: 'ollama:devstral',
    label: 'Devstral',
    model: 'devstral',
    provider: 'ollama',
    description: 'Local Ollama coding model',
    efforts: ['low', 'medium'],
  },
];

const READY: ProviderStatus = {
  state: 'ready',
  provider: 'embedded',
  model: 'qwen3:4b',
  modelKey: 'embedded:qwen3:4b',
  models: MODELS,
  effort: 'medium',
};

const PREFERENCES: AssistantOverlayPreferences = {
  candy: true,
  approval: 'writes',
  outputFont: 'auto',
  hotkey: 'CommandOrControl+Shift+Space',
};

const CHAT = {
  id: 'storybook-chat',
  title: 'Storybook chat',
  status: 'active' as const,
  attention: 'read' as const,
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
};

interface InitialEvents {
  approval?: AgentApprovalRequest;
  delta?: string;
  modelProgress?: ModelProgress;
  tools?: AgentToolEvent[];
}

function subscription<T>(values: T[]): (listener: (value: T) => void) => () => void {
  return (listener) => {
    queueMicrotask(() => {
      for (const value of values) listener(value);
    });
    return () => undefined;
  };
}

function storyTransport(
  status: ProviderStatus,
  events: InitialEvents = {},
): HarnessTransport {
  return {
    hide: () => Promise.resolve(),
    provider: () => Promise.resolve(status),
    selectModel: (modelKey) => {
      const selected = MODELS.find((model) => model.key === modelKey);
      return selected
        ? Promise.resolve({
            state: 'ready',
            provider: selected.provider,
            model: selected.model,
            modelKey: selected.key,
            models: MODELS,
            ...(selected.efforts[0] ? { effort: selected.efforts[0] } : {}),
          })
        : Promise.reject(new Error(`Unknown model: ${modelKey}`));
    },
    selectEffort: (effort) => Promise.resolve(
      status.state === 'ready' ? { ...status, effort } : status,
    ),
    ask: () => Promise.resolve({ started: true, chatId: 'storybook-chat' }),
    steer: () => Promise.resolve(true),
    abort: () => Promise.resolve(),
    approve: () => Promise.resolve(),
    ensureModel: () => Promise.resolve({ state: 'ready' }),
    preferences: () => Promise.resolve(PREFERENCES),
    updatePreferences: (update) => Promise.resolve({ ...PREFERENCES, ...update }),
    chats: {
      list: () => Promise.resolve({ chats: [CHAT], total: 1 }),
      create: () => Promise.resolve(CHAT),
      open: () => Promise.resolve(CHAT),
      update: (_id, update) => Promise.resolve({ ...CHAT, ...update }),
      remove: () => Promise.resolve(),
      messages: () => Promise.resolve([]),
      terminal: () => Promise.resolve({}),
    },
    onDelta: subscription(events.delta ? [events.delta] : []),
    onTool: subscription(events.tools ?? []),
    onApproval: subscription(events.approval ? [events.approval] : []),
    onEnd: subscription<AgentEnd>([]),
    onModelProgress: subscription(
      events.modelProgress ? [events.modelProgress] : [],
    ),
    onShown: subscription<void>([]),
    onDismissRequested: subscription<void>([]),
    onPreferences: subscription<AssistantOverlayPreferences>([]),
    onChatSelected: subscription<string>([]),
  };
}

function StorySurface({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('mh-overlay-body');
    return () => document.body.classList.remove('mh-overlay-body');
  }, []);
  return children;
}

function render(status: ProviderStatus, events?: InitialEvents): ReactNode {
  return (
    <StorySurface>
      <Overlay transport={storyTransport(status, events)} />
    </StorySurface>
  );
}

async function eventually(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  assertion();
}

function page(context: StoryContext): Document {
  return context.canvasElement.ownerDocument;
}

function requireElement(document: Document, selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing overlay element: ${selector}`);
  return element;
}

const meta = {
  title: 'Assistant/Overlay',
  component: Overlay,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
};

export default meta;

export const Ready: Story = {
  render: () => render(READY),
  play: async (context) => {
    await eventually(() => {
      const document = page(context);
      const input = requireElement(document, '[data-testid="overlay-input"]');
      if (!(input instanceof HTMLTextAreaElement) || input.disabled) {
        throw new Error('Ready assistant input is not enabled');
      }
      if (!requireElement(document, '[data-testid="overlay-status"]').textContent?.includes('Qwen3 4B')) {
        throw new Error('Ready assistant does not identify its selected model');
      }
    });
  },
};

export const ModelSelection: Story = {
  render: () => render({
    state: 'select-model',
    preferredModel: 'embedded:qwen3:4b',
    models: MODELS,
  }),
  play: async (context) => {
    requireElement(
      page(context),
      '[data-testid="overlay-model-picker"]',
    ).click();
    await eventually(() => {
      const document = page(context);
      const menu = requireElement(document, '[data-testid="overlay-model-menu"]');
      if (menu.querySelectorAll('[role="option"]').length !== MODELS.length) {
        throw new Error('Model picker does not show every available model');
      }
    });
  },
};

export const StreamingAndTools: Story = {
  render: () => render(READY, {
    delta: [
      'I found the layout owner and tightened the scroll boundary.\n\n',
      '```tsx\n<ScrollArea as="nav">...</ScrollArea>\n```',
    ].join(''),
    tools: [
      { id: 'read', name: 'read_file', phase: 'start' },
      { id: 'read', name: 'read_file', phase: 'end' },
      { id: 'test', name: 'run_tests', phase: 'start' },
    ],
  }),
  play: async (context) => {
    await eventually(() => {
      const document = page(context);
      if (!requireElement(document, '[data-testid="overlay-answer"]').textContent?.includes('ScrollArea')) {
        throw new Error('Streamed answer is not visible');
      }
      const tools = requireElement(document, '[data-testid="overlay-tools"]');
      if (!tools.textContent?.includes('run_tests') || !tools.textContent.includes('running')) {
        throw new Error('Running tool activity is not visible');
      }
    });
  },
};

export const Approval: Story = {
  render: () => render(READY, {
    delta: 'The change is ready, but writing it requires approval.',
    approval: {
      id: 'approval-1',
      tool: 'write_file',
      summary: 'packages/maximal-client/src/renderer/AppWorkspace.tsx',
    },
  }),
  play: async (context) => {
    await eventually(() => {
      const document = page(context);
      const approval = requireElement(document, '[data-testid="overlay-approval"]');
      if (!approval.textContent?.includes('write_file')) {
        throw new Error('Approval does not identify the requested tool');
      }
      if (!document.querySelector('[data-testid="overlay-deny"]') ||
          !document.querySelector('[data-testid="overlay-allow"]') ||
          !document.querySelector('[data-testid="overlay-allow-always"]')) {
        throw new Error('Approval actions are incomplete');
      }
    });
  },
};

export const ModelDownload: Story = {
  render: () => render(
    { state: 'needs-model', model: 'Qwen3 4B', approxMb: 2_600 },
    {
      modelProgress: {
        state: 'downloading',
        received: 1_048_576_000,
        total: 4_194_304_000,
      },
    },
  ),
  play: async (context) => {
    await eventually(() => {
      const progress = requireElement(
        page(context),
        '[data-testid="overlay-download"]',
      );
      if (!progress.textContent?.includes('1049 MB of 4194 MB')) {
        throw new Error('Model download progress is not visible');
      }
    });
  },
};

export const Unavailable: Story = {
  render: () => render({
    state: 'unavailable',
    reason: 'No local model provider is available.',
  }),
  play: async (context) => {
    await eventually(() => {
      const document = page(context);
      const status = requireElement(document, '[data-testid="overlay-status"]');
      if (status.textContent !== 'No local model provider is available.') {
        throw new Error('Unavailable reason is not visible');
      }
      const input = requireElement(document, '[data-testid="overlay-input"]');
      if (!(input instanceof HTMLTextAreaElement) || !input.disabled) {
        throw new Error('Unavailable assistant input is not disabled');
      }
    });
  },
};
