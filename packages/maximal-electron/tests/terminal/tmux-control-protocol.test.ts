import { describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn }));

import {
  controlLaunchArgs,
  decodeTmuxOutput,
  quoteTmuxArgument,
  refreshCommand,
  sendKeysCommand,
  TmuxControlParser,
  validTmuxPane,
} from '../../src/main/native/tmux-control-protocol.js';
import { spawnTmuxControl, TmuxControlHost, type TmuxChild } from '../../src/main/native/tmux-control-host.js';

describe('tmux control protocol', () => {
  it('decodes octal output and fails closed on malformed, nested, and mismatched frames', () => {
    expect(decodeTmuxOutput('hello\\040world\\012')).toBe('hello world\n');
    expect(decodeTmuxOutput('\\127')).toBe('W');
    expect(decodeTmuxOutput('bad\\8')).toBeUndefined();
    const parser = new TmuxControlParser();
    expect(parser.push('%begin 7 1 0')).toEqual([]);
    expect(parser.push('%begin 8 2 0')).toEqual([{ type: 'failure', message: 'malformed or nested tmux control response' }]);
    expect(parser.push('%output %1 x')).toEqual([]);
    const mismatch = new TmuxControlParser();
    mismatch.push('%begin 7 1 0');
    expect(mismatch.push('%end 8 1 0')).toEqual([{ type: 'failure', message: 'mismatched tmux control response' }]);
    const commandMismatch = new TmuxControlParser();
    commandMismatch.push('%begin 7 1 0');
    expect(commandMismatch.push('%end 7 2 0')).toEqual([{ type: 'failure', message: 'mismatched tmux control response' }]);
  });

  it('quotes only one safe line argument and sends UTF-8 input as literal bytes', () => {
    expect(quoteTmuxArgument("a'; run-shell evil; '")).toBe("'a\\'; run-shell evil; \\''");
    expect(quoteTmuxArgument('line\nbreak')).toBeUndefined();
    expect(sendKeysCommand('%0', "a';\\;#{run-shell evil}")).toBe('send-keys -t %0 -H 61 27 3b 5c 3b 23 7b 72 75 6e 2d 73 68 65 6c 6c 20 65 76 69 6c 7d');
    expect(sendKeysCommand('%3', 'cafe')).toBe('send-keys -t %3 -H 63 61 66 65');
    expect(sendKeysCommand('%3', 'cafe\u0301')).toBe('send-keys -t %3 -H 63 61 66 65 cc 81');
    expect(sendKeysCommand('bad', 'x')).toBeUndefined();
    expect(controlLaunchArgs('stuffbucket-0123456789abcdef0123456789abcdef')).toEqual(['-CC', 'new-session', '-A', '-s', 'stuffbucket-0123456789abcdef0123456789abcdef']);
    expect(controlLaunchArgs('a'.repeat(128))).toEqual(['-CC', 'new-session', '-A', '-s', 'a'.repeat(128)]);
    expect(controlLaunchArgs('bad; run-shell')).toBeUndefined();
  });

  it('parses regular and extended output without treating metadata as payload', () => {
    const parser = new TmuxControlParser();
    expect(parser.push('%output %0 hello\\040world')).toEqual([{ type: 'output', pane: '%0', data: 'hello world' }]);
    expect(parser.push('%extended-output %0 42 : hello\\040world')).toEqual([{ type: 'output', pane: '%0', data: 'hello world' }]);
    expect(parser.push('%extended-output %0 not-an-age : ignored')).toEqual([{ type: 'failure', message: 'malformed tmux output' }]);
    expect(new TmuxControlParser().push('%output %1')).toEqual([{ type: 'failure', message: 'malformed tmux output' }]);
  });

  it('accepts documented notifications without parsing data the host does not consume', () => {
    const parser = new TmuxControlParser();
    for (const line of [
      '%clients-changed',
      '%window-add @1',
      '%window-close @1',
      '%sessions-changed',
      '%config-error /tmp/tmux.conf: bad option',
      '%client-session-changed /dev/ttys001 $1 work',
      '%session-changed $1 work',
      '%subscription-changed status $1 @1 %1',
      '%unlinked-window-add @1',
      '%unlinked-window-close @1',
      '%unlinked-window-renamed @1 shell',
      '%window-renamed @1 shell',
      '%layout-change @1 abcd abcd 0',
      '%pane-mode-changed %1',
      '%window-linked @1 @2',
      '%window-pane-changed @1 %1',
      '%window-unlinked @1',
    ]) {
      expect(parser.push(line)).toEqual([]);
    }
    expect(parser.push('%window-additional @1')).toEqual([{ type: 'failure', message: 'unknown tmux control framing' }]);
  });

  it('bounds each output event rather than session lifetime', () => {
    const parser = new TmuxControlParser();
    for (let index = 0; index < 20_000; index += 1) {
      expect(parser.push('%output %1 x')).toEqual([{ type: 'output', pane: '%1', data: 'x' }]);
    }
  });

  it('keeps command arguments within their protocol bounds', () => {
    expect(validTmuxPane('%0')).toBe(true);
    expect(validTmuxPane('%000')).toBe(false);
    expect(validTmuxPane('%1234567890')).toBe(true);
    expect(validTmuxPane('%12345678901')).toBe(false);
    expect(quoteTmuxArgument('x'.repeat(8 * 1024))).toBe("'" + 'x'.repeat(8 * 1024) + "'");
    expect(quoteTmuxArgument('x'.repeat(8 * 1024 + 1))).toBeUndefined();
    expect(sendKeysCommand('%1', '')).toBeUndefined();
    expect(sendKeysCommand('%1', 'x'.repeat(8 * 1024))).toBe('send-keys -t %1 -H ' + '78 '.repeat(8 * 1024 - 1) + '78');
    expect(sendKeysCommand('%1', 'x'.repeat(8 * 1024 + 1))).toBeUndefined();
    expect(refreshCommand(-1.9, 600.9)).toBe('refresh-client -C 1x500');
    expect(refreshCommand(4.9, 8.1)).toBe('refresh-client -C 4x8');
  });

  it('rejects every malformed pane, session, escape, and control record shape', () => {
    for (const pane of ['', '%', '1', 'x0', '%00', '%/', '%:', '%a', '%1x', '%12345678901']) {
      expect(validTmuxPane(pane)).toBe(false);
    }
    for (const session of ['', '@shell', '-shell', 'shell/name', 'x'.repeat(129)]) {
      expect(controlLaunchArgs(session)).toBeUndefined();
    }
    expect(controlLaunchArgs('shell@host')).toBeUndefined();
    expect(decodeTmuxOutput('')).toBe('');
    expect(decodeTmuxOutput('plain\\123tail\\000')).toBe('plainStail\0');
    expect(decodeTmuxOutput('\\12')).toBeUndefined();
    expect(decodeTmuxOutput('\\/00')).toBeUndefined();
    expect(decodeTmuxOutput('\\x23')).toBeUndefined();
    expect(decodeTmuxOutput('\\128')).toBeUndefined();
    expect(sendKeysCommand('%1', '\u0001')).toBe('send-keys -t %1 -H 01');
    expect(quoteTmuxArgument('null\0byte')).toBeUndefined();
    expect(quoteTmuxArgument('tab\tbreak')).toBeUndefined();
    expect(quoteTmuxArgument('delete\x7f')).toBeUndefined();

    for (const line of [
      '%pause %1 trailing',
      '%pause',
      '%continue %01',
      '%exit x',
      '%exit 1 trailing',
      '%begin 1 2',
      '%begin x 2 3',
      '%begin 1 2 3 trailing',
      '%output %1',
      '%output %01 x',
      '%output %1 \\12',
      '%extended-output %1 x : data',
      '%extended-output %01 1 : data',
      '%extended-output %1 1 2 : data',
    ]) {
      const parser = new TmuxControlParser();
      expect(parser.push(line)[0]).toMatchObject({ type: 'failure' });
      expect(parser.push('%output %1 x')).toEqual([]);
    }
  });

  it('keeps response contents opaque, accepts only matching end records, and distinguishes tmux errors', () => {
    const response = new TmuxControlParser();
    expect(response.push('%begin 12 34 56')).toEqual([]);
    expect(response.push('%output %1 opaque')).toEqual([]);
    expect(response.push('%end 12 34 56')).toEqual([
      { type: 'response', command: 34, lines: ['%output %1 opaque'] },
    ]);

    const error = new TmuxControlParser();
    error.push('%begin 1 2 3');
    expect(error.push('%error 1 2 3')).toEqual([{ type: 'failure', message: 'tmux rejected control command' }]);

    for (const end of ['%end 1 2', '%end 1 2 3 4', '%end x 2 3', '%end 1 x 3', '%end 1 2 x', '%end 1 2 4']) {
      const parser = new TmuxControlParser();
      parser.push('%begin 1 2 3');
      expect(parser.push(end)).toEqual([{ type: 'failure', message: 'mismatched tmux control response' }]);
    }
    expect(new TmuxControlParser().push('not control data')).toEqual([]);
  });

  it('does not dispatch records that only end with known control prefixes', () => {
    const begin = new TmuxControlParser();
    expect(begin.push('x%begin 1 2 3')).toEqual([]);
    expect(begin.push('%end 1 2 3')).toEqual([{ type: 'failure', message: 'mismatched tmux control response' }]);

    const error = new TmuxControlParser();
    expect(error.push('x%error 1 2 3')).toEqual([]);
    expect(error.push('%output %1 x')).toEqual([{ type: 'output', pane: '%1', data: 'x' }]);
  });

  it('requires exact control framing and stops permanently after a malformed record', () => {
    const parser = new TmuxControlParser();
    expect(parser.push('%pause %1')).toEqual([{ type: 'pause', pane: '%1' }]);
    expect(parser.push('%continue %1')).toEqual([{ type: 'continue', pane: '%1' }]);
    expect(parser.push('%exit')).toEqual([{ type: 'exit', code: 0 }]);
    expect(parser.push('%exit 12')).toEqual([{ type: 'exit', code: 12 }]);
    expect(parser.push('%exit 12 trailing')).toEqual([{ type: 'failure', message: 'unknown tmux control framing' }]);
    expect(parser.push('%output %1 x')).toEqual([]);

    const malformedOutput = new TmuxControlParser();
    expect(malformedOutput.push('%output %01 x')).toEqual([{ type: 'failure', message: 'malformed tmux output' }]);
    expect(malformedOutput.push('%output %1 x')).toEqual([]);
    const malformedFrame = new TmuxControlParser();
    expect(malformedFrame.push('%begin 1 2 3 trailing')).toEqual([{ type: 'failure', message: 'malformed or nested tmux control response' }]);
  });

  it('rejects oversized control lines, frames, and output events', () => {
    expect(new TmuxControlParser().push('x'.repeat(16 * 1024))).toEqual([]);
    const line = new TmuxControlParser();
    expect(line.push('x'.repeat(16 * 1024 + 1))).toEqual([{ type: 'failure', message: 'tmux control line exceeds limit' }]);

    const frame = new TmuxControlParser();
    frame.push('%begin 1 2 3');
    for (let index = 0; index < 8; index += 1) expect(frame.push('x'.repeat(16 * 1024))).toEqual([]);
    expect(frame.push('x')).toEqual([{ type: 'failure', message: 'tmux control response exceeds limit' }]);

    const output = new TmuxControlParser();
    expect(output.push('%output %1 ' + 'x'.repeat(256 * 1024 + 1))).toEqual([{ type: 'failure', message: 'tmux control line exceeds limit' }]);
  });
});

function fakeChild(write: (value: string) => boolean = () => true) {
  let stdout: (data: Buffer) => void = () => undefined;
  let stderr: (data: Buffer) => void = () => undefined;
  let exit: (code: number | null) => void = () => undefined;
  const writes: string[] = [];
  let writeCalls = 0;
  let killed = false;
  let killCalls = 0;
  const child: TmuxChild = {
    stdin: { write: (value) => {
      writes.push(value);
      writeCalls += 1;
      return write(value);
    } },
    stdout: { on: (event, listener) => { if (event === 'data') stdout = listener; } },
    stderr: { on: (event, listener) => { if (event === 'data') stderr = listener; } },
    on: (event, listener) => { if (event === 'exit') exit = listener; },
    kill: () => ((killed = true, killCalls += 1), true),
  };
  return {
    child,
    writes,
    get writeCalls() { return writeCalls; },
    get killed() { return killed; },
    get killCalls() { return killCalls; },
    stdout: (value: string | Buffer) => stdout(Buffer.isBuffer(value) ? value : Buffer.from(value)),
    stderr: (value: string) => stderr(Buffer.from(value)),
    exit: (code: number | null) => exit(code),
  };
}

function response(timestamp: number, command: number, lines: string[] = []) {
  return `%begin ${String(timestamp)} ${String(command)} 0\n${lines.join('\n')}\n%end ${String(timestamp)} ${String(command)} 0\n`;
}

describe('TmuxControlHost', () => {
  it('rejects invalid sessions and starts tmux control mode without a shell', () => {
    const wire = fakeChild();
    spawn.mockReset();
    spawn.mockReturnValue(wire.child);
    expect(() => spawnTmuxControl('bad; session')).toThrow('Invalid tmux session name.');
    expect(spawn).not.toHaveBeenCalled();
    expect(spawnTmuxControl('work')).toBe(wire.child);
    expect(spawn).toHaveBeenCalledWith('tmux', ['-CC', 'new-session', '-A', '-s', 'work'], { shell: false, stdio: 'pipe' });
  });

  it('initializes through normal notifications, captures complete history, and delivers literal input', () => {
    const wire = fakeChild();
    const output: string[] = [];
    const host = new TmuxControlHost({ emit: (data) => output.push(data), onExit: () => undefined, childFactory: () => wire.child });
    expect(wire.writes).toEqual(["display-message -p -F '#{pane_id}'\n"]);
    wire.stdout('%window-add @1\n%sessions-changed\n%session-changed $1 work\n%window-renamed @1 shell\n%layout-change @1 abcd abcd 0\n');
    wire.stdout(response(10, 1, ['%1']));
    wire.stdout(response(11, 2, ['%1']));
    expect(wire.writes.at(-1)).toBe('capture-pane -p -e -t %1 -S - -E -\n');
    wire.stdout(response(12, 3, ['old\r', 'new']));
    expect(output).toEqual(['old\nnew\n']);
    expect(wire.writes).toHaveLength(3);
    host.write("a';\\;#{run-shell evil}");
    expect(wire.writes.at(-1)).toBe('send-keys -t %1 -H 61 27 3b 5c 3b 23 7b 72 75 6e 2d 73 68 65 6c 6c 20 65 76 69 6c 7d\n');
    expect(wire.writes.join('')).not.toMatch(/kill-(?:session|server)/);
  });

  it('fails closed and kills only its client on queue overflow or stderr', () => {
    const wire = fakeChild();
    const output: string[] = [];
    const host = new TmuxControlHost({ emit: (data) => output.push(data), onExit: () => undefined, childFactory: () => wire.child });
    for (let index = 0; index < 32; index += 1) host.resize(80, 24);
    expect(wire.killed).toBe(true);
    expect(wire.killCalls).toBe(1);
    expect(output.at(-1)).toContain('queue exceeds limit');
    expect(wire.writes.join('')).not.toMatch(/kill-(?:session|server)/);

    const stderrWire = fakeChild();
    const stderrOutput: string[] = [];
    new TmuxControlHost({ emit: (data) => stderrOutput.push(data), onExit: () => undefined, childFactory: () => stderrWire.child });
    stderrWire.stderr('tmux error');
    expect(stderrWire.killed).toBe(true);
    expect(stderrWire.killCalls).toBe(1);
    expect(stderrOutput.at(-1)).toContain('wrote stderr');
  });

  it('reports child exit without killing its tmux server', () => {
    const wire = fakeChild();
    const exits: number[] = [];
    new TmuxControlHost({ emit: () => undefined, onExit: (code) => exits.push(code), childFactory: () => wire.child });
    wire.exit(7);
    expect(exits).toEqual([7]);
    expect(wire.killed).toBe(false);
    expect(wire.writes.join('')).not.toMatch(/kill-(?:session|server)/);
  });

  it('handles split control records, pane output, pause acknowledgement, and idempotent close', () => {
    const wire = fakeChild();
    const output: string[] = [];
    const host = new TmuxControlHost({ emit: (data) => output.push(data), onExit: () => undefined, childFactory: () => wire.child });
    host.write('before-ready');
    expect(wire.writes).toEqual(["display-message -p -F '#{pane_id}'\n"]);
    wire.stdout('%begin 1 1 0\n%1\n%end');
    wire.stdout(' 1 1 0\n%begin 2 2 0\n%1\n%end 2 2 0\n%begin 3 3 0\n%end 3 3 0\n');
    wire.stdout('%output %2 ignored\n%output %1 ready\n%pause %1\n');
    expect(output).toEqual(['\n', 'ready']);
    expect(wire.writes.at(-1)).toBe('refresh-client -A %1:continue\n');
    host.close();
    host.close();
    host.resize(80, 24);
    host.write('after-close');
    wire.stdout('%output %1 ignored-after-close\n');
    expect(output).toEqual(['\n', 'ready']);
    expect(wire.killed).toBe(true);
    expect(wire.killCalls).toBe(1);
    expect(wire.writes.at(-1)).toBe('refresh-client -A %1:continue\n');
  });

  it('fails closed for invalid startup, malformed data, and unsolicited responses', () => {
    const invalid = fakeChild();
    const invalidOutput: string[] = [];
    new TmuxControlHost({ emit: (data) => invalidOutput.push(data), onExit: () => undefined, childFactory: () => invalid.child });
    invalid.stdout(response(1, 1, ['not-a-pane']));
    expect(invalid.killed).toBe(true);
    expect(invalidOutput.at(-1)).toContain('selected pane was invalid');

    const unsolicited = fakeChild();
    const unsolicitedOutput: string[] = [];
    new TmuxControlHost({ emit: (data) => unsolicitedOutput.push(data), onExit: () => undefined, childFactory: () => unsolicited.child });
    unsolicited.stdout(response(1, 1, ['%1']));
    unsolicited.stdout(response(2, 2, ['%1']));
    unsolicited.stdout(response(3, 3));
    unsolicited.stdout(response(4, 4));
    expect(unsolicited.killed).toBe(true);
    expect(unsolicitedOutput.at(-1)).toContain('unexpected tmux control response');
  });

  it('uses the supplied session and runs each response handler before advancing its queue', () => {
    const wire = fakeChild();
    const output: string[] = [];
    const host = new TmuxControlHost({ emit: (data) => output.push(data), onExit: () => undefined, session: 'work', childFactory: () => wire.child });
    expect(wire.writes).toEqual(["display-message -p -F '#{pane_id}'\n"]);
    wire.stdout(response(1, 1, ['%1']));
    expect(wire.writes.at(-1)).toBe("list-panes -F '#{pane_id}'\n");
    wire.stdout(response(2, 2, ['%1']));
    expect(wire.writes.at(-1)).toBe('capture-pane -p -e -t %1 -S - -E -\n');
    wire.stdout(response(3, 3, []));
    host.resize(80, 24);
    host.write('x');
    expect(wire.writes.slice(-1)).toEqual(['refresh-client -C 80x24\n']);
    wire.stdout(response(4, 4));
    expect(wire.writes.at(-1)).toBe('send-keys -t %1 -H 78\n');
    wire.stdout(response(5, 5));
    expect(output).toEqual(['\n']);
  });

  it('generates a private default session and reports precise startup failures', () => {
    const wire = fakeChild();
    let session = '';
    const output: string[] = [];
    new TmuxControlHost({ emit: (data) => output.push(data), onExit: () => undefined, childFactory: (value) => {
      session = value;
      return wire.child;
    } });
    expect(session).toMatch(/^stuffbucket-[0-9a-f]{32}$/);
    wire.stdout(response(1, 1, ['%1']));
    wire.stdout(response(2, 2, ['%2']));
    expect(output).toEqual(['\r\n\x1b[31mTmux control error: tmux selected pane was unavailable.\x1b[0m\r\n']);
    expect(wire.killed).toBe(true);
  });

  it('handles empty, chunked, and backpressured writes without sending commands after close', () => {
    const wire = fakeChild(() => false);
    const host = new TmuxControlHost({ emit: () => undefined, onExit: () => undefined, childFactory: () => wire.child });
    host.write('');
    expect(wire.writeCalls).toBe(1);
    wire.stdout(response(1, 1, ['%1']));
    wire.stdout(response(2, 2, ['%1']));
    wire.stdout(response(3, 3));
    host.write('x'.repeat(1025));
    expect(wire.writes.at(-1)).toBe(`send-keys -t %1 -H ${'78 '.repeat(1023)}78\n`);
    expect(wire.writes).toHaveLength(4);
    wire.stdout(response(4, 4));
    expect(wire.writes.at(-1)).toBe('send-keys -t %1 -H 78\n');
    host.close();
    const writesBefore = wire.writes.length;
    host.resize(0, 0);
    host.write('after-close');
    expect(wire.writes).toHaveLength(writesBefore);

    const exact = fakeChild();
    const exactHost = new TmuxControlHost({ emit: () => undefined, onExit: () => undefined, childFactory: () => exact.child });
    exact.stdout(response(1, 1, ['%1']));
    exact.stdout(response(2, 2, ['%1']));
    exact.stdout(response(3, 3));
    exactHost.write('x'.repeat(1024));
    const writeCount = exact.writes.length;
    exact.stdout(response(4, 4));
    expect(exact.writes).toHaveLength(writeCount);
  });

  it('uses byte-accurate CRLF framing and fails at the exact pending-line limit', () => {
    const wire = fakeChild();
    const output: string[] = [];
    new TmuxControlHost({ emit: (data) => output.push(data), onExit: () => undefined, childFactory: () => wire.child });
    wire.stdout('%begin 1 1 0\r');
    wire.stdout('\n%1\r\n%end 1 1 0\r\n');
    wire.stdout('%begin 2 2 0\n%1\n%end 2 2 0\n');
    wire.stdout('%begin 3 3 0\n%end 3 3 0\n');
    const utf8 = Buffer.from('%output %1 cafe\u0301\n');
    wire.stdout(utf8.subarray(0, utf8.length - 1));
    wire.stdout(utf8.subarray(utf8.length - 1));
    expect(output).toEqual(['\n', 'cafe\u0301']);

    const exact = fakeChild();
    const lineCapErrors: string[] = [];
    new TmuxControlHost({ emit: (data) => lineCapErrors.push(data), onExit: () => undefined, childFactory: () => exact.child });
    exact.stdout('x'.repeat(16 * 1024));
    expect(exact.killed).toBe(false);
    exact.stdout('x');
    expect(exact.killed).toBe(true);
    expect(exact.killCalls).toBe(1);
    expect(lineCapErrors).toEqual(['\r\n\x1b[31mTmux control error: tmux control line exceeds limit.\x1b[0m\r\n']);
  });

  it('filters unrelated panes, acknowledges selected pauses, and dispatches failure and exit once', () => {
    const wire = fakeChild();
    const output: string[] = [];
    const exits: number[] = [];
    new TmuxControlHost({ emit: (data) => output.push(data), onExit: (code) => exits.push(code), childFactory: () => wire.child });
    wire.stdout(response(1, 1, ['%1']));
    wire.stdout(response(2, 2, ['%1']));
    wire.stdout(response(3, 3));
    wire.stdout('%output %2 ignored\n%pause %2\n%pause %1\n%output %1 first\rsecond\r\n');
    expect(output).toEqual(['\n', 'first\rsecond']);
    expect(wire.writes.at(-1)).toBe('refresh-client -A %1:continue\n');
    wire.stdout('%exit 9\n');
    wire.exit(4);
    wire.stdout('%output %1 ignored-after-exit\n');
    expect(exits).toEqual([9]);

    const failure = fakeChild();
    const failures: string[] = [];
    new TmuxControlHost({ emit: (data) => failures.push(data), onExit: () => undefined, childFactory: () => failure.child });
    failure.stdout('%error 1 2 3\n');
    failure.stderr('late stderr');
    failure.exit(null);
    expect(failure.killed).toBe(true);
    expect(failure.killCalls).toBe(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('mismatched tmux control response');
  });
});