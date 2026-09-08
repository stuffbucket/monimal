import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

import {
  controlLaunchArgs,
  refreshCommand,
  sendKeysCommand,
  TmuxControlParser,
  validTmuxPane,
} from './tmux-control-protocol.js';

const MAX_COMMANDS = 32;

export interface TmuxChild {
  stdin: { write(value: string): boolean };
  stdout: { on(event: 'data', listener: (data: Buffer) => void): void };
  stderr: { on(event: 'data', listener: (data: Buffer) => void): void };
  on(event: 'exit', listener: (code: number | null) => void): void;
  kill(): boolean;
}

export type TmuxChildFactory = (session: string) => TmuxChild;

export function spawnTmuxControl(session: string): TmuxChild {
  const args = controlLaunchArgs(session);
  if (!args) throw new Error('Invalid tmux session name.');
  return spawn('tmux', args, { shell: false, stdio: 'pipe' });
}

interface Command {
  line: string;
  handle: (lines: string[]) => void;
}

/** Main-process control-mode adapter. It never owns or kills a tmux server. */
export class TmuxControlHost {
  private readonly parser = new TmuxControlParser();
  private readonly decoder = new StringDecoder();
  private readonly queue: Command[] = [];
  private readonly child: TmuxChild;
  private selectedPane: string | undefined;
  private line = '';
  private closed = false;
  private receiveData = (data: Buffer): void => this.receive(this.decoder.write(data));

  constructor(
    private readonly options: {
      emit: (data: string) => void;
      onExit: (exitCode: number) => void;
      session?: string;
      childFactory?: TmuxChildFactory;
    },
  ) {
    const session = options.session ?? `stuffbucket-${randomBytes(16).toString('hex')}`;
    this.child = (options.childFactory ?? spawnTmuxControl)(session);
    this.child.stdout.on('data', (data) => this.receiveData(data));
    this.child.stderr.on('data', this.fail.bind(this, 'tmux control client wrote stderr'));
    this.child.on('exit', (code) => this.exit(code ?? 1));
    this.command("display-message -p -F '#{pane_id}'", (lines) => {
      const pane = lines[0];
      if (!pane || !validTmuxPane(pane)) return this.fail('tmux selected pane was invalid');
      this.selectedPane = pane;
      this.command("list-panes -F '#{pane_id}'", (panes) => {
        if (!panes.includes(pane)) return this.fail('tmux selected pane was unavailable');
        this.command(`capture-pane -p -e -t ${pane} -S - -E -`, (snapshot) =>
          this.options.emit(`${snapshot.join(String.fromCharCode(10)).replace(/\r/g, String())}${String.fromCharCode(10)}`),
        );
      });
    });
  }

  write(value: string): void {
    if (this.selectedPane === undefined) return;
    for (const chunk of value.match(/[\s\S]{1,1024}/g)!) {
      const line = sendKeysCommand(this.selectedPane, chunk)!;
      this.command(line, () => undefined);
    }
  }

  resize(cols: number, rows: number): void {
    this.command(refreshCommand(cols, rows), () => undefined);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.receiveData = () => undefined;
    this.selectedPane = undefined;
    this.queue.length = 0;
    this.child.kill();
  }

  private command(line: string, handle: (lines: string[]) => void): void {
    if (this.queue.length === MAX_COMMANDS) return this.fail('tmux command queue exceeds limit');
    this.queue.push({ line, handle });
    if (this.queue.length === 1) this.send();
  }

  private send(): void {
    const command = this.queue[0];
    if (command && !this.closed) this.child.stdin.write(`${command.line}\n`);
  }

  private receive(data: string): void {
    this.line += data;
    const lines = this.line.split(String.fromCharCode(10));
    this.line = lines.pop()!;
    if (Buffer.byteLength(this.line) > 16 * 1024) return this.fail('tmux control line exceeds limit');
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      for (const event of this.parser.push(line)) {
        if (event.type === 'failure') return this.fail(event.message);
        if (event.type === 'exit') return this.exit(event.code);
        if (event.type === 'output' && event.pane === this.selectedPane) this.options.emit(event.data);
        if (event.type === 'pause' && event.pane === this.selectedPane) this.command(`refresh-client -A ${event.pane}:continue`, () => undefined);
        if (event.type === 'response') {
          const command = this.queue.shift();
          if (!command) return this.fail('unexpected tmux control response');
          const next = this.queue[0];
          command.handle(event.lines);
          if (this.queue[0] === next) this.send();
        }
      }
    }
  }

  private fail(message: string): void {
    if (!this.closed) this.options.emit(`\r\n\x1b[31mTmux control error: ${message}.\x1b[0m\r\n`);
    this.close();
  }

  private exit(code: number): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    this.options.onExit(code);
  }
}