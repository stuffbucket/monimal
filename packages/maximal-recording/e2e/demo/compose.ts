import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CARD_BOTTOM,
  CARD_LEFT,
  CARD_TOP,
  type CaptionPlacement,
} from './caption.js';
import {
  DIP_SECONDS,
  GAP_SECONDS,
  MIN_TOTAL_SECONDS,
  clipSeconds,
  finalHold,
  holdOf,
  resolveClips,
  validateEdit,
  type Clip,
  type Edit,
} from './edit.js';
import { encode, probe, type ProbeResult, type Segment } from './encode.js';
import {
  inTake,
  markTime,
  sequenceById,
  type CardRef,
  type Frame,
  type Sequence,
  type Take,
} from './take.js';

/**
 * Compose: turn a take and an edit into an mp4.
 *
 * Nothing here launches an application or waits out a hold. A clip plays its
 * captured range at real speed and then repeats one frame for as long as the
 * edit asks. That is what makes a freeze frame, a longer beat, a reorder, and
 * a repeat all the same cheap operation.
 */

export interface ComposeResult {
  output: string;
  probe: ProbeResult;
  clips: { seq: string; seconds: number }[];
  /** Optional clips the take did not hold. */
  dropped: string[];
}

/**
 * Lay one stretch of frames out as a numbered sequence at the output rate.
 *
 * A screencast only emits when the picture changes, so a still stretch is one
 * frame. Every output tick therefore takes whichever still was last on screen
 * at that moment, and a held frame is simply linked once per tick. Links
 * rather than copies: a minute of video is eighteen hundred ticks over roughly
 * nine hundred distinct stills.
 */
async function writeRange(
  frames: Frame[],
  root: string,
  start: number,
  end: number,
  dir: string,
  fps: number,
  startTick: number,
): Promise<number> {
  const opening = frames.filter((frame) => frame.at <= start).at(-1) ?? frames[0];
  if (!opening) throw new Error('No frames were captured for a clip.');

  const ticks = Math.max(0, Math.round(((end - start) / 1000) * fps));
  let cursor = 0;
  let current = opening;

  for (let tick = 0; tick < ticks; tick += 1) {
    const at = start + (tick * 1000) / fps;
    while (cursor < frames.length) {
      const frame = frames[cursor];
      if (!frame || frame.at > at) break;
      current = frame;
      cursor += 1;
    }
    await symlink(
      path.join(root, current.file),
      path.join(dir, `${String(startTick + tick + 1).padStart(6, '0')}.jpg`),
    );
  }

  return ticks;
}

/** Repeat one still for a number of seconds. */
async function writeHold(
  frame: Frame,
  root: string,
  dir: string,
  seconds: number,
  fps: number,
  startTick: number,
): Promise<number> {
  const ticks = Math.max(1, Math.round(seconds * fps));
  for (let tick = 0; tick < ticks; tick += 1) {
    await symlink(
      path.join(root, frame.file),
      path.join(dir, `${String(startTick + tick + 1).padStart(6, '0')}.jpg`),
    );
  }
  return ticks;
}

/** The frame on screen at an instant. */
function frameAt(sequence: Sequence, at: number): Frame {
  const found = sequence.frames.filter((frame) => frame.at <= at).at(-1);
  const fallback = sequence.frames.at(-1);
  const chosen = found ?? fallback;
  if (!chosen) throw new Error(`The sequence "${sequence.id}" holds no frames.`);
  return chosen;
}

/** Where a card sits, in output pixels. */
function cardPosition(
  card: CardRef,
  placement: CaptionPlacement,
  height: number,
): { x: number; y: number } {
  const x = CARD_LEFT - card.margin;
  if (placement === 'top') return { x, y: CARD_TOP - card.margin };
  // The image carries a transparent margin, so its bottom edge sits `margin`
  // below the card itself.
  return { x, y: height - CARD_BOTTOM - card.height + card.margin };
}

export async function compose(
  take: Take,
  edit: Edit,
  output: string,
): Promise<ComposeResult> {
  const { clips, dropped } = resolveClips(take, edit);
  validateEdit(take, clips);

  const root = inTake(take.name, '.');
  const staging = await mkdtemp(path.join(tmpdir(), 'demo-compose-'));
  await mkdir(path.dirname(output), { recursive: true });

  try {
    const segments: Segment[] = [];
    const timings: { seq: string; seconds: number }[] = [];
    let elapsed = 0;

    for (const [index, clip] of clips.entries()) {
      const sequence = sequenceById(take, clip.seq);
      const dir = path.join(staging, `clip-${String(index).padStart(2, '0')}`);
      await mkdir(dir, { recursive: true });

      const from = clip.from ? markTime(sequence, clip.from) : sequence.startedAt;
      const to = clip.to ? markTime(sequence, clip.to) : sequence.endedAt;

      let ticks = await writeRange(
        sequence.frames,
        root,
        from,
        to,
        dir,
        take.fps,
        0,
      );

      const last = index === clips.length - 1;
      const hold = last
        ? finalHold(holdOf(clip), elapsed + clipSeconds(take, clip) - GAP_SECONDS)
        : holdOf(clip);

      // The gap is held on the same frame, so the dip happens across a still.
      const freeze = frameAt(sequence, clip.freezeAt ? markTime(sequence, clip.freezeAt) : to);
      ticks += await writeHold(
        freeze,
        root,
        dir,
        hold + GAP_SECONDS,
        take.fps,
        ticks,
      );

      const placement = clip.card === false ? undefined : resolvePlacement(clip, sequence);
      const card =
        placement && sequence.card
          ? {
              file: path.join(root, sequence.card.file),
              ...cardPosition(sequence.card, placement, take.height),
              scale: sequence.card.scale,
            }
          : undefined;

      segments.push({ pattern: path.join(dir, '%06d.jpg'), frames: ticks, ...(card ? { card } : {}) });

      const seconds = ticks / take.fps;
      elapsed += seconds;
      timings.push({ seq: clip.seq, seconds });
    }

    await encode({
      segments,
      output,
      width: take.width,
      height: take.height,
      fps: take.fps,
      dip: DIP_SECONDS,
    });

    const result = await probe(output);
    if (result.seconds + 0.5 < MIN_TOTAL_SECONDS) {
      throw new Error(
        `${output} is ${result.seconds.toFixed(2)}s, under the ` +
          `${String(MIN_TOTAL_SECONDS)}s floor.`,
      );
    }
    if (result.codec !== 'h264') {
      throw new Error(`${output} is ${result.codec}, not h264.`);
    }

    return { output, probe: result, clips: timings, dropped };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function resolvePlacement(clip: Clip, sequence: Sequence): CaptionPlacement | undefined {
  if (clip.card === false) return undefined;
  if (clip.card) return clip.card.placement;
  return sequence.card?.placement;
}
