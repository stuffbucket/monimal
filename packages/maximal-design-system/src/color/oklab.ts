/*
 * OKLab and OKLCH (Björn Ottosson, 2020) for sRGB colours.
 *
 * Ramps are calculated in OKLCH, where lightness and chroma track perception,
 * and serialized as sRGB hex: Chromium keeps an `oklch()` declaration in its
 * computed value, and the terminal and visual checks read computed colours
 * as hex or `rgb()`.
 */

export interface Oklch {
  l: number
  c: number
  h: number
}

type Vector = [number, number, number]

function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function gamma(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : (1.055 * (channel ** (1 / 2.4))) - 0.055
}

function linearToOklab([red, green, blue]: Vector): Vector {
  const l = Math.cbrt((0.4122214708 * red) + (0.5363325363 * green) + (0.0514459929 * blue))
  const m = Math.cbrt((0.2119034982 * red) + (0.6806995451 * green) + (0.1073969566 * blue))
  const s = Math.cbrt((0.0883024619 * red) + (0.2817188376 * green) + (0.6299787005 * blue))
  return [
    (0.2104542553 * l) + (0.793617785 * m) - (0.0040720468 * s),
    (1.9779984951 * l) - (2.428592205 * m) + (0.4505937099 * s),
    (0.0259040371 * l) + (0.7827717662 * m) - (0.808675766 * s),
  ]
}

function oklabToLinear([lightness, a, b]: Vector): Vector {
  const l = (lightness + (0.3963377774 * a) + (0.2158037573 * b)) ** 3
  const m = (lightness - (0.1055613458 * a) - (0.0638541728 * b)) ** 3
  const s = (lightness - (0.0894841775 * a) - (1.291485548 * b)) ** 3
  return [
    (4.0767416621 * l) - (3.3077115913 * m) + (0.2309699292 * s),
    (-1.2684380046 * l) + (2.6097574011 * m) - (0.3413193965 * s),
    (-0.0041960863 * l) - (0.7034186147 * m) + (1.707614701 * s),
  ]
}

function toLab({ l, c, h }: Oklch): Vector {
  const radians = (h * Math.PI) / 180
  return [l, c * Math.cos(radians), c * Math.sin(radians)]
}

function fromLab([l, a, b]: Vector): Oklch {
  const c = Math.hypot(a, b)
  return { l, c, h: c < 1e-6 ? 0 : (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360 }
}

function hexChannels(hex: string): Vector {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`${hex} is not a six-digit hex colour.`)
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as Vector
}

export function oklchFromHex(hex: string): Oklch {
  return fromLab(linearToOklab(hexChannels(hex).map(linear) as Vector))
}

export function deltaEOk(left: Oklch, right: Oklch): number {
  const [l1, a1, b1] = toLab(left)
  const [l2, a2, b2] = toLab(right)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function inGamut(rgb: Vector): boolean {
  return rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6)
}

/* The highest chroma at this lightness and hue that is inside sRGB without clipping. */
export function maxChroma(l: number, h: number): number {
  let minimum = 0
  let maximum = 0.5
  while (maximum - minimum > 0.00001) {
    const chroma = (minimum + maximum) / 2
    if (inGamut(oklabToLinear(toLab({ l, c: chroma, h })))) minimum = chroma
    else maximum = chroma
  }
  return minimum
}

function clip(color: Oklch): Oklch {
  const rgb = oklabToLinear(toLab(color))
    .map((channel) => gamma(Math.max(0, channel)))
    .map((channel) => Math.min(1, Math.max(0, channel))) as Vector
  return fromLab(linearToOklab(rgb.map(linear) as Vector))
}

/*
 * CSS Color 4 §13.2 gamut mapping: reduce chroma at constant lightness and
 * hue until clipping the result moves it less than one just-noticeable
 * difference (ΔE_OK 0.02).
 */
export function gamutMap(color: Oklch): Oklch {
  if (color.l >= 1) return { l: 1, c: 0, h: color.h }
  if (color.l <= 0) return { l: 0, c: 0, h: color.h }
  if (inGamut(oklabToLinear(toLab(color)))) return color
  const jnd = 0.02
  let clipped = clip(color)
  if (deltaEOk(clipped, color) < jnd) return clipped
  let minimum = 0
  let maximum = color.c
  let minimumInGamut = true
  let current = color
  while (maximum - minimum > 0.0001) {
    const chroma = (minimum + maximum) / 2
    current = { ...color, c: chroma }
    const linearRgb = oklabToLinear(toLab(current))
    if (minimumInGamut && inGamut(linearRgb)) {
      minimum = chroma
      continue
    }
    clipped = clip(current)
    const error = deltaEOk(clipped, current)
    if (error < jnd) {
      if (jnd - error < 0.0001) return clipped
      minimumInGamut = false
      minimum = chroma
    } else {
      maximum = chroma
    }
  }
  return clip(current)
}

export function hexFromOklch(color: Oklch): string {
  const rgb = oklabToLinear(toLab(gamutMap(color)))
  return `#${rgb
    .map((channel) => Math.round(Math.min(1, Math.max(0, gamma(Math.max(0, channel)))) * 255)
      .toString(16)
      .padStart(2, '0'))
    .join('')}`
}

/* Interpolates in OKLab, which keeps a blend between two hues from passing through grey. */
export function mixOklab(from: Oklch, to: Oklch, amount: number): Oklch {
  const left = toLab(from)
  const right = toLab(to)
  return fromLab(left.map((value, index) => value + (((right[index] ?? value) - value) * amount)) as Vector)
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexChannels(hex).map(linear) as Vector
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

/* WCAG 2.1 contrast ratio. */
export function wcagContrast(left: string, right: string): number {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right))
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right))
  return (lighter + 0.05) / (darker + 0.05)
}
