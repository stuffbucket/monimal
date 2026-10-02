export interface RgbaImage {
  width: number
  height: number
  pixels: Buffer
}

export function decodeRgbaPng(input: Buffer): RgbaImage
export function encodeRgbaPng(image: RgbaImage): Buffer
export function extractTrayGlyph(
  image: RgbaImage,
  options: { template: boolean },
): RgbaImage
