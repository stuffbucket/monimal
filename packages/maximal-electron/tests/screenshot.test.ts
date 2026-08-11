import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  MIN_BYTES_PER_PIXEL,
  inspectCapture,
  pngSize,
} from '../e2e/screenshot.js';

/**
 * The blank-screenshot guard.
 *
 * The reference images are documentation, and nothing asserts on their
 * contents. That already allowed a silent failure: parking the windows with
 * `setOpacity(0)` stopped the compositor producing frames, every capture came
 * back solid white, and the suite stayed green.
 *
 * The first guard was an absolute byte floor calibrated on a macOS retina
 * capture, so Windows failed it with real screenshots. These tests pin the
 * replacement rule and, more usefully, pin the separation it depends on: a
 * uniform image has to land clearly below the threshold and a detailed one
 * clearly above, at more than one pixel density.
 */

/** A minimal PNG. Only the IHDR fields and the total size matter here. */
function png(width: number, height: number, rows: Buffer): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.byteLength);
    // The CRC is not checked by anything under test, so a placeholder keeps
    // this helper honest about what it is.
    return Buffer.concat([length, typed, Buffer.alloc(4)]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Every pixel the same colour: what a window that never painted looks like. */
function uniform(width: number, height: number, colour: number[]): Buffer {
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => colour).flat()),
  ]);
  return png(width, height, Buffer.concat(Array.from({ length: height }, () => row)));
}

/**
 * Pixel noise: the incompressible end of what a real window produces.
 *
 * Deterministic, because a random fixture makes a threshold test flap.
 */
function noisy(width: number, height: number): Buffer {
  const rows: Buffer[] = [];
  let seed = 1;
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(width * 3 + 1);
    for (let i = 1; i < row.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      row[i] = (seed >> 16) & 0xff;
    }
    rows.push(row);
  }
  return png(width, height, Buffer.concat(rows));
}

const DENSITIES: [number, number][] = [
  [1440, 900], // Windows and Linux runners, and a non-retina display.
  [2560, 1640], // The macOS shell window.
  [3840, 2160], // The macOS overlay, which covers the whole display.
];

describe('pngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(pngSize(uniform(320, 200, [0, 0, 0]))).toEqual({
      width: 320,
      height: 200,
    });
  });

  it('returns undefined for something too short to be a PNG', () => {
    expect(pngSize(Buffer.alloc(8))).toBeUndefined();
    expect(pngSize(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('inspectCapture', () => {
  it('rejects a uniform image at every pixel density', () => {
    // The actual failure this guard exists for. White is what the broken
    // compositor produced; the app background is the other plausible blank.
    for (const [width, height] of DENSITIES) {
      for (const colour of [
        [255, 255, 255],
        [0x16, 0x18, 0x1d],
      ]) {
        const verdict = inspectCapture(uniform(width, height, colour));
        expect(verdict.ok, `${width}x${height} ${JSON.stringify(colour)}`).toBe(
          false,
        );
      }
    }
  });

  it('accepts a detailed image at every pixel density', () => {
    for (const [width, height] of DENSITIES) {
      const verdict = inspectCapture(noisy(width, height));
      expect(verdict.ok, `${width}x${height}`).toBe(true);
    }
  });

  it('keeps real clearance on both sides of the threshold', () => {
    // The point of the rule. An absolute byte floor had no margin it could
    // state, which is why it broke on a second platform.
    for (const [width, height] of DENSITIES) {
      const blank = inspectCapture(uniform(width, height, [255, 255, 255]));
      const real = inspectCapture(noisy(width, height));

      expect(blank.ok).toBe(false);
      expect(real.ok).toBe(true);
      if (!real.ok) continue;

      expect(real.bytesPerPixel, `${width}x${height}`).toBeGreaterThan(
        MIN_BYTES_PER_PIXEL * 2,
      );
    }
  });

  it('does not depend on pixel density', () => {
    // The Windows regression in one assertion: the same content at a quarter
    // of the pixels is still content.
    const large = inspectCapture(noisy(2560, 1640));
    const small = inspectCapture(noisy(1280, 820));
    expect(large.ok).toBe(true);
    expect(small.ok).toBe(true);
  });

  it('rejects a zero-area image', () => {
    const verdict = inspectCapture(uniform(0, 0, []));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('zero-area');
  });

  it('rejects something that is not a PNG', () => {
    const verdict = inspectCapture(Buffer.from('not an image'));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('not a PNG');
  });

  it('names the measurement when it rejects, so a failure is actionable', () => {
    const verdict = inspectCapture(uniform(1440, 900, [255, 255, 255]));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain('1440x900');
      expect(verdict.reason).toContain('bytes per pixel');
    }
  });
});
