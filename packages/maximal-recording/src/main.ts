import { spawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { detectFfmpeg } from './ffmpeg.js';

export interface RecordingSession {
  stop(): Promise<{ output: string; frames: number }>;
}

export interface RecordingOptions {
  output: string;
  captureFrame(): Promise<Uint8Array>;
  fps?: number;
  onError(error: Error): void;
}

/**
 * Record only frames supplied by the host. The host owns consent, the window,
 * and the destination; this package never accepts either from a renderer.
 */
export async function startWindowRecording(options: RecordingOptions): Promise<RecordingSession> {
  if (!path.isAbsolute(options.output) || path.extname(options.output).toLowerCase() !== '.mp4') {
    throw new Error('A recording needs an absolute .mp4 output path chosen by the host.');
  }
  const fps = options.fps ?? 10;
  if (!Number.isInteger(fps) || fps < 1 || fps > 30) {
    throw new Error('Recording frame rate must be an integer between 1 and 30.');
  }
  try {
    await stat(options.output);
    throw new Error(`A recording already exists at ${options.output}.`);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  const encoder = await detectFfmpeg();
  if (encoder.state === 'missing') throw new Error(encoder.hint);
  const executable = encoder.tools.find((tool) => tool.name === 'ffmpeg');
  if (!executable) throw new Error('ffmpeg detection returned no encoder.');

  const child = spawn(executable.path, [
    '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps),
    '-vcodec', 'png', '-i', 'pipe:0', '-an', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', options.output,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
  const completed = new Promise<Error | undefined>((resolve) => {
    child.once('error', (error) => resolve(error));
    child.once('close', (code) => resolve(
      code === 0 ? undefined : new Error(`ffmpeg exited ${String(code)}: ${stderr.slice(-4000)}`),
    ));
  });

  let stopping = false;
  let frames = 0;
  let captureError: Error | undefined;
  let wake: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interval = 1000 / fps;
  const loop = (async () => {
    while (!stopping) {
      const frame = await options.captureFrame();
      if (stopping) break;
      if (frame.length === 0) throw new Error('The captured window frame is empty.');
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(Buffer.from(frame), (error) => error ? reject(error) : resolve());
      });
      frames += 1;
      if (stopping) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, interval);
      });
      wake = undefined;
      timer = undefined;
    }
  })().catch((error: unknown) => {
    captureError = error instanceof Error ? error : new Error(String(error));
    stopping = true;
    if (!child.stdin.writableEnded) child.stdin.end();
    options.onError(captureError);
  });

  let result: Promise<{ output: string; frames: number }> | undefined;
  return {
    stop() {
      result ??= (async () => {
        stopping = true;
        if (timer) clearTimeout(timer);
        wake?.();
        await loop;
        if (!child.stdin.writableEnded) child.stdin.end();
        const encodeError = await completed;
        if (captureError || encodeError || frames === 0) {
          await rm(options.output, { force: true });
          throw captureError ?? encodeError ?? new Error('No window frames were recorded.');
        }
        const output = await stat(options.output);
        if (output.size === 0) {
          await rm(options.output, { force: true });
          throw new Error('ffmpeg produced an empty recording.');
        }
        return { output: options.output, frames };
      })();
      return result;
    },
  };
}
