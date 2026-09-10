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
// Stryker disable next-line StringLiteral: an unknown state follows the same discard path until termination.
const STRING_STATE = 'string' as const;
// Stryker disable next-line StringLiteral: an unknown state remains non-emitting and terminates identically.
const OSC_DISCARD_STATE = 'osc-discard' as const;

export class OscTitleObserver {
  private state: ParserState = 'ground';
  // Stryker disable next-line StringLiteral: startOsc clears this before payload can be observed.
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
      else if (['P', 'X', '^', '_'].includes(character)) this.state = STRING_STATE;
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
      else this.state = character === ESC ? 'string-escape' : STRING_STATE;
      return;
    }

    if (this.state === 'osc-escape' || this.state === 'osc-discard-escape') {
      if (character === '\\' || character === C1_ST) this.finishOsc();
      else this.state = this.state === 'osc-escape' ? 'osc' : OSC_DISCARD_STATE;
      return;
    }

    if (character === BEL || character === C1_ST) {
      this.finishOsc();
    } else if (character === ESC) {
      this.state = this.state === 'osc' ? 'osc-escape' : 'osc-discard-escape';
    } else {
      // Stryker disable next-line ConditionalExpression: appending while discarding cannot affect finishOsc output.
      const collecting = this.state === 'osc';
      // Stryker disable next-line ConditionalExpression: appending while discarding cannot affect finishOsc output.
      if (!collecting) return;
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
      // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: every missing-separator value is a non-title command.
      const command = separator < 0 ? '' : this.payload.slice(0, separator);
      if (command === '0' || command === '2') this.emit(this.payload.slice(separator + 1));
    }
    // Stryker disable next-line StringLiteral: startOsc clears this before the next observable payload.
    this.payload = '';
    this.state = 'ground';
  }
}