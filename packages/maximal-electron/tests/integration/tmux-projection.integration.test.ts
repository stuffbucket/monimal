import { afterEach, describe, expect, it } from 'vitest';

import { TmuxProjectionHarness } from './tmux-projection-harness.js';

const ENABLED = process.env['RUN_TMUX_INTEGRATION'] === '1' && process.platform !== 'win32';

describe.skipIf(!ENABLED)('tmux projection integration', () => {
  let harness: TmuxProjectionHarness | undefined;

  afterEach(() => harness?.close());

  it('keeps one pane alive across two real client PTYs and one detach', async () => {
    harness = new TmuxProjectionHarness();
    expect(harness.attach('left')).toBe(true);
    const leftEpoch = harness.focus('left');
    expect(harness.write('left', leftEpoch, "printf 'first-marker\n'\r")).toBe(true);
    await harness.untilOutput('left', 'first-marker');

    expect(harness.attach('right', 120, 40)).toBe(true);
    await harness.untilOutput('right', 'first-marker');
    const rightEpoch = harness.focus('right', 100, 30);
    expect(harness.detach('left')).toBe(true);
    expect(harness.write('right', rightEpoch, "printf 'second-marker\n'\r")).toBe(true);
    await harness.untilOutput('right', 'second-marker');

    expect(harness.geometry()).toEqual({ cols: 100, rows: 30 });
  });

  it('fans one pane out to eight real client PTYs with one canonical geometry', async () => {
    harness = new TmuxProjectionHarness();
    const projectionIds = Array.from({ length: 8 }, (_, index) => `view-${String(index)}`);
    for (const projectionId of projectionIds) expect(harness.attach(projectionId)).toBe(true);

    const epoch = harness.focus(projectionIds[7]!, 132, 43);
    expect(harness.write(projectionIds[7]!, epoch, "printf 'fanout-marker\\n'\r")).toBe(true);
    await Promise.all(projectionIds.map((projectionId) => harness!.untilOutput(projectionId, 'fanout-marker')));

    expect(harness.geometry()).toEqual({ cols: 132, rows: 43 });
    for (const projectionId of projectionIds) {
      expect(harness.output(projectionId)).toContain('fanout-marker');
    }
  });

  it('reattaches during output without stalling an unobserved peer', async () => {
    harness = new TmuxProjectionHarness();
    harness.attach('observer');
    harness.attach('writer');
    const epoch = harness.focus('writer');
    harness.write('writer', epoch, "i=1; while [ $i -le 30 ]; do printf 'stream-%02d\\n' $i; i=$((i+1)); sleep 0.03; done\r");
    await harness.untilOutput('writer', 'stream-05');

    expect(harness.detach('observer')).toBe(true);
    expect(harness.attach('observer')).toBe(true);
    await harness.untilOutput('observer', 'stream-30');
    await harness.untilOutput('writer', 'stream-30');
  });

  it('delivers output before shell exit to every attached projection', async () => {
    harness = new TmuxProjectionHarness();
    harness.attach('left');
    harness.attach('right');
    const epoch = harness.focus('left');
    harness.write('left', epoch, "printf 'before-exit\\n'; exit\r");

    await harness.untilOutput('left', 'before-exit');
    await harness.untilOutput('right', 'before-exit');
    await harness.untilExit('left');
    await harness.untilExit('right');
    expect(harness.exitCode('left')).toBe(0);
    expect(harness.exitCode('right')).toBe(0);
  });

  it('preserves Unicode cell width, alternate screen, queries, and passthrough bytes', async () => {
    harness = new TmuxProjectionHarness();
    harness.attach('left');
    harness.attach('right');
    const epoch = harness.focus('left');
    harness.write('left', epoch, "printf '\\033[2J\\033[H界X\\033[6n\\033[?1049hALT-界\\033Ptmux;\\033\\033]52;c;cGFzc3Rocm91Z2g=\\007\\033\\\\'; sleep 2\r");

    await harness.untilPane('#{alternate_on}', '1');
    await harness.untilOutput('left', 'ALT-界');
    await harness.untilOutput('right', 'ALT-界');
    await harness.untilOutput('left', 'cGFzc3Rocm91Z2g=');
    expect(harness.output('left')).toMatch(/\^\[\[\d+;\d+R/);

    harness.write('left', epoch, '\x03');
    harness.write('left', epoch, "printf '\\033[?1049l\\033[2J\\033[H界X'; sleep 2\r");
    await harness.untilPane('#{alternate_on}', '0');
    await harness.untilPane('#{cursor_x}', '3');
  });
});