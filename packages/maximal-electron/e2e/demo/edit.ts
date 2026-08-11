import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CaptionPlacement } from './caption.js';
import { markTime, sequenceById, type Take } from './take.js';

/**
 * An edit: the cut, as data.
 *
 * Holds used to be wall clock waits inside the recording, which meant a change
 * of one second cost a full re-drive of the application. They are numbers in a
 * file now. Reordering, repeating, freezing, and lengthening are all edits to
 * this file, and none of them launch anything.
 *
 * The pacing rules below are unchanged in value and in reason. What changed is
 * that breaking one is now cheap to find and cheap to fix.
 */

const ROOT = path.resolve(__dirname, '../..');
const EDITS_DIR = path.join(ROOT, 'demo', 'edits');

/**
 * Shortest hold a clip may ask for, in seconds.
 *
 * This is time on a still screen. Five seconds feels long while writing an
 * edit and about right while watching one. The first cut of this used two and
 * a half and read as a slideshow of things that had already happened.
 */
export const MIN_HOLD_SECONDS = 5;

/**
 * Pause after `drive` resolves, before the sequence ends.
 *
 * The only pacing constant that is still a real wait, and it has to be. The
 * interface is still reacting when `drive` returns, and no amount of later
 * processing can recover a frame that was never captured.
 */
export const SETTLE_SECONDS = 1.2;

/** Shortest video this will produce, in seconds. */
export const MIN_TOTAL_SECONDS = 30;

/** Held frame between two clips, in seconds. The dip happens inside it. */
export const GAP_SECONDS = 1.2;

/** Fade at each end of a clip, in seconds. */
export const DIP_SECONDS = 0.35;

/**
 * Most a final clip may be padded by, in seconds.
 *
 * Padding rescues an edit that runs a little short. Without a ceiling it would
 * also turn a ten second edit into twelve seconds of frozen screen, which
 * satisfies the duration rule and defeats the point of it.
 */
export const MAX_FINAL_PAD_SECONDS = 12;

export const OUTPUT_FPS = 30;
export const OUTPUT_WIDTH = 1440;
export const OUTPUT_HEIGHT = 900;

export interface Clip {
  /** Sequence id from the take. */
  seq: string;
  /** Seconds to hold on the frozen frame. Defaults to `MIN_HOLD_SECONDS`. */
  hold?: number;
  /** Mark to hold on. Defaults to the last frame of the played range. */
  freezeAt?: string;
  /** Marks bounding the played range. Default is the whole sequence. */
  from?: string;
  to?: string;
  /** `false` hides the card. An object moves it. Default is as captured. */
  card?: false | { placement: CaptionPlacement };
  /**
   * Tolerate a sequence the take does not hold.
   *
   * Some sequences only exist under the right conditions. The workflow
   * timeline skips its overlay scenes when no local model is running, rather
   * than faking them, so an edit that names them has to survive their absence.
   */
  optional?: boolean;
}

export interface Edit {
  /** Take name to cut from. */
  take: string;
  /** Output path, relative to the repository root. */
  output: string;
  clips: Clip[];
}

export function editPath(name: string): string {
  return path.join(EDITS_DIR, `${name}.json`);
}

export async function loadEdit(name: string): Promise<Edit> {
  const file = editPath(name);

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new Error(`No edit at ${file}. An edit lists the clips to cut.`);
  }

  const edit = JSON.parse(raw) as Edit;
  if (!Array.isArray(edit.clips)) {
    throw new Error(`${file} has no "clips" array.`);
  }
  if (typeof edit.take !== 'string' || edit.take.length === 0) {
    throw new Error(`${file} has no "take" naming which capture to cut from.`);
  }
  if (typeof edit.output !== 'string' || edit.output.length === 0) {
    throw new Error(`${file} has no "output" path.`);
  }
  return edit;
}

/** Seconds a clip contributes, played range plus hold plus the gap. */
export function clipSeconds(take: Take, clip: Clip): number {
  const sequence = sequenceById(take, clip.seq);
  const from = clip.from ? markTime(sequence, clip.from) : sequence.startedAt;
  const to = clip.to ? markTime(sequence, clip.to) : sequence.endedAt;
  const played = Math.max(0, to - from) / 1000;
  return played + holdOf(clip) + GAP_SECONDS;
}

export function holdOf(clip: Clip): number {
  return clip.hold ?? MIN_HOLD_SECONDS;
}

/**
 * Drop clips whose sequence the take does not hold.
 *
 * Only clips marked `optional`. Anything else is a mistake worth failing on.
 */
export function resolveClips(take: Take, edit: Edit): { clips: Clip[]; dropped: string[] } {
  const present = new Set(take.sequences.map((sequence) => sequence.id));
  const clips: Clip[] = [];
  const dropped: string[] = [];

  for (const clip of edit.clips) {
    if (present.has(clip.seq)) clips.push(clip);
    else if (clip.optional) dropped.push(clip.seq);
    else sequenceById(take, clip.seq); // Throws, naming what does exist.
  }

  return { clips, dropped };
}

/**
 * Reject an edit that cannot produce a watchable video.
 *
 * Every check here is cheap, and runs before a single frame is written.
 */
export function validateEdit(take: Take, clips: Clip[]): void {
  if (clips.length < 2) {
    throw new Error('An edit needs at least two clips.');
  }

  for (const clip of clips) {
    const sequence = sequenceById(take, clip.seq);
    if (clip.freezeAt) markTime(sequence, clip.freezeAt);
    if (clip.from) markTime(sequence, clip.from);
    if (clip.to) markTime(sequence, clip.to);

    const hold = holdOf(clip);
    if (!(hold >= MIN_HOLD_SECONDS)) {
      throw new Error(
        `Clip "${clip.seq}" holds for ${String(hold)}s. ` +
          `The floor is ${String(MIN_HOLD_SECONDS)}s, so the screen can be read.`,
      );
    }
  }

  const floor = clips.reduce((total, clip) => total + clipSeconds(take, clip), 0);
  const reachable = floor + MAX_FINAL_PAD_SECONDS;

  if (reachable < MIN_TOTAL_SECONDS) {
    throw new Error(
      `This edit tops out at ${reachable.toFixed(1)}s: ` +
        `${floor.toFixed(1)}s of playback, holds and gaps, plus the ` +
        `${String(MAX_FINAL_PAD_SECONDS)}s cap on padding the last clip. ` +
        `The floor is ${String(MIN_TOTAL_SECONDS)}s. Add clips or lengthen the holds.`,
    );
  }
}

/** Stretch the last hold to carry the video over the duration floor. */
export function finalHold(hold: number, elapsed: number): number {
  const shortfall = MIN_TOTAL_SECONDS - elapsed - GAP_SECONDS;
  return Math.min(Math.max(hold, shortfall), hold + MAX_FINAL_PAD_SECONDS);
}
