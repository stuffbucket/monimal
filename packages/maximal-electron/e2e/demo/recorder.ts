import path from 'node:path';

import { capture, type CaptureOptions, type SequenceDef } from './capture.js';
import { compose, type ComposeResult } from './compose.js';
import { loadEdit } from './edit.js';

/**
 * Record: capture, then compose.
 *
 * Two steps that used to be one, and the reason is worth stating where the
 * timelines can see it. Capture drives the application and costs minutes.
 * Compose cuts the video and costs seconds. Holds, order, freezes, and cards
 * all belong to the second step, so changing any of them no longer means
 * driving a real `claude` and a real model round trip again.
 *
 * Use `npm run compose` to re-cut without capturing.
 */

const ROOT = path.resolve(__dirname, '../..');

export { sequence, type SequenceDef, type SequenceContext } from './capture.js';
export {
  DIP_SECONDS,
  GAP_SECONDS,
  MAX_FINAL_PAD_SECONDS,
  MIN_HOLD_SECONDS,
  MIN_TOTAL_SECONDS,
  OUTPUT_FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  SETTLE_SECONDS,
} from './edit.js';

export interface RecordResult extends ComposeResult {
  /** Which capture method the shell window ended up using. */
  method: string;
  /** Stills captured, across every page. */
  frames: number;
  /** Where the take was written. */
  takeDir: string;
}

export async function record(
  options: Omit<CaptureOptions, 'sequences'> & { sequences: SequenceDef[] },
): Promise<RecordResult> {
  const captured = await capture(options);
  const edit = await loadEdit(options.name);
  const output = path.resolve(ROOT, edit.output);
  const composed = await compose(captured.take, edit, output);

  return {
    ...composed,
    method: captured.method,
    frames: captured.frames,
    takeDir: captured.dir,
  };
}
