import path from 'node:path';

import { expect, test } from '@playwright/test';

import { compose } from './compose.js';
import { loadEdit } from './edit.js';
import { readTake } from './take.js';

/**
 * Re-cut a video from frames that were already captured.
 *
 * This is the cheap half. It launches nothing, so a change to a hold, an
 * order, a freeze, or a card costs seconds rather than a full re-drive of the
 * application.
 *
 * `scripts/compose.mjs` is the front door and sets `COMPOSE_NAMES`.
 */

const ROOT = path.resolve(__dirname, '../..');
const names = (process.env['COMPOSE_NAMES'] ?? '').split(',').filter(Boolean);

test.describe('compose', () => {
  for (const name of names) {
    test(name, async () => {
      const edit = await loadEdit(name);
      const take = await readTake(edit.take);
      const output = path.resolve(ROOT, edit.output);

      const result = await compose(take, edit, output);

      process.stdout.write(
        `\n  ${result.output}\n` +
          result.clips
            .map((clip) => `    ${clip.seq} — ${clip.seconds.toFixed(1)}s\n`)
            .join('') +
          `  ${result.probe.seconds.toFixed(2)}s, ${result.probe.codec}, ` +
          `${String(result.probe.width)}x${String(result.probe.height)}, ` +
          `${(result.probe.bytes / 1e6).toFixed(2)} MB\n` +
          result.dropped
            .map((seq) => `  note: the take has no "${seq}", so it was skipped\n`)
            .join('') +
          '\n',
      );

      expect(result.probe.seconds).toBeGreaterThanOrEqual(30);
      expect(result.probe.codec).toBe('h264');
    });
  }
});
