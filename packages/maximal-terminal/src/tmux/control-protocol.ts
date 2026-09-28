const MAX_LINE_BYTES = 16 * 1024;
const MAX_FRAME_BYTES = 128 * 1024;
const OPTIONAL_NOTIFICATIONS = new Set(['%clients-changed', '%sessions-changed']);
const OPTIONAL_NOTIFICATION_PREFIXES = [
  '%config-error ',
  '%client-session-changed ',
  '%layout-change ',
  '%pane-mode-changed ',
  '%session-changed ',
  '%subscription-changed ',
  '%unlinked-window-add ',
  '%unlinked-window-close ',
  '%unlinked-window-renamed ',
  '%window-add ',
  '%window-close ',
  '%window-linked ',
  '%window-pane-changed ',
  '%window-renamed ',
  '%window-unlinked ',
];

export type TmuxControlEvent =
  | { type: 'response'; command: number; lines: string[] }
  | { type: 'output'; pane: string; data: string }
  | { type: 'pause'; pane: string }
  | { type: 'continue'; pane: string }
  | { type: 'exit'; code: number }
  | { type: 'failure'; message: string };

interface Frame {
  timestamp: number;
  command: number;
  flags: number;
  lines: string[];
  bytes: number;
}

function decimal(value: string, maxLength = 10): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  for (const character of value) {
    if (character < '0' || character > '9') return false;
  }
  return true;
}

function octal(value: string): boolean {
  if (value.length !== 3) return false;
  for (const character of value) {
    if (character < '0' || character > '7') return false;
  }
  return true;
}

export function validTmuxPane(value: string): boolean {
  if (value[0] !== '%') return false;
  const number = value.slice(1);
  return number === '0' || (number[0] !== '0' && decimal(number));
}

function fail(message: string): TmuxControlEvent {
  return { type: 'failure', message };
}

/** Decodes tmux's octal control-mode output encoding without accepting aliases. */
export function decodeTmuxOutput(value: string): string | undefined {
  const [first, ...escapes] = value.split('\\');
  let result = first!;
  for (const escapedAndText of escapes) {
    const escaped = escapedAndText.slice(0, 3);
    if (!octal(escaped)) return undefined;
    result += String.fromCharCode(Number.parseInt(escaped, 8));
    result += escapedAndText.slice(3);
  }
  return result;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Quotes one argument for tmux's line-parsed control command language. */
export function quoteTmuxArgument(value: string): string | undefined {
  if (value.length > 8 * 1024 || hasControlCharacter(value)) return undefined;
  return `'${value.replaceAll("'", "\\'")}'`;
}

export function sendKeysCommand(pane: string, value: string): string | undefined {
  if (!validTmuxPane(pane) || Buffer.byteLength(value) > 8 * 1024) return undefined;
  const bytes = Buffer.from(value);
  if (bytes.length === 0) return undefined;
  return `send-keys -t ${pane} -H ${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`;
}

export function refreshCommand(cols: number, rows: number): string {
  return `refresh-client -C ${Math.max(1, Math.min(500, Math.trunc(cols)))}x${Math.max(1, Math.min(500, Math.trunc(rows)))}`;
}

export function controlLaunchArgs(session: string): string[] | undefined {
  const isSafe = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(session);
  return isSafe
    ? ['-CC', 'new-session', '-A', '-s', session]
    : undefined;
}

/** A fail-closed line parser. Any malformed framing permanently stops parsing. */
export class TmuxControlParser {
  private frame: Frame | undefined;
  private stopped = false;

  push(line: string): TmuxControlEvent[] {
    if (this.stopped) return [];
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) return this.stop('tmux control line exceeds limit');
    if (line.startsWith('%begin ')) return this.begin(line);
    if (line.startsWith('%end ') || line.startsWith('%error ')) return this.end(line);
    if (this.frame) {
      this.frame.bytes += Buffer.byteLength(line);
      if (this.frame.bytes > MAX_FRAME_BYTES) return this.stop('tmux control response exceeds limit');
      this.frame.lines.push(line);
      return [];
    }
    if (line.startsWith('%output ')) return this.output(line, false);
    if (line.startsWith('%extended-output ')) return this.output(line, true);
    const [notification, pane, extra] = line.split(' ');
    if ((notification === '%pause' || notification === '%continue') && typeof pane === 'string' && validTmuxPane(pane) && extra === undefined) {
      return [{ type: notification === '%pause' ? 'pause' : 'continue', pane }];
    }
    if (notification === '%exit' && (pane === undefined || decimal(pane)) && extra === undefined) {
      return [{ type: 'exit', code: Number(pane ?? 0) }];
    }
    if (this.optionalNotification(line)) return [];
    if (line.startsWith('%')) return this.stop('unknown tmux control framing');
    return [];
  }

  private begin(line: string): TmuxControlEvent[] {
    const fields = line.split(' ');
    if (fields.length !== 4 || fields.slice(1).some((field) => !decimal(field)) || this.frame) {
      return this.stop('malformed or nested tmux control response');
    }
    this.frame = {
      timestamp: Number(fields[1]),
      command: Number(fields[2]),
      flags: Number(fields[3]),
      lines: [],
      bytes: 0,
    };
    return [];
  }

  private end(line: string): TmuxControlEvent[] {
    const fields = line.split(' ');
    const [marker, timestamp, command, flags] = fields;
    const frame = this.frame;
    if (
      fields.length !== 4 ||
      !decimal(timestamp!) ||
      !decimal(command!) ||
      !decimal(flags!) ||
      !frame ||
      Number(timestamp) !== frame.timestamp ||
      Number(command) !== frame.command ||
      Number(flags) !== frame.flags
    ) {
      return this.stop('mismatched tmux control response');
    }
    this.frame = undefined;
    return marker === '%end'
      ? [{ type: 'response', command: frame.command, lines: frame.lines }]
      : [fail('tmux rejected control command')];
  }

  private output(line: string, extended: boolean): TmuxControlEvent[] {
    const prefix = extended ? '%extended-output ' : '%output ';
    const body = line.slice(prefix.length);
    const separator = extended ? ' : ' : ' ';
    const split = body.indexOf(separator);
    const fields = body.slice(0, split).split(' ');
    const pane = fields[0]!;
    const metadataIsValid = !extended || (fields.length === 2 && decimal(fields[1]!));
    const data = decodeTmuxOutput(body.slice(split + separator.length));
    if (!metadataIsValid || !validTmuxPane(pane) || data === undefined) {
      return this.stop('malformed tmux output');
    }
    return [{ type: 'output', pane, data }];
  }

  private optionalNotification(line: string): boolean {
    return OPTIONAL_NOTIFICATIONS.has(line) || OPTIONAL_NOTIFICATION_PREFIXES.some((prefix) => line.startsWith(prefix));
  }

  private stop(message: string): TmuxControlEvent[] {
    this.stopped = true;
    return [fail(message)];
  }
}