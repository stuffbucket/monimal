import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type TmuxGeometryTarget =
  | { transport: 'local'; sessionName: string }
  | { transport: 'ssh'; alias: string; sessionName: string };

export type TmuxProjectionCommand = (
  command: string,
  args: readonly string[],
) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const SAFE_TMUX_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_SSH_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$/;
const TMUX_WINDOW_SIZES = new Set(['largest', 'smallest', 'manual', 'latest']);
const TMUX_GEOMETRY = /^([1-9]\d*)x([1-9]\d*)$/;

async function defaultCommand(command: string, args: readonly string[]): Promise<{ stdout: string }> {
  const result = await execFileAsync(command, [...args], {
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 64 * 1024,
    shell: false,
  });
  return { stdout: result.stdout };
}

function geometryCommand(
  target: TmuxGeometryTarget,
  tmuxArgs: readonly string[],
): { command: string; args: string[] } {
  if (!SAFE_TMUX_NAME.test(target.sessionName)) throw new Error('Invalid trusted tmux session name.');
  if (target.transport === 'local') return { command: 'tmux', args: [...tmuxArgs] };
  if (!SAFE_SSH_ALIAS.test(target.alias)) throw new Error('Invalid trusted SSH alias.');
  const remoteCommand = ['tmux', ...tmuxArgs]
    .map((arg) => arg === ';' ? '\\;' : arg)
    .map((arg) => arg === '#{window_width}x#{window_height}' ? `'${arg}'` : arg)
    .join(' ');
  return { command: 'ssh', args: [target.alias, remoteCommand] };
}

function parseGeometry(stdout: string): { cols: number; rows: number } {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const match = TMUX_GEOMETRY.exec(line.trim());
    if (match) return { cols: Number(match[1]), rows: Number(match[2]) };
  }
  throw new Error('Tmux did not report its actual window geometry.');
}

/**
 * Forces a tmux window to a server-confirmed size and puts its original
 * `window-size` policy back afterwards.
 *
 * Commands for one session run strictly in order, so a restore never overtakes
 * the resize it undoes.
 */
export class TmuxWindowGeometry {
  private readonly originalWindowSizes = new Map<string, {
    value: string;
    inherited: boolean;
  }>();
  private readonly commandQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly onSettled: (sessionId: string, succeeded: boolean) => void,
    private readonly command: TmuxProjectionCommand = defaultCommand,
  ) {}

  get queueCount(): number {
    return this.commandQueues.size;
  }

  apply(
    sessionId: string,
    target: TmuxGeometryTarget,
    cols: number,
    rows: number,
  ): Promise<{ cols: number; rows: number }> {
    return this.enqueue(sessionId, async () => {
      if (!this.originalWindowSizes.has(sessionId)) {
        const showLocal = geometryCommand(target, [
          'show-options', '-wv', '-t', target.sessionName, 'window-size',
        ]);
        const local = (await this.command(showLocal.command, showLocal.args)).stdout.trim();
        const inherited = local === '';
        const showGlobal = inherited
          ? geometryCommand(target, ['show-options', '-wgv', 'window-size'])
          : undefined;
        const value = showGlobal
          ? (await this.command(showGlobal.command, showGlobal.args)).stdout.trim()
          : local;
        if (!TMUX_WINDOW_SIZES.has(value)) {
          throw new Error('Tmux reported an invalid window-size policy.');
        }
        this.originalWindowSizes.set(sessionId, { value, inherited });
      }
      const resize = geometryCommand(target, [
        'set-option', '-w', '-t', target.sessionName, 'window-size', 'manual',
        ';',
        'resize-window', '-t', target.sessionName, '-x', String(cols), '-y', String(rows),
        ';',
        'display-message', '-p', '-t', target.sessionName,
        '#{window_width}x#{window_height}',
      ]);
      return parseGeometry((await this.command(resize.command, resize.args)).stdout);
    });
  }

  async restore(sessionId: string, target: TmuxGeometryTarget): Promise<void> {
    await this.enqueue(sessionId, async () => {
      const original = this.originalWindowSizes.get(sessionId);
      if (!original) return;
      this.originalWindowSizes.delete(sessionId);
      const restore = geometryCommand(target, original.inherited
        ? ['set-option', '-wu', '-t', target.sessionName, 'window-size']
        : ['set-option', '-w', '-t', target.sessionName, 'window-size', original.value]);
      await this.command(restore.command, restore.args);
    });
  }

  /** Drop the recorded policy without restoring it, for a session tmux is about to destroy. */
  forget(sessionId: string): void {
    this.originalWindowSizes.delete(sessionId);
  }

  private enqueue<Result>(sessionId: string, operation: () => Promise<Result>): Promise<Result> {
    const result = (this.commandQueues.get(sessionId) ?? Promise.resolve())
      .then(operation, operation);
    const tail = result.then(
      () => { this.onSettled(sessionId, true); },
      () => { this.onSettled(sessionId, false); },
    );
    this.commandQueues.set(sessionId, tail);
    void tail.then(() => {
      if (this.commandQueues.get(sessionId) === tail) this.commandQueues.delete(sessionId);
    });
    return result;
  }
}
