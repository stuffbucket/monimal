import { execFileSync } from 'node:child_process';
import readline from 'node:readline';

const ESC = '\x1b';
const output = process.stdout;
const kittyGraphic = Buffer.from([
  255, 0, 0, 255, 0, 255, 0, 255,
  0, 0, 255, 255, 255, 255, 255, 255,
]).toString('base64');

function dimensions() {
  return `${String(output.columns ?? 0)}x${String(output.rows ?? 0)}`;
}

/**
 * `stty size` asks the tty driver directly rather than reading Node's cached
 * `process.stdout.columns/rows` (refreshed on the stream's own `resize`
 * event). Comparing the two catches a missed or stale resize notification
 * rather than trusting the one value that might be wrong.
 */
function ttyDriverSize() {
  try {
    const raw = execFileSync('stty', ['size'], { stdio: ['inherit', 'pipe', 'ignore'] })
      .toString('utf8')
      .trim();
    const [rows, cols] = raw.split(/\s+/u);
    return rows && cols ? `${cols}x${rows}` : 'unknown';
  } catch {
    return 'unavailable';
  }
}

/**
 * Asks the terminal emulator how big it thinks its own text area is, via
 * `CSI 18 t` ("report the size of the text area in characters"), which a
 * conforming emulator answers with `CSI 8 ; rows ; cols t`. xterm.js only
 * answers this when the host opts into `windowOptions.getWinSizeChars`.
 *
 * Readline's TTY input is a flowing stream shared with the rest of the
 * process, so pausing it (to intercept the reply) pauses the underlying
 * stream itself and nothing sees data arrive until it is resumed. A plain
 * `process.stdin.on('data', ...)` listener does not have that problem: it
 * receives the same raw chunk readline's own keypress parser does, in full
 * and unmangled, since Node dispatches "data" to every listener in
 * registration order before readline gets a chance to decode it into
 * keypresses. That parser still runs right after ours (in the same
 * synchronous dispatch) and independently — and imperfectly — turns the
 * escape reply into a handful of stray characters in the in-progress edit
 * buffer, so once we've captured the reply from the raw chunk, a
 * `setImmediate` callback (deferred until after that synchronous keypress
 * handling has finished) resets the buffer and redraws the prompt clean.
 */
function queryEmulatorGrid(timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const pattern = new RegExp(`${ESC}\\[8;(\\d+);(\\d+)t`, 'u');
    let buffered = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      process.stdin.off('data', onData);
      clearTimeout(timer);
      setImmediate(() => {
        terminal.line = '';
        terminal.cursor = 0;
        terminal._refreshLine();
        resolve(value);
      });
    };
    const onData = (chunk) => {
      buffered += chunk.toString('utf8');
      const match = pattern.exec(buffered);
      if (match) finish(`${match[2]}x${match[1]}`);
    };
    const timer = setTimeout(() => finish('no response'), timeoutMs);
    process.stdin.on('data', onData);
    output.write(`${ESC}[18t`);
  });
}

function write(line = '') {
  output.write(`${line}\r\n`);
}

function prompt() {
  terminal.prompt();
}

write(`${ESC}]0;Maximal Terminal Lab${ESC}\\${ESC}[1;38;2;94;234;212mMaximal Terminal Lab${ESC}[0m`);
write(`${ESC}[2mPTY ${dimensions()} · TERM=${process.env.TERM ?? 'unset'} · COLORTERM=${process.env.COLORTERM ?? 'unset'}${ESC}[0m`);
write('Type help for fixture commands.');

const terminal = readline.createInterface({
  input: process.stdin,
  output,
  terminal: true,
  prompt: `${ESC}[38;2;94;234;212mlab${ESC}[0m ${ESC}[2m›${ESC}[0m `,
});

terminal.on('line', (input) => {
  const [command = '', ...rest] = input.trim().split(/\s+/u);
  const argument = rest.join(' ');
  switch (command) {
    case '':
      break;
    case 'help':
      write('ansi  unicode  link  graphics  size  status  title <text>  flood <1-2000> [delay-ms]  clear  exit <0-255>');
      break;
    case 'ansi':
      write(`${ESC}[31mred${ESC}[0m ${ESC}[32mgreen${ESC}[0m ${ESC}[34mblue${ESC}[0m ${ESC}[38;2;255;184;108mtruecolor${ESC}[0m ${ESC}[1mbold${ESC}[0m ${ESC}[4munderline${ESC}[0m`);
      break;
    case 'unicode':
      write('CJK: 日本語  wide: Ｗ  combining: e\u0301  emoji: 👩🏽‍💻  box: ┌─┬─┐');
      break;
    case 'link':
      write(`${ESC}]8;id=terminal-lab;https://example.com/${ESC}\\OSC 8 link${ESC}]8;;${ESC}\\`);
      break;
    case 'graphics':
      output.write(`${ESC}_Ga=T,f=32,s=2,v=2,c=4,r=2,q=2;${kittyGraphic}${ESC}\\`);
      write('Kitty RGBA fixture');
      break;
    case 'size':
      write(`size ${dimensions()}`);
      break;
    case 'status': {
      const pty = dimensions();
      const os = ttyDriverSize();
      void queryEmulatorGrid().then((wterm) => {
        write(`os=${os}  pty=${pty}  wterm=${wterm}`);
        if (os !== 'unavailable' && os !== pty) write(`${ESC}[33mos/pty mismatch${ESC}[0m`);
        if (wterm !== 'no response' && wterm !== pty) write(`${ESC}[33mwterm/pty mismatch${ESC}[0m`);
        prompt();
      });
      return;
    }
    case 'title': {
      const title = [...argument]
        .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
        .join('')
        .slice(0, 128) || 'Maximal Terminal Lab';
      output.write(`${ESC}]0;${title}${ESC}\\`);
      write(`title ${title}`);
      break;
    }
    case 'flood': {
      const [countArgument, delayArgument] = rest;
      const requested = Number.parseInt(countArgument ?? '', 10);
      const count = Number.isFinite(requested) ? Math.min(2_000, Math.max(1, requested)) : 100;
      const requestedDelay = Number.parseInt(delayArgument ?? '', 10);
      const delay = Number.isFinite(requestedDelay)
        ? Math.min(60_000, Math.max(0, requestedDelay))
        : 0;
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      void (async () => {
        for (let index = 1; index <= count; index += 1) {
          write(`line ${String(index).padStart(4, '0')} of ${String(count).padStart(4, '0')}`);
          if (delay > 0 && index < count) await wait(delay);
        }
        prompt();
      })();
      return;
    }
    case 'clear':
      output.write(`${ESC}[2J${ESC}[H`);
      break;
    case 'exit': {
      const requested = Number.parseInt(argument, 10);
      process.exitCode = Number.isFinite(requested) ? Math.min(255, Math.max(0, requested)) : 0;
      terminal.close();
      return;
    }
    default:
      write(`${ESC}[31munknown command:${ESC}[0m ${command}`);
  }
  prompt();
});

terminal.on('SIGINT', () => {
  write('^C');
  prompt();
});

output.on('resize', () => {
  write(`${ESC}[2m[resize ${dimensions()}]${ESC}[0m`);
  prompt();
});

prompt();