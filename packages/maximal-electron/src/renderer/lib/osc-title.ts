enum ParserState {
  Ground,
  Escape,
  Osc,
  OscEscape,
  OscDiscard,
  OscDiscardEscape,
  String,
  StringEscape,
}

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
  private state = ParserState.Ground;
  private payload!: string;

  constructor(private readonly emit: (title: string) => void) {}

  write(chunk: string): void {
    for (const character of chunk) this.accept(character);
  }

  private accept(character: string): void {
    if (this.state === ParserState.Ground) {
      if (character === ESC) this.state = ParserState.Escape;
      else if (character === C1_OSC) this.startOsc();
      else if ([C1_DCS, C1_SOS, C1_PM, C1_APC].includes(character)) this.state = ParserState.String;
      return;
    }

    if (this.state === ParserState.Escape) {
      if (character === ']') this.startOsc();
      else if (['P', 'X', '^', '_'].includes(character)) this.state = ParserState.String;
      else this.state = character === ESC ? ParserState.Escape : ParserState.Ground;
      return;
    }

    if (this.state === ParserState.String) {
      if (character === C1_ST || character === BEL) this.state = ParserState.Ground;
      else if (character === ESC) this.state = ParserState.StringEscape;
      return;
    }

    if (this.state === ParserState.StringEscape) {
      if (character === '\\' || character === C1_ST) this.state = ParserState.Ground;
      else this.state = character === ESC ? ParserState.StringEscape : ParserState.String;
      return;
    }

    if (this.state === ParserState.OscEscape) {
      if (character === '\\' || character === C1_ST) this.finishOsc();
      else this.state = ParserState.Osc;
      return;
    }

    if (this.state === ParserState.Osc) {
      if (character === BEL || character === C1_ST) this.finishOsc();
      else if (character === ESC) this.state = ParserState.OscEscape;
      else {
        if (this.payload.length + character.length <= MAX_PAYLOAD) this.payload += character;
        else this.state = ParserState.OscDiscard;
      }
      return;
    }

    if (this.state === ParserState.OscDiscard) {
      if (character === BEL || character === C1_ST) this.finishOsc();
      else if (character === ESC) this.state = ParserState.OscDiscardEscape;
      return;
    }

    if (character === '\\' || character === C1_ST) this.finishOsc();
    else this.state = ParserState.OscDiscard;
  }

  private startOsc(): void {
    this.payload = '';
    this.state = ParserState.Osc;
  }

  private finishOsc(): void {
    if (this.state !== ParserState.OscDiscard && this.state !== ParserState.OscDiscardEscape) {
      const separator = this.payload.indexOf(';');
      // Stryker disable next-line EqualityOperator: separator 0 always yields an empty, non-emitting command.
      if (separator > 0) {
        const command = this.payload.slice(0, separator);
        if (command === '0' || command === '2') this.emit(this.payload.slice(separator + 1));
      }
    }
    this.state = ParserState.Ground;
  }
}