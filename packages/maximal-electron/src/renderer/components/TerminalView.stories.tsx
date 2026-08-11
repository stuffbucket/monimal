import type { ITheme, Terminal as GhosttyTerminal } from 'ghostty-web';
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import type {
  DetachableTerminalTransport,
  TerminalDescriptor,
  TerminalEvent,
  TerminalSession,
  TerminalTransport,
} from '../lib/terminal-transport.js';
import { TerminalView, type TerminalHost } from './TerminalView.js';

/**
 * A real terminal, over a transport that answers from a string.
 *
 * The transport is the seam. `TerminalView` never reaches for Electron, a pty
 * or an IPC bridge — it takes a `TerminalTransport` as a value — so a story
 * writes five methods and every one of them is a line over a canned buffer.
 *
 * **The emulator is real here.** `ghostty-web` carries its WebAssembly module
 * as a `data:` URL inside its own bundle, so `init()` needs no asset route from
 * Vite, no static file and no network. What these stories draw is the parser,
 * the renderer and the canvas the application draws.
 *
 * **There is no text in the DOM.** The emulator paints a `<canvas>`, so nothing
 * in these stories is reachable by `getByText`, and each `play` reads the
 * parsed buffer off the instance the host element publishes. That is what
 * `TerminalHost.__terminal` is for, and it is the only reason these stories
 * assert anything rather than proving a `<div>` exists.
 */

/** A build that finished, for a terminal that should look lived in. */
const SESSION = [
  '\x1b[1;32mavery\x1b[0m:\x1b[1;34m~/work/shell\x1b[0m $ npm run build:package',
  '',
  '> @stuffbucket/maximal-electron build:package',
  '> npm run build:host && npm run build:renderer',
  '',
  '  \x1b[32mok\x1b[0m  tsc -p tsconfig.host.json              \x1b[2m1.8s\x1b[0m',
  '  \x1b[32mok\x1b[0m  tsc -p tsconfig.renderer-package.json  \x1b[2m2.1s\x1b[0m',
  '  \x1b[32mok\x1b[0m  copy-renderer-css                      \x1b[2m0.1s\x1b[0m',
  '',
  '\x1b[1;32mavery\x1b[0m:\x1b[1;34m~/work/shell\x1b[0m $ ',
].join('\r\n');

/** A run that failed, so the exit notice lands under something that explains it. */
const FAILED = [
  '\x1b[1;32mavery\x1b[0m:\x1b[1;34m~/work/shell\x1b[0m $ npm test',
  '',
  '  \x1b[31mFAIL\x1b[0m  tests/terminal-channels.test.ts',
  '        \x1b[2mpty:list is not declared on the contract\x1b[0m',
  '',
].join('\r\n');

/**
 * A transport backed by a string.
 *
 * `TerminalView` subscribes before it spawns, so the buffer is pushed from
 * `spawn` and reaches a listener that is already there. `write` echoes, which
 * is the smallest thing that makes a keystroke visible without pretending to
 * be a shell.
 */
export function cannedTransport(
  output: string,
  exitCode?: number,
): DetachableTerminalTransport {
  const listeners = new Map<string, (event: TerminalEvent) => void>();
  const live = new Map<string, TerminalSession>();

  return {
    spawn({ id, cwd = '~/work/shell', shell = '/bin/zsh' }) {
      live.set(id, { id, cwd, shell, startedAt: Date.now() });
      const listener = listeners.get(id);
      listener?.({ type: 'data', data: output });
      if (exitCode !== undefined) listener?.({ type: 'exit', exitCode });
      return Promise.resolve();
    },
    write(id, data) {
      listeners.get(id)?.({ type: 'data', data });
      return Promise.resolve();
    },
    resize() {
      return Promise.resolve();
    },
    terminate(id) {
      live.delete(id);
      return Promise.resolve();
    },
    list() {
      return Promise.resolve([...live.values()]);
    },
    subscribe(id, listener) {
      listeners.set(id, listener);
      return () => listeners.delete(id);
    },
  };
}

/**
 * Literal colours, because a canvas inherits nothing.
 *
 * Every other story in this repository gets both schemes from the toolbar,
 * which sets `data-theme` and lets a custom property do the rest. This one
 * cannot: the emulator is handed strings at construction, and `options.theme`
 * afterwards is a no-op that logs a warning. `Light` is a separate story for
 * that reason, and it is not a duplicate of `Default`.
 */
export const DARK: ITheme = {
  background: '#101216',
  foreground: '#e6e8ec',
  cursor: '#6ea8fe',
};

const LIGHT: ITheme = {
  background: '#eef0f4',
  foreground: '#12141a',
  cursor: '#2563eb',
};

/** The panel a terminal fills, at a size that shows the wrap column. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="terminal-host" style={{ display: 'flex', height: 320, width: 720 }}>
      {children}
    </div>
  );
}

/** The host element a `testId` names, or an error naming what was looked for. */
export function hostFor(canvasElement: HTMLElement, testId: string): TerminalHost {
  const host = canvasElement.querySelector<TerminalHost>(`[data-testid='${testId}']`);
  if (!host) throw new Error(`nothing to read: no terminal with testId '${testId}'`);
  return host;
}

/**
 * The emulator behind a host element, once it exists.
 *
 * `init()` is asynchronous, so the host is an empty `<div>` for the first
 * frames of every story. Waiting for it is what stops an assertion running
 * against a terminal that was never constructed and reading the absence as a
 * pass — the defect `.claude/skills/write-a-check/SKILL.md` catalogues, in its
 * browser form.
 */
export async function terminalOf(host: TerminalHost): Promise<GhosttyTerminal> {
  const deadline = Date.now() + 10_000;
  while (!host.__terminal) {
    if (Date.now() > deadline) {
      throw new Error('the WebAssembly module did not load within 10 seconds');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return host.__terminal;
}

/** Every row the parser has produced, as text. */
export function bufferText(term: GhosttyTerminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let row = 0; row < buffer.length; row += 1) {
    lines.push(buffer.getLine(row)?.translateToString(true) ?? '');
  }
  return lines.join('\n');
}

/**
 * The buffer, once it holds `needle`.
 *
 * Writing is asynchronous too: the transport pushes, the emulator parses, and
 * the two are not the same tick. A single read would be a race that usually
 * passes.
 */
export async function bufferContaining(
  host: TerminalHost,
  needle: string,
): Promise<string> {
  const term = await terminalOf(host);
  const deadline = Date.now() + 10_000;
  let text = bufferText(term);
  while (!text.includes(needle)) {
    if (Date.now() > deadline) {
      throw new Error(`'${needle}' never reached the buffer. It holds:\n${text}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    text = bufferText(term);
  }
  return text;
}

/**
 * The `terminate` branch of `TerminalViewProps`, written out.
 *
 * The prop type is a union — `detach` demands a transport that can list its
 * sessions — and Storybook's arg inference reduces a union of object types to
 * `never`, so every `args` in the file would be a type error. Naming the branch
 * these stories use is the narrowing. `detach` has no story: what it changes
 * happens at unmount, in the host, and a story cannot see it.
 */
type TerminalViewArgs = TerminalDescriptor & {
  transport: TerminalTransport;
  theme?: ITheme;
  testId?: string;
};

const meta = {
  title: 'Terminal/TerminalView',
  component: TerminalView,
  args: {
    id: 'story-build',
    ariaLabel: 'Build log',
    theme: DARK,
    transport: cannedTransport(SESSION),
  },
  argTypes: {
    transport: { table: { disable: true } },
    theme: { table: { disable: true } },
  },
  decorators: [(Story) => <Panel>{Story()}</Panel>],
  // Fixtures the `TerminalTabs` stories share. Every other named export in a
  // CSF file is a story, and Storybook would try to render these as four.
  excludeStories: [
    'cannedTransport',
    'hostFor',
    'terminalOf',
    'bufferText',
    'bufferContaining',
    'DARK',
  ],
} satisfies Meta<TerminalViewArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A session with output in it.
 *
 * The `play` function is the claim. A story that only rendered would pass while
 * showing an empty host element, which is exactly what a terminal looks like
 * when its WebAssembly module fails to load.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const text = await bufferContaining(hostFor(canvasElement, 'terminal'), 'build:package');
    await expect(text).toContain('copy-renderer-css');
  },
};

/** The same session in the light scheme, which only a literal theme reaches. */
export const Light: Story = {
  args: { id: 'story-light', theme: LIGHT, testId: 'terminal-light' },
  play: async ({ canvasElement }) => {
    await bufferContaining(hostFor(canvasElement, 'terminal-light'), 'build:package');
  },
};

/**
 * The end of a session, which the view writes itself.
 *
 * An `exit` event is not output: the shell is gone, so nothing will print
 * again. `TerminalView` puts the notice in the buffer so the last line says why
 * the terminal stopped, rather than leaving a prompt that still takes
 * keystrokes and answers none of them.
 */
export const Exited: Story = {
  args: {
    id: 'story-exit',
    ariaLabel: 'Test run',
    testId: 'terminal-exit',
    transport: cannedTransport(FAILED, 1),
  },
  play: async ({ canvasElement }) => {
    const text = await bufferContaining(
      hostFor(canvasElement, 'terminal-exit'),
      '[process exited with 1]',
    );
    await expect(text).toContain('terminal-channels.test.ts');
  },
};

/**
 * A shell that has opened and printed nothing.
 *
 * Its own story because it is the state that looks identical to a broken one: a
 * cursor on an empty canvas. The assertion is therefore that the emulator was
 * constructed and the buffer is empty, which are two different facts, and only
 * the first of them distinguishes this from a failed load.
 */
export const Empty: Story = {
  args: {
    id: 'story-empty',
    ariaLabel: 'New terminal',
    testId: 'terminal-empty',
    transport: cannedTransport(''),
  },
  play: async ({ canvasElement }) => {
    const term = await terminalOf(hostFor(canvasElement, 'terminal-empty'));
    await expect(term.cols).toBeGreaterThan(0);
    await expect(bufferText(term).trim()).toBe('');
  },
};
