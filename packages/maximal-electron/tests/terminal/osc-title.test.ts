import { describe, expect, it, vi } from 'vitest';

import { OscTitleObserver } from '../../src/renderer/lib/osc-title.js';

const ESC = '\x1b';
const BEL = '\x07';
const C1_DCS = '\x90';
const C1_SOS = '\x98';
const C1_ST = '\x9c';
const C1_OSC = '\x9d';
const C1_PM = '\x9e';
const C1_APC = '\x9f';

function observe(...chunks: string[]): ReturnType<typeof vi.fn<(title: string) => void>> {
  const emit = vi.fn<(title: string) => void>();
  const observer = new OscTitleObserver(emit);
  for (const chunk of chunks) observer.write(chunk);
  return emit;
}

describe('OSC title observer', () => {
  it('accepts OSC 0 and 2 through seven-bit and C1 forms across chunk boundaries', () => {
    const emit = observe(
      `${ESC}]0;ze`, `ro${BEL}`,
      `${C1_OSC}2;two${C1_ST}`,
      `${ESC}]2;three${ESC}`, '\\',
      `${ESC}]0;${BEL}`,
    );

    expect(emit.mock.calls).toEqual([['zero'], ['two'], ['three'], ['']]);
  });

  it('ignores unsupported and malformed OSC commands and resets between payloads', () => {
    const emit = observe(
      `${ESC}]1;icon${BEL}`,
      `${ESC}]20;not-title${BEL}`,
      `${ESC}]2${BEL}`,
      `${ESC}];missing-command${BEL}`,
      `${ESC}]2;accepted${BEL}`,
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('accepted');
  });

  it('recovers from ordinary and repeated escape sequences outside control strings', () => {
    const emit = observe(
      `plain${ESC}xtext${ESC}]0;after-invalid${BEL}`,
      `${ESC}${ESC}]2;after-repeat${BEL}`,
    );

    expect(emit.mock.calls).toEqual([['after-invalid'], ['after-repeat']]);
  });

  it.each([
    ['DCS', `${ESC}P`],
    ['SOS', `${ESC}X`],
    ['PM', `${ESC}^`],
    ['APC', `${ESC}_`],
    ['C1 DCS', C1_DCS],
    ['C1 SOS', C1_SOS],
    ['C1 PM', C1_PM],
    ['C1 APC', C1_APC],
  ])('ignores OSC-like bytes inside %s strings', (_name, start) => {
    const emit = observe(
      `${start}${ESC}]0;nested${BEL}${ESC}\\`,
      `${ESC}]2;top-level${BEL}`,
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('top-level');
  });

  it.each([
    ['BEL', BEL],
    ['C1 ST', C1_ST],
    ['ST', `${ESC}\\`],
  ])('ends ignored control strings with %s', (_name, terminator) => {
    const emit = observe(
      `${C1_DCS}ignored${terminator}`,
      `${ESC}]0;recovered${BEL}`,
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('recovered');
  });

  it('keeps ignored strings isolated across false and repeated escape terminators', () => {
    const emit = observe(
      `${C1_APC}before${ESC}x${ESC}]0;still-nested${BEL}${ESC}${ESC}\\`,
      `${C1_PM}before${ESC}${C1_ST}`,
      `${ESC}]2;recovered${BEL}`,
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('recovered');
  });

  it.each([
    ['BEL', BEL],
    ['C1 ST', C1_ST],
    ['ST', `${ESC}\\`],
  ])('discards oversized OSC through %s and recovers', (_name, terminator) => {
    const emit = observe(
      `${ESC}]0;${'x'.repeat(4_095)}${terminator}`,
      `${ESC}]2;recovered${BEL}`,
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('recovered');
  });

  it('stays in discard mode through escaped ordinary bytes', () => {
    const emit = observe(
      `${ESC}]0;${'x'.repeat(4_095)}${ESC}q${ESC}\\`,
      `${ESC}]2;recovered${BEL}`,
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('recovered');
  });

  it('consumes a false OSC escape pair without losing the surrounding payload', () => {
    const emit = observe(`${ESC}]0;left${ESC}xright${BEL}`);

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('leftright');
  });

  it('accepts the exact payload cap and rejects the next UTF-16 code unit', () => {
    const exactTitle = 'x'.repeat(4_094);
    const emit = observe(
      `${ESC}]0;${exactTitle}${BEL}`,
      `${ESC}]0;${'x'.repeat(4_093)}😀${BEL}`,
      `${ESC}]2;recovered${BEL}`,
    );

    expect(emit.mock.calls).toEqual([[exactTitle], ['recovered']]);
  });
});