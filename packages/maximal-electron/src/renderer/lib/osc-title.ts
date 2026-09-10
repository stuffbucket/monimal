type ParserState =
  | 'ground'
  | 'escape'
  | 'osc'
  | 'osc-escape'
  | 'osc-discard'
  | 'osc-discard-escape'
  | 'string'
  | 'string-escape';

const ESC = '\x1b';
const BEL = '\x07';
const C1_DCS = '\x90';
const C1_SOS = '\x98';
const C1_ST = '\x9c';
const C1_OSC = '\x9d';
const C1_PM = '\x9e';
const C1_APC = '\x9f';
const MAX_PAYLOAD = 4_096;

export class OscTitleObserver {
  private state: ParserState = 'ground';
  private payload = '';

  constructor(private readonly emit: (title: string) => void) {}

  write(chunk: string): void {
    for (const character of chunk) this.accept(character);
  }

  private accept(character: string): void {
    if (this.state === 'ground') {
      if (character === ESC) this.state = 'escape';
      else if (character === C1_OSC) this.startOsc();
      else if ([C1_DCS, C1_SOS, C1_PM, C1_APC].includes(character)) this.state = 'string';
      return;
    }

    if (this.state === 'escape') {
      if (character === ']') this.startOsc();
      else if (['P', 'X', '^', '_'].includes(character)) this.state = 'string';
      else this.state = character === ESC ? 'escape' : 'ground';
      return;
    }

    if (this.state === 'string') {
      if (character === C1_ST || character === BEL) this.state = 'ground';
      else if (character === ESC) this.state = 'string-escape';
      return;
    }

    if (this.state === 'string-escape') {
      if (character === '\\' || character === C1_ST) this.state = 'ground';
      else this.state = character === ESC ? 'string-escape' : 'string';
      return;
    }

    if (this.state === 'osc-escape' || this.state === 'osc-discard-escape') {
      if (character === '\\' || character === C1_ST) this.finishOsc();
      else this.state = this.state === 'osc-escape' ? 'osc' : 'osc-discard';
      return;
    }

    if (character === BEL || character === C1_ST) {
      this.finishOsc();
    } else if (character === ESC) {
      this.state = this.state === 'osc' ? 'osc-escape' : 'osc-discard-escape';
    } else if (this.state === 'osc') {
      if (this.payload.length + character.length <= MAX_PAYLOAD) this.payload += character;
      else this.state = 'osc-discard';
    }
  }

  private startOsc(): void {
    this.payload = '';
    this.state = 'osc';
  }

  private finishOsc(): void {
    if (this.state !== 'osc-discard' && this.state !== 'osc-discard-escape') {
      const separator = this.payload.indexOf(';');
      const command = separator < 0 ? '' : this.payload.slice(0, separator);
      if (command === '0' || command === '2') this.emit(this.payload.slice(separator + 1));
    }
    this.payload = '';
    this.state = 'ground';
  }
}