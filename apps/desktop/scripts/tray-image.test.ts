import { describe, expect, it } from 'vitest'

import {
  decodeRgbaPng,
  encodeRgbaPng,
  extractTrayGlyph,
} from './tray-image.mjs'

function appIconFixture() {
  const width = 8
  const height = 6
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 1; y <= 4; y += 1) {
    for (let x = 1; x <= 6; x += 1) {
      const offset = (y * width + x) * 4
      pixels[offset] = 204
      pixels[offset + 1] = 47
      pixels[offset + 2] = 77
      pixels[offset + 3] = 255
    }
  }
  for (const [x, y] of [[2, 2], [3, 3], [4, 3], [5, 2]]) {
    const offset = (y * width + x) * 4
    pixels[offset] = 245
    pixels[offset + 1] = 236
    pixels[offset + 2] = 211
  }
  return { width, height, pixels }
}

describe('tray image generation', () => {
  it('round trips the generated RGBA PNG format', () => {
    const image = appIconFixture()

    expect(decodeRgbaPng(encodeRgbaPng(image))).toEqual(image)
  })

  it('removes the app-icon squircle from the macOS template image', () => {
    const glyph = extractTrayGlyph(appIconFixture(), { template: true })
    const opaquePixels = []
    for (let offset = 0; offset < glyph.pixels.length; offset += 4) {
      if (glyph.pixels[offset + 3] > 0) opaquePixels.push(offset)
    }

    expect(opaquePixels.length).toBe(4)
    expect(opaquePixels.every((offset) =>
      glyph.pixels[offset] === 0
      && glyph.pixels[offset + 1] === 0
      && glyph.pixels[offset + 2] === 0,
    )).toBe(true)
  })

  it('retains the brand glyph colour for non-template trays', () => {
    const glyph = extractTrayGlyph(appIconFixture(), { template: false })
    const opaqueOffset = glyph.pixels.findIndex((value, offset) =>
      offset % 4 === 3 && value === 255,
    )

    expect(opaqueOffset).toBeGreaterThan(2)
    expect([...glyph.pixels.subarray(opaqueOffset - 3, opaqueOffset)]).toEqual([
      245,
      236,
      211,
    ])
  })
})
