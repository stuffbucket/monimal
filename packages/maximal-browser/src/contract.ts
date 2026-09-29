export type BrowserOwner = 'agent' | 'user';
export type BrowserControl = 'user' | 'agent-shared' | 'agent-exclusive';

export interface BrowserSession {
  id: string;
  url: string;
  title: string;
  owner: BrowserOwner;
  control: BrowserControl;
  terminalSessionIds: string[];
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserElement {
  ref: string;
  role: string;
  name: string;
  value?: string;
  checked?: boolean;
  disabled: boolean;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  elements: BrowserElement[];
}

export interface BrowserScreenshot {
  data: string;
  mimeType: 'image/png';
}

export type BrowserCommand = 'back' | 'forward' | 'reload';

export type BrowserEvent =
  | { type: 'opened'; session: BrowserSession }
  | { type: 'updated'; session: BrowserSession }
  | { type: 'closed'; id: string };

export interface BrowserHostBridge {
  list: () => Promise<BrowserSession[]>;
  open: (url: string) => Promise<BrowserSession>;
  navigate: (id: string, url: string) => Promise<BrowserSession>;
  command: (id: string, command: BrowserCommand) => Promise<void>;
  inspect: (id: string) => Promise<BrowserSnapshot>;
  click: (id: string, ref: string) => Promise<void>;
  hover: (id: string, ref: string) => Promise<void>;
  type: (id: string, ref: string, text: string, clear?: boolean) => Promise<void>;
  press: (id: string, key: string) => Promise<void>;
  drag: (id: string, fromRef: string, toRef: string) => Promise<void>;
  scroll: (
    id: string,
    direction: 'up' | 'down' | 'left' | 'right',
    amount?: number,
  ) => Promise<void>;
  wait: (id: string, text?: string, timeoutMs?: number) => Promise<void>;
  screenshot: (id: string) => Promise<BrowserScreenshot>;
  setControl: (id: string, control: BrowserControl) => Promise<BrowserSession>;
  setTerminalContext: (sessionIds: string[]) => Promise<void>;
  close: (id: string) => Promise<void>;
  show: (id: string | null, bounds?: BrowserBounds) => Promise<void>;
  onEvent: (listener: (event: BrowserEvent) => void) => () => void;
}
