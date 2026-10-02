import { describe, expect, it } from 'vitest'

import { parseFontVariationAxes } from './font-variations'

function variableFontFixture(): Buffer {
  const buffer = Buffer.alloc(84)
  buffer.writeUInt32BE(0x00010000, 0)
  buffer.writeUInt16BE(1, 4)
  buffer.write('fvar', 12, 'ascii')
  buffer.writeUInt32BE(28, 20)
  buffer.writeUInt32BE(56, 24)
  buffer.writeUInt16BE(1, 28)
  buffer.writeUInt16BE(16, 32)
  buffer.writeUInt16BE(2, 36)
  buffer.writeUInt16BE(20, 38)
  buffer.write('WONK', 44, 'ascii')
  buffer.writeInt32BE(0, 48)
  buffer.writeInt32BE(0, 52)
  buffer.writeInt32BE(65_536, 56)
  buffer.write('GRAD', 64, 'ascii')
  buffer.writeInt32BE(-200 * 65_536, 68)
  buffer.writeInt32BE(0, 72)
  buffer.writeInt32BE(150 * 65_536, 76)
  return buffer
}

describe('OpenType variation discovery', () => {
  it('reads custom axes and signed 16.16 ranges from fvar', () => {
    expect(parseFontVariationAxes(variableFontFixture())).toEqual([
      { tag: 'WONK', minimum: 0, default: 0, maximum: 1 },
      { tag: 'GRAD', minimum: -200, default: 0, maximum: 150 },
    ])
  })
})
