/**
 * Deciding whether a screenshot is real content or a blank window.
 *
 * This exists because of a specific failure: making the windows transparent
 * for a quiet test run stopped the compositor producing content, every
 * reference image came out blank white, and the suite stayed green. An
 * artifact that looks like success and is not is worse than a missing one.
 *
 * The first guard was an absolute byte floor. It was calibrated on a macOS
 * retina capture, so it failed on Windows, where the same window is a quarter
 * of the pixels and a real screenshot is legitimately smaller. That is a
 * platform constant pretending to be a quality check.
 *
 * Compressed size per pixel does not depend on pixel density, which is the
 * property actually wanted here: a uniform image compresses to nearly nothing
 * however large it is, and a window full of text and edges does not.
 */

/** Bytes of the PNG signature and the length and type of the IHDR chunk. */
const IHDR_WIDTH_OFFSET = 16;

/**
 * Minimum compressed bytes per pixel for a capture to count as content.
 *
 * Measured in this repository:
 *
 * | Image | Bytes per pixel |
 * | --- | --- |
 * | Uniform blank, white or dark, 1440x900 and 2560x1640 | 0.0035 to 0.0046 |
 * | Real captures: overlay, shell, terminal | 0.0129 to 0.0570 |
 *
 * The overlay is the low end of the real range, because most of it is a flat
 * scrim. This threshold sits between the two, about 1.7 times above the
 * densest blank and 1.6 times below the sparsest real capture.
 */
export const MIN_BYTES_PER_PIXEL = 0.008;

export interface PngSize {
  width: number;
  height: number;
}

/**
 * Read a PNG's dimensions from its IHDR chunk.
 *
 * IHDR is required to be the first chunk, so width and height sit at fixed
 * offsets. Returns undefined for anything too short to be a PNG, which is
 * itself a failure worth reporting.
 */
export function pngSize(data: Uint8Array): PngSize | undefined {
  if (data.byteLength < IHDR_WIDTH_OFFSET + 8) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    width: view.getUint32(IHDR_WIDTH_OFFSET),
    height: view.getUint32(IHDR_WIDTH_OFFSET + 4),
  };
}

export type CaptureVerdict =
  | { ok: true; width: number; height: number; bytesPerPixel: number }
  | { ok: false; reason: string };

/** Whether a captured PNG carries enough detail to be a real window. */
export function inspectCapture(data: Uint8Array): CaptureVerdict {
  const size = pngSize(data);
  if (!size) return { ok: false, reason: 'not a PNG, or truncated' };

  const pixels = size.width * size.height;
  if (pixels === 0) {
    return { ok: false, reason: `zero-area image, ${size.width}x${size.height}` };
  }

  const bytesPerPixel = data.byteLength / pixels;
  if (bytesPerPixel < MIN_BYTES_PER_PIXEL) {
    return {
      ok: false,
      reason:
        `${String(data.byteLength)} bytes over ${size.width}x${size.height} is ` +
        `${bytesPerPixel.toFixed(4)} bytes per pixel, under the ` +
        `${String(MIN_BYTES_PER_PIXEL)} floor. The window is probably not ` +
        'compositing, so the image is blank.',
    };
  }

  return { ok: true, width: size.width, height: size.height, bytesPerPixel };
}
