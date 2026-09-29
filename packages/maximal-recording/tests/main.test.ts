import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startWindowRecording } from '../src/main.js';

const directory = mkdtempSync(path.join(tmpdir(), 'recording-test-'));
const executable = path.join(directory, 'fake-ffmpeg');
writeFileSync(executable, [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const output = process.argv.at(-1);",
  "let data = '';",
  "process.stdin.on('data', (chunk) => { data += chunk.toString(); });",
  "process.stdin.on('end', () => {",
  "  if (output.includes('encode-error')) {",
  "    fs.writeFileSync(output, data);",
  "    process.stderr.write('intentional encoder failure');",
  "    process.exitCode = 2;",
  "  } else {",
  "    fs.writeFileSync(output, output.includes('empty-output') ? '' : data);",
  "  }",
  "});",
].join('\n'));
chmodSync(executable, 0o755);

const detectFfmpeg = vi.hoisted(() => vi.fn());

vi.mock('../src/ffmpeg.js', () => ({
  detectFfmpeg,
}));

beforeEach(() => {
  detectFfmpeg.mockResolvedValue({
    state: 'ready',
    tools: [{ name: 'ffmpeg', path: executable }],
  });
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('window recording capability', () => {
  it('streams captured frames to the host-selected file and stops exactly once', async () => {
    const output = path.join(directory, 'capture.mp4');
    let captures = 0;
    const session = await startWindowRecording({
      output,
      onError: vi.fn(),
      captureFrame: async () => {
        captures += 1;
        return Buffer.from('frame');
      },
    });
    await vi.waitFor(() => expect(captures).toBeGreaterThan(0));
    const saved = await session.stop();
    expect(saved).toEqual({ output, frames: 1 });
    expect(await session.stop()).toEqual(saved);
    expect(readFileSync(output, 'utf8')).toBe('frame');
    await expect(startWindowRecording({
      output,
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/already exists/);
  });

  it('rejects an invalid destination without starting a process', async () => {
    await expect(startWindowRecording({
      output: 'relative.mp4',
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/absolute .mp4/);
    await expect(startWindowRecording({
      output: path.join(directory, 'invalid.mov'),
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/absolute .mp4/);
    await expect(startWindowRecording({
      output: path.join(directory, 'invalid.mp4'),
      fps: 0,
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/frame rate/);
    await expect(startWindowRecording({
      output: path.join(directory, 'invalid.mp4'),
      fps: 31,
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/frame rate/);
    await expect(startWindowRecording({
      output: path.join(directory, 'invalid.mp4'),
      fps: 1.5,
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/frame rate/);
    expect(detectFfmpeg).not.toHaveBeenCalled();
  });

  it.each([1, 30])('accepts the frame-rate boundary %i', async (fps) => {
    const output = path.join(directory, `boundary-${fps}.mp4`);
    const session = await startWindowRecording({
      output,
      fps,
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    });
    await vi.waitFor(() => expect(detectFfmpeg).toHaveBeenCalledOnce());
    await session.stop();
  });

  it('reports unavailable and incomplete encoder detection', async () => {
    detectFfmpeg.mockResolvedValueOnce({
      state: 'missing',
      hint: 'Install the recorder tools.',
      tools: [],
    });
    await expect(startWindowRecording({
      output: path.join(directory, 'missing.mp4'),
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow('Install the recorder tools.');

    detectFfmpeg.mockResolvedValueOnce({
      state: 'ready',
      tools: [{ name: 'ffprobe', path: executable }],
    });
    await expect(startWindowRecording({
      output: path.join(directory, 'incomplete.mp4'),
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow('ffmpeg detection returned no encoder.');
  });

  it('reports capture errors and does not leave a partial recording', async () => {
    const output = path.join(directory, 'failed.mp4');
    const failure = new Error('capture failed');
    const onError = vi.fn();
    const session = await startWindowRecording({
      output,
      captureFrame: async () => { throw failure; },
      onError,
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    await expect(session.stop()).rejects.toThrow('capture failed');
    expect(() => readFileSync(output)).toThrow();
  });

  it('rejects an empty captured frame and removes partial output', async () => {
    const output = path.join(directory, 'empty-frame.mp4');
    const onError = vi.fn();
    const session = await startWindowRecording({
      output,
      captureFrame: async () => Buffer.alloc(0),
      onError,
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    await expect(session.stop()).rejects.toThrow('captured window frame is empty');
    expect(() => readFileSync(output)).toThrow();
  });

  it('rejects an encoder failure and removes partial output', async () => {
    const output = path.join(directory, 'encode-error.mp4');
    let captures = 0;
    const session = await startWindowRecording({
      output,
      onError: vi.fn(),
      captureFrame: async () => {
        captures += 1;
        return Buffer.from('frame');
      },
    });
    await vi.waitFor(() => expect(captures).toBeGreaterThan(0));
    await expect(session.stop()).rejects.toThrow(/ffmpeg exited 2: intentional encoder failure/);
    expect(() => readFileSync(output)).toThrow();
  });

  it('rejects an empty encoder output and removes it', async () => {
    const output = path.join(directory, 'empty-output.mp4');
    let captures = 0;
    const session = await startWindowRecording({
      output,
      onError: vi.fn(),
      captureFrame: async () => {
        captures += 1;
        return Buffer.from('frame');
      },
    });
    await vi.waitFor(() => expect(captures).toBeGreaterThan(0));
    await expect(session.stop()).rejects.toThrow('ffmpeg produced an empty recording.');
    expect(() => readFileSync(output)).toThrow();
  });

  it('rejects a recording stopped before its first capture resolves', async () => {
    const output = path.join(directory, 'no-frames.mp4');
    let resolveCapture: ((frame: Buffer) => void) | undefined;
    const session = await startWindowRecording({
      output,
      onError: vi.fn(),
      captureFrame: () => new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    });
    await vi.waitFor(() => expect(resolveCapture).toBeTypeOf('function'));
    const stopped = session.stop();
    resolveCapture?.(Buffer.from('frame'));
    await expect(stopped).rejects.toThrow('No window frames were recorded.');
    expect(() => readFileSync(output)).toThrow();
  });
});
