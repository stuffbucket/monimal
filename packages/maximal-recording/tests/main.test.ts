import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { startWindowRecording } from '../src/main.js';

const directory = mkdtempSync(path.join(tmpdir(), 'recording-test-'));
const executable = path.join(directory, 'fake-ffmpeg');
writeFileSync(executable, [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const output = process.argv.at(-1);",
  "let data = '';",
  "process.stdin.on('data', (chunk) => { data += chunk.toString(); });",
  "process.stdin.on('end', () => { fs.writeFileSync(output, data); });",
].join('\n'));
chmodSync(executable, 0o755);

vi.mock('../src/ffmpeg.js', () => ({
  detectFfmpeg: async () => ({
    state: 'ready',
    tools: [{ name: 'ffmpeg', path: executable }],
  }),
}));

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
      output: path.join(directory, 'invalid.mp4'),
      fps: 0,
      onError: vi.fn(),
      captureFrame: async () => Buffer.from('frame'),
    })).rejects.toThrow(/frame rate/);
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
});
