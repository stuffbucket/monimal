import { spawn } from 'node:child_process';

/**
 * The ffmpeg half of the recording pipeline.
 *
 * The capture side produces one still per compositor frame, at irregular
 * intervals, because a screencast only emits when something changes. So the
 * timing lives in a concat list per scene rather than in a frame rate, and
 * ffmpeg resamples that to a constant thirty frames a second.
 */

/**
 * One scene, as a numbered image sequence at the output frame rate.
 *
 * The sequence is built rather than timed. Feeding ffmpeg a concat list of
 * stills with a `duration` each looks simpler and is wrong: the concat demuxer
 * rounds every duration to the inner demuxer's time base, which for a still is
 * a fortieth of a second. Frames arriving at about thirty a second each got
 * rounded up to forty milliseconds, and a thirty eight second timeline came
 * out as fifty one seconds of slow motion.
 */
export interface Segment {
  /** Absolute `printf` pattern, for example `/tmp/clip-00/%06d.jpg`. */
  pattern: string;
  /** How many stills the sequence holds. */
  frames: number;
  /** Card to lay over this clip, if it has one. */
  card?: SegmentCard;
}

/**
 * A card overlay for one clip.
 *
 * `x` and `y` are the top left of the image in output pixels, and the image is
 * rendered at `scale` times output size for sharpness. Halving it here rather
 * than at render time keeps the card matched to frames that were themselves
 * captured large and scaled down.
 */
export interface SegmentCard {
  file: string;
  x: number;
  y: number;
  scale: number;
}

export interface EncodeOptions {
  segments: Segment[];
  output: string;
  width: number;
  height: number;
  fps: number;
  /** Length of the fade at each end of a scene, in seconds. */
  dip: number;
}

export interface ProbeResult {
  seconds: number;
  codec: string;
  width: number;
  height: number;
  frameRate: string;
  bytes: number;
}

/**
 * Where the encoder is.
 *
 * The search lives in `src/main/native/ffmpeg.ts`, and the recorder's global
 * setup runs it once before any test and pins the answers into `FFMPEG` and
 * `FFPROBE`. So this reads the result rather than searching a second time, and
 * the recorder and the application can never disagree about which binary they
 * mean.
 *
 * The bare name is the fallback for a direct call that skipped the setup. It
 * resolves through PATH, or fails with a clear `ENOENT` naming the tool.
 */
function resolveTool(name: 'ffmpeg' | 'ffprobe'): string {
  const pinned = process.env[name === 'ffmpeg' ? 'FFMPEG' : 'FFPROBE'];
  if (pinned !== undefined && pinned.trim().length > 0) return pinned.trim();
  return name;
}

export function ffmpegPath(): string {
  return resolveTool('ffmpeg');
}

export function ffprobePath(): string {
  return resolveTool('ffprobe');
}

/** Run a command and collect its output, rejecting on a non-zero exit. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${command} exited ${String(code)}\n${err.slice(-4000)}`));
    });
  });
}

/**
 * Build the filter graph.
 *
 * Every clip is scaled into the same frame, padded rather than stretched, so a
 * clip recorded from a differently shaped window still cuts together. The fade
 * at each end is the dip that keeps two clips from butting up against each
 * other. The first fade in and the last fade out double as the titles.
 *
 * The card is laid over the scaled frame, so the image and the frame share one
 * coordinate space and the offsets in the take mean what they say. The fades
 * come last, so a clip dips to black with its card rather than around it.
 *
 * `inputIndex` maps a clip to its ffmpeg input, because a clip with a card
 * contributes two inputs and one without contributes one.
 */
function filterGraph(options: EncodeOptions, inputIndex: number[]): string {
  const { width: w, height: h, fps, dip } = options;
  // `in_range=full:out_range=tv` matters. The stills are JPEG, which is full
  // range, and carrying that through tags the mp4 as `yuvj420p`. Players
  // disagree about what to do with that tag, so the same file comes out washed
  // out in one and crushed in another. Converting here writes a plain
  // `yuv420p` limited-range stream instead. It also puts black at the level
  // the fade below expects.
  const scale =
    `scale=${String(w)}:${String(h)}:force_original_aspect_ratio=decrease` +
    ':in_range=full:out_range=tv,' +
    `pad=${String(w)}:${String(h)}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    'setsar=1';

  const parts: string[] = [];

  options.segments.forEach((segment, index) => {
    const seconds = segment.frames / fps;
    const out = Math.max(0, seconds - dip).toFixed(3);
    const video = inputIndex[index] ?? 0;
    const label = `v${String(index)}`;
    const fades =
      `fade=t=in:st=0:d=${dip.toFixed(3)},` +
      `fade=t=out:st=${out}:d=${dip.toFixed(3)}`;

    if (!segment.card) {
      parts.push(`[${String(video)}:v]${scale},format=yuv420p,${fades}[${label}]`);
      return;
    }

    const card = segment.card;
    parts.push(`[${String(video)}:v]${scale}[base${String(index)}]`);
    parts.push(
      `[${String(video + 1)}:v]scale=iw/${String(card.scale)}:ih/${String(card.scale)}` +
        `[card${String(index)}]`,
    );
    // `shortest` stops the looped card extending the clip past its frames.
    parts.push(
      `[base${String(index)}][card${String(index)}]` +
        `overlay=x=${String(Math.round(card.x))}:y=${String(Math.round(card.y))}` +
        `:shortest=1,format=yuv420p,${fades}[${label}]`,
    );
  });

  const inputs = options.segments.map((_, index) => `[v${String(index)}]`).join('');
  parts.push(`${inputs}concat=n=${String(options.segments.length)}:v=1:a=0[out]`);
  return parts.join(';');
}

/** Encode every scene into one mp4 that plays anywhere. */
export async function encode(options: EncodeOptions): Promise<void> {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];

  // A clip is one input, or two when it carries a card. Record where each
  // clip's video landed, because the filter graph refers to inputs by number.
  const inputIndex: number[] = [];
  let next = 0;

  for (const segment of options.segments) {
    inputIndex.push(next);
    args.push(
      '-framerate',
      String(options.fps),
      '-start_number',
      '1',
      '-i',
      segment.pattern,
    );
    next += 1;

    if (segment.card) {
      // `-loop 1` makes the still an endless stream. `shortest` in the overlay
      // is what ends it, so the card cannot outlive the clip it belongs to.
      args.push('-loop', '1', '-framerate', String(options.fps), '-i', segment.card.file);
      next += 1;
    }
  }

  args.push(
    '-filter_complex',
    filterGraph(options, inputIndex),
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    // Constant frame rate, and a pixel format every player understands.
    '-r',
    String(options.fps),
    '-fps_mode',
    'cfr',
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    // Put the index at the front, so the file streams rather than downloads.
    '-movflags',
    '+faststart',
    options.output,
  );

  await run(ffmpegPath(), args);
}

/** Pixel dimensions of an image on disk. */
export async function imageSize(
  file: string,
): Promise<{ width: number; height: number }> {
  const raw = await run(ffprobePath(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    file,
  ]);

  const parsed = JSON.parse(raw) as { streams?: { width?: number; height?: number }[] };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) {
    throw new Error(`${file} has no readable image size.`);
  }
  return { width: stream.width, height: stream.height };
}

/**
 * Cut a rectangle out of an image, keeping transparency.
 *
 * `-c:v png` is not optional. ffmpeg picks an encoder from the extension, and
 * the default for a cropped stream drops the alpha channel, which would give
 * every card an opaque black backing.
 */
export async function cropImage(
  source: string,
  target: string,
  rect: { left: number; top: number; width: number; height: number },
): Promise<void> {
  await run(ffmpegPath(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    source,
    '-vf',
    `crop=${String(rect.width)}:${String(rect.height)}:${String(rect.left)}:${String(rect.top)}`,
    '-c:v',
    'png',
    '-pix_fmt',
    'rgba',
    target,
  ]);
}

/** Read back what was actually written. */
export async function probe(file: string): Promise<ProbeResult> {
  const raw = await run(ffprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_name,width,height,avg_frame_rate',
    '-select_streams',
    'v:0',
    '-of',
    'json',
    file,
  ]);

  const parsed = JSON.parse(raw) as {
    format?: { duration?: string; size?: string };
    streams?: {
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }[];
  };

  const stream = parsed.streams?.[0];
  if (!stream) throw new Error(`${file} has no video stream.`);

  return {
    seconds: Number(parsed.format?.duration ?? '0'),
    bytes: Number(parsed.format?.size ?? '0'),
    codec: stream.codec_name ?? 'unknown',
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    frameRate: stream.avg_frame_rate ?? 'unknown',
  };
}
