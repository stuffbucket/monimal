import { deflateSync, inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function unfilter(scanlines, width, height) {
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  let sourceOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[sourceOffset]
    sourceOffset += 1
    for (let x = 0; x < stride; x += 1) {
      const source = scanlines[sourceOffset + x]
      const outputOffset = y * stride + x
      const left = x >= 4 ? pixels[outputOffset - 4] : 0
      const above = y > 0 ? pixels[outputOffset - stride] : 0
      const upperLeft = y > 0 && x >= 4 ? pixels[outputOffset - stride - 4] : 0
      if (filter === 0) pixels[outputOffset] = source
      else if (filter === 1) pixels[outputOffset] = source + left
      else if (filter === 2) pixels[outputOffset] = source + above
      else if (filter === 3) pixels[outputOffset] = source + Math.floor((left + above) / 2)
      else if (filter === 4) pixels[outputOffset] = source + paeth(left, above, upperLeft)
      else throw new Error(`Unsupported PNG filter ${String(filter)}`)
    }
    sourceOffset += stride
  }
  return pixels
}

export function decodeRgbaPng(input) {
  if (!input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Input is not a PNG')
  }
  let width = 0
  let height = 0
  const imageData = []
  for (let offset = PNG_SIGNATURE.length; offset < input.length;) {
    const length = input.readUInt32BE(offset)
    const type = input.toString('ascii', offset + 4, offset + 8)
    const data = input.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('Expected an 8-bit, non-interlaced RGBA PNG')
      }
    } else if (type === 'IDAT') {
      imageData.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }
  if (width === 0 || height === 0 || imageData.length === 0) {
    throw new Error('PNG is missing image data')
  }
  const scanlines = inflateSync(Buffer.concat(imageData))
  return { width, height, pixels: unfilter(scanlines, width, height) }
}

let crcTable

function crc32(input) {
  crcTable ??= Array.from({ length: 256 }, (_, value) => {
    let current = value
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) === 1
        ? 0xedb88320 ^ (current >>> 1)
        : current >>> 1
    }
    return current >>> 0
  })
  let crc = 0xffffffff
  for (const byte of input) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const output = Buffer.alloc(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  name.copy(output, 4)
  data.copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8)
  return output
}

export function encodeRgbaPng({ width, height, pixels }) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const stride = width * 4
  const scanlines = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function extractTrayGlyph(image, { template }) {
  const alpha = Buffer.alloc(image.width * image.height)
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      const sourceAlpha = image.pixels[offset + 3]
      const green = image.pixels[offset + 1]
      const glyphAlpha = Math.round(sourceAlpha * Math.max(0, Math.min(1, (green - 64) / 144)))
      alpha[y * image.width + x] = glyphAlpha
      if (glyphAlpha <= 4) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('App icon contains no tray glyph')

  const glyphWidth = maxX - minX + 1
  const glyphHeight = maxY - minY + 1
  const padding = Math.ceil(Math.max(glyphWidth, glyphHeight) * 0.12)
  const size = Math.max(glyphWidth, glyphHeight) + padding * 2
  const output = Buffer.alloc(size * size * 4)
  const xOffset = Math.floor((size - glyphWidth) / 2)
  const yOffset = Math.floor((size - glyphHeight) / 2)
  for (let y = 0; y < glyphHeight; y += 1) {
    for (let x = 0; x < glyphWidth; x += 1) {
      const sourceX = minX + x
      const sourceY = minY + y
      const sourceOffset = (sourceY * image.width + sourceX) * 4
      const outputOffset = ((yOffset + y) * size + xOffset + x) * 4
      if (!template) {
        output[outputOffset] = image.pixels[sourceOffset]
        output[outputOffset + 1] = image.pixels[sourceOffset + 1]
        output[outputOffset + 2] = image.pixels[sourceOffset + 2]
      }
      output[outputOffset + 3] = alpha[sourceY * image.width + sourceX]
    }
  }
  return { width: size, height: size, pixels: output }
}
