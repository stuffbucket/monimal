import { randomBytes } from 'node:crypto';

/** A prefix tmux accepts in a session name and a pattern can embed literally. */
export const TMUX_SESSION_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * The names of tmux sessions this application creates.
 *
 * A generated name is `<prefix>-<32 hex digits>`. The prefix is the host's
 * choice, so its sessions read as its own in `tmux ls`, and only names of that
 * shape are offered for resumption or accepted back from a renderer.
 */
export class TmuxSessionNames {
  private readonly pattern: RegExp;

  constructor(
    readonly prefix: string,
    private readonly entropy: () => string = () => randomBytes(16).toString('hex'),
  ) {
    if (!TMUX_SESSION_PREFIX_PATTERN.test(prefix)) throw new Error('Invalid tmux session prefix.');
    this.pattern = new RegExp(`^${prefix}-[a-f0-9]{32}$`);
  }

  create(): string {
    const name = `${this.prefix}-${this.entropy()}`;
    if (!this.owns(name)) throw new Error('Invalid generated tmux session name.');
    return name;
  }

  owns(value: unknown): value is string {
    return typeof value === 'string' && this.pattern.test(value);
  }
}
