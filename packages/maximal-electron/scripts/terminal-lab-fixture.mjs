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
      write('ansi  unicode  link  graphics  size  title <text>  flood <1-2000>  clear  exit <0-255>');
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
      const requested = Number.parseInt(argument, 10);
      const count = Number.isFinite(requested) ? Math.min(2_000, Math.max(1, requested)) : 100;
      for (let index = 1; index <= count; index += 1) {
        write(`line ${String(index).padStart(4, '0')} of ${String(count).padStart(4, '0')}`);
      }
      break;
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