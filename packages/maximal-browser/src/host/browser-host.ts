import { randomUUID } from 'node:crypto';

import {
  BrowserWindow,
  WebContentsView,
  type Rectangle,
} from 'electron';

import type {
  BrowserBounds,
  BrowserCommand,
  BrowserControl,
  BrowserEvent,
  BrowserOwner,
  BrowserScreenshot,
  BrowserSession,
  BrowserSnapshot,
} from '../contract.js';
import {
  elementActionScript,
  dragScript,
  parseSnapshot,
  scrollScript,
  snapshotScript,
  textPresentScript,
  typeScript,
} from './page-scripts.js';

interface BrowserEntry {
  session: BrowserSession;
  view: WebContentsView;
  exclusiveCssKey?: string;
  agentInput: boolean;
}

export interface BrowserHostOptions {
  window: () => BrowserWindow | null;
  onEvent: (event: BrowserEvent) => void;
}

function normalizeUrl(input: string): string {
  const candidate = input.trim();
  if (candidate === '') throw new Error('A browser URL is required.');
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Browser tabs support only HTTP and HTTPS URLs.');
  }
  return url.toString();
}

function rectangle(bounds: BrowserBounds): Rectangle {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

export class BrowserHost {
  readonly #entries = new Map<string, BrowserEntry>();
  readonly #options: BrowserHostOptions;
  #activeId: string | null = null;
  #bounds: Rectangle | undefined;
  #terminalContext: string[] = [];

  constructor(options: BrowserHostOptions) {
    this.#options = options;
  }

  list(): BrowserSession[] {
    return [...this.#entries.values()].map(({ session }) => ({ ...session }));
  }

  async open(input: string, owner: BrowserOwner): Promise<BrowserSession> {
    const url = normalizeUrl(input);
    const id = randomUUID();
    const session: BrowserSession = {
      id,
      url,
      title: new URL(url).hostname,
      owner,
      control: owner === 'agent' ? 'agent-exclusive' : 'user',
      terminalSessionIds: [...this.#terminalContext],
    };
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const entry: BrowserEntry = { session, view, agentInput: false };
    this.#entries.set(id, entry);
    view.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
      void this.open(nextUrl, owner);
      return { action: 'deny' };
    });
    const update = (): void => {
      const current = this.#entries.get(id);
      if (!current) return;
      current.session = {
        ...current.session,
        url: current.view.webContents.getURL() || current.session.url,
        title: current.view.webContents.getTitle() || current.session.title,
      };
      this.#options.onEvent({ type: 'updated', session: { ...current.session } });
    };
    view.webContents.on('did-navigate', update);
    view.webContents.on('did-navigate-in-page', update);
    view.webContents.on('page-title-updated', update);
    view.webContents.on('did-finish-load', () => {
      void this.#applyControl(entry);
    });
    view.webContents.on('before-input-event', (event) => {
      if (entry.session.control === 'agent-exclusive' && !entry.agentInput) {
        event.preventDefault();
      }
    });
    view.webContents.on('will-navigate', (event, nextUrl) => {
      try {
        normalizeUrl(nextUrl);
      } catch {
        event.preventDefault();
      }
    });
    this.#options.onEvent({ type: 'opened', session: { ...session } });
    try {
      await view.webContents.loadURL(url);
      await this.#applyControl(entry);
    } catch (error) {
      this.close(id);
      throw error;
    }
    return { ...entry.session };
  }

  async navigate(id: string, input: string): Promise<BrowserSession> {
    const entry = this.#entry(id);
    await entry.view.webContents.loadURL(normalizeUrl(input));
    return { ...entry.session };
  }

  command(id: string, command: BrowserCommand): void {
    const contents = this.#entry(id).view.webContents;
    if (command === 'reload') {
      contents.reload();
      return;
    }
    const history = contents.navigationHistory;
    if (command === 'back' && history.canGoBack()) history.goBack();
    if (command === 'forward' && history.canGoForward()) history.goForward();
  }

  show(id: string | null, bounds?: BrowserBounds): void {
    if (bounds) this.#bounds = rectangle(bounds);
    this.#activeId = id;
    const window = this.#options.window();
    if (!window || window.isDestroyed()) return;
    for (const [entryId, { view }] of this.#entries) {
      const attached = window.contentView.children.includes(view);
      if (entryId !== id) {
        if (attached) window.contentView.removeChildView(view);
        continue;
      }
      if (!attached) window.contentView.addChildView(view);
      if (this.#bounds) view.setBounds(this.#bounds);
    }
  }

  close(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    const window = this.#options.window();
    if (window && !window.isDestroyed() && window.contentView.children.includes(entry.view)) {
      window.contentView.removeChildView(entry.view);
    }
    entry.view.webContents.close();
    this.#entries.delete(id);
    if (this.#activeId === id) this.#activeId = null;
    this.#options.onEvent({ type: 'closed', id });
  }

  async read(id: string): Promise<string> {
    const entry = this.#entry(id);
    const text: unknown = await entry.view.webContents.executeJavaScript(
      'document.body?.innerText ?? ""',
      true,
    );
    if (typeof text !== 'string') throw new Error('The browser page did not return text.');
    return text.slice(0, 30_000);
  }

  async inspect(id: string): Promise<BrowserSnapshot> {
    const value: unknown = await this.#entry(id).view.webContents.executeJavaScript(
      snapshotScript,
      true,
    );
    return parseSnapshot(value);
  }

  async click(id: string, ref: string): Promise<void> {
    await this.#entry(id).view.webContents.executeJavaScript(
      elementActionScript(ref, 'click'),
      true,
    );
  }

  async hover(id: string, ref: string): Promise<void> {
    await this.#entry(id).view.webContents.executeJavaScript(
      elementActionScript(ref, 'hover'),
      true,
    );
  }

  async type(id: string, ref: string, text: string, clear = true): Promise<void> {
    await this.#entry(id).view.webContents.executeJavaScript(
      typeScript(ref, text, clear),
      true,
    );
  }

  async drag(id: string, fromRef: string, toRef: string): Promise<void> {
    await this.#entry(id).view.webContents.executeJavaScript(
      dragScript(fromRef, toRef),
      true,
    );
  }

  press(id: string, key: string): void {
    if (!/^(Enter|Escape|Tab|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|[ -~])$/.test(key)) {
      throw new Error(`Unsupported browser key: ${key}`);
    }
    const contents = this.#entry(id).view.webContents;
    const entry = this.#entry(id);
    entry.agentInput = true;
    contents.sendInputEvent({ type: 'keyDown', keyCode: key });
    if (key.length === 1) contents.sendInputEvent({ type: 'char', keyCode: key });
    contents.sendInputEvent({ type: 'keyUp', keyCode: key });
    entry.agentInput = false;
  }

  async scroll(
    id: string,
    direction: 'up' | 'down' | 'left' | 'right',
    amount = 600,
  ): Promise<void> {
    await this.#entry(id).view.webContents.executeJavaScript(
      scrollScript(direction, amount),
      true,
    );
  }

  async wait(id: string, options: {
    text?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}): Promise<void> {
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 5_000, 0), 30_000);
    const deadline = Date.now() + timeoutMs;
    if (options.text === undefined) {
      await this.#delay(timeoutMs, options.signal);
      return;
    }
    do {
      if (options.signal?.aborted) throw new Error('Browser wait was cancelled.');
      const present: unknown = await this.#entry(id).view.webContents.executeJavaScript(
        textPresentScript(options.text),
        true,
      );
      if (present === true) return;
      await this.#delay(Math.min(100, Math.max(0, deadline - Date.now())), options.signal);
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for browser text: ${options.text}`);
  }

  async screenshot(id: string): Promise<BrowserScreenshot> {
    const image = await this.#entry(id).view.webContents.capturePage();
    return { data: image.toPNG().toString('base64'), mimeType: 'image/png' };
  }

  async setControl(id: string, control: BrowserControl): Promise<BrowserSession> {
    const entry = this.#entry(id);
    entry.session = { ...entry.session, control };
    await this.#applyControl(entry);
    this.#options.onEvent({ type: 'updated', session: { ...entry.session } });
    return { ...entry.session };
  }

  setTerminalContext(sessionIds: string[]): void {
    this.#terminalContext = [...new Set(sessionIds)];
  }

  dispose(): void {
    for (const id of [...this.#entries.keys()]) this.close(id);
  }

  #entry(id: string): BrowserEntry {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`Browser session ${id} does not exist.`);
    return entry;
  }

  #delay(durationMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Browser wait was cancelled.'));
        return;
      }
      const finish = (): void => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const timer = setTimeout(finish, durationMs);
      const abort = (): void => {
        clearTimeout(timer);
        reject(new Error('Browser wait was cancelled.'));
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  async #applyControl(entry: BrowserEntry): Promise<void> {
    if (entry.exclusiveCssKey !== undefined) {
      await entry.view.webContents.removeInsertedCSS(entry.exclusiveCssKey);
      entry.exclusiveCssKey = undefined;
    }
    if (entry.session.control === 'agent-exclusive') {
      entry.exclusiveCssKey = await entry.view.webContents.insertCSS(
        'html, html * { pointer-events: none !important; }',
      );
    }
  }
}
