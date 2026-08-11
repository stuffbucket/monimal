import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { clearCaption, renderCard, type CaptionPlacement } from './caption.js';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH, OUTPUT_FPS, SETTLE_SECONDS } from './edit.js';
import { createRecorder, type CaptureMethod, type Frame } from './screencast.js';
import {
  resetTake,
  takeDir,
  writeTake,
  type Mark,
  type Sequence,
  type Take,
} from './take.js';

/**
 * Capture: drive the application once, and keep everything.
 *
 * What this deliberately does **not** do is wait. Holds and gaps used to be
 * real seconds spent here, staring at a still screen, which is why a hundred
 * second video cost a hundred seconds of driving and why changing one beat
 * meant doing all of it again. Timing belongs to the cut now. See `edit.ts`.
 *
 * What still has to happen in real time is `SETTLE_SECONDS`. The interface is
 * mid-reaction when `drive` returns, and a frame that was never captured
 * cannot be recovered later.
 */

export interface SequenceContext {
  app: ElectronApplication;
  /** The main shell window. */
  shell: Page;
  /**
   * Remember this instant under a name.
   *
   * Call it the moment something becomes true, and an edit can freeze there by
   * name. That stays correct when the next capture reaches the same moment at
   * a different time, which a hard-coded offset does not.
   */
  mark: (label: string) => void;
}

export interface SequenceDef {
  /** Stable name the edit refers to. Unique within a capture. */
  id: string;
  /** Heading on the card. */
  name: string;
  /** Second line under the heading. */
  note?: string;
  /**
   * Where the card sits. Move it to the top when the page draws something
   * along its bottom edge, which the overlay card does.
   */
  caption?: CaptionPlacement;
  /**
   * Resolve the page this sequence records. Runs before the clock starts, so
   * setup here stays out of the video. Defaults to the shell.
   */
  target?: (context: SequenceContext) => Promise<Page>;
  /** What the viewer watches happen. */
  drive: (context: SequenceContext) => Promise<void>;
}

export interface CaptureOptions {
  app: ElectronApplication;
  shell: Page;
  /** Take name. One directory under `demo/takes`, overwritten each run. */
  name: string;
  sequences: SequenceDef[];
  width?: number;
  height?: number;
}

export interface CaptureResult {
  take: Take;
  dir: string;
  method: CaptureMethod;
  frames: number;
}

/**
 * Declare a sequence.
 *
 * Use this rather than an object literal. It is where the id rules are
 * checked, and a literal would skip them.
 */
export function sequence(definition: SequenceDef): SequenceDef {
  if (definition.id.trim().length === 0) {
    throw new Error('A sequence needs an id. The edit refers to it by that name.');
  }
  if (!/^[a-z0-9-]+$/.test(definition.id)) {
    throw new Error(
      `Sequence id "${definition.id}" should be lower case, digits, and dashes. ` +
        'It is a key in a JSON file that a person edits by hand.',
    );
  }
  if (definition.name.trim().length === 0) {
    throw new Error('A sequence needs a name. It is the card the viewer reads.');
  }
  return definition;
}

const wait = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.round(seconds * 1000)));

/** Put the window at the size the video is cut for. */
async function resizeShell(
  app: ElectronApplication,
  shell: Page,
  width: number,
  height: number,
): Promise<void> {
  const handle = await app.browserWindow(shell);
  // Keep the position. A quiet run has already moved the window out of the
  // user's way, and putting it back would hijack the desktop for a minute.
  await handle.evaluate(
    (win, size) => {
      const bounds = win.getBounds();
      win.setBounds({ x: bounds.x, y: bounds.y, ...size });
    },
    { width, height },
  );
  await shell.waitForFunction(
    (size) => window.innerWidth === size.width && window.innerHeight === size.height,
    { width, height },
    { timeout: 10_000 },
  );
}

/**
 * Frames belonging to one sequence, plus the picture it opened on.
 *
 * A screencast emits only when something changes, so a sequence that starts on
 * a still screen has no frame of its own until the first change. Carrying the
 * last frame from before the start gives it something to show meanwhile.
 */
function framesFor(all: Frame[], startedAt: number, endedAt: number, dir: string): Frame[] {
  const opening = all.filter((frame) => frame.at <= startedAt).at(-1);
  const within = all.filter((frame) => frame.at > startedAt && frame.at <= endedAt);
  const chosen = opening ? [opening, ...within] : within;

  return chosen.map((frame) => ({
    at: frame.at,
    file: path.relative(dir, frame.file),
  }));
}

export async function capture(options: CaptureOptions): Promise<CaptureResult> {
  const { app, shell, name, sequences } = options;
  const width = options.width ?? OUTPUT_WIDTH;
  const height = options.height ?? OUTPUT_HEIGHT;

  if (sequences.length === 0) throw new Error('A capture needs at least one sequence.');

  const seen = new Set<string>();
  for (const item of sequences) {
    sequence(item);
    if (seen.has(item.id)) {
      throw new Error(`Two sequences share the id "${item.id}". Ids must be unique.`);
    }
    seen.add(item.id);
  }

  await resizeShell(app, shell, width, height);

  const dir = await resetTake(name);

  // Cards first, while nothing is recording. Rendering them into the frames is
  // what used to make them permanent.
  const cards = new Map<
    string,
    { width: number; height: number; margin: number; scale: number }
  >();
  for (const item of sequences) {
    cards.set(
      item.id,
      await renderCard(
        app,
        path.join(dir, 'cards', `${item.id}.png`),
        item.name,
        item.note,
        item.caption ?? 'bottom',
        { width, height },
      ),
    );
  }

  const recorder = createRecorder(path.join(dir, 'frames'));
  const touched = new Set<Page>([shell]);
  const spans: {
    def: SequenceDef;
    page: Page;
    startedAt: number;
    endedAt: number;
    marks: Mark[];
  }[] = [];

  try {
    for (const [index, item] of sequences.entries()) {
      const marks: Mark[] = [];
      const context: SequenceContext = {
        app,
        shell,
        mark: (label) => marks.push({ label, at: Date.now() }),
      };

      const page = item.target ? await item.target(context) : shell;
      touched.add(page);
      await recorder.attach(page);

      const startedAt = Date.now();
      await item.drive(context);

      // Let the interface finish reacting. This is the one wait that cannot
      // move to the cut.
      await wait(SETTLE_SECONDS);
      const endedAt = Date.now();

      spans.push({ def: item, page, startedAt, endedAt, marks });
      process.stdout.write(
        `  ${String(index + 1)}/${String(sequences.length)} ${item.id} — ` +
          `${((endedAt - startedAt) / 1000).toFixed(1)}s captured\n`,
      );
    }
  } finally {
    await recorder.stop();
    for (const page of touched) await clearCaption(page);
  }

  const take: Take = {
    name,
    width,
    height,
    fps: OUTPUT_FPS,
    sequences: spans.map((span): Sequence => {
      const card = cards.get(span.def.id);
      return {
        id: span.def.id,
        name: span.def.name,
        ...(span.def.note === undefined ? {} : { note: span.def.note }),
        ...(card
          ? {
              card: {
                file: path.join('cards', `${span.def.id}.png`),
                placement: span.def.caption ?? 'bottom',
                ...card,
              },
            }
          : {}),
        startedAt: span.startedAt,
        endedAt: span.endedAt,
        marks: span.marks,
        frames: framesFor(recorder.frames(span.page), span.startedAt, span.endedAt, dir),
      };
    }),
  };

  const empty = take.sequences.filter((item) => item.frames.length === 0);
  if (empty.length > 0) {
    throw new Error(
      `No frames were captured for: ${empty.map((item) => item.id).join(', ')}. ` +
        'The window is probably not compositing.',
    );
  }

  await writeTake(take);

  let frames = 0;
  for (const page of new Set(spans.map((span) => span.page))) {
    frames += recorder.frames(page).length;
  }

  return { take, dir: takeDir(name), method: recorder.methodFor(shell), frames };
}
