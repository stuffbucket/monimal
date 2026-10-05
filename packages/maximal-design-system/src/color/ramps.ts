import {
  REFERENCE_BLACK_ALPHA,
  REFERENCE_HUES,
  REFERENCE_PALE_HUES,
  REFERENCE_PALE_RAMPS,
  REFERENCE_RAMPS,
  REFERENCE_WHITE_ALPHA,
  type ReferenceHue,
  type ReferenceRamp,
} from './reference'
import { deltaEOk, gamutMap, hexFromOklch, maxChroma, mixOklab, oklchFromHex, type Oklch } from './oklab'

export const COLOR_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const
export type ColorStep = (typeof COLOR_STEPS)[number]
export type ColorMode = 'light' | 'dark'
export type Ramp = Record<ColorStep, string>

export const COLOR_HUES = REFERENCE_HUES
export type ColorHue = ReferenceHue

const ANCHOR = COLOR_STEPS.indexOf(500)

/*
 * One step relative to its ramp's anchor. Lightness is the fraction of the
 * distance from the anchor to white (positive) or to black (negative), so a
 * profile applied to a lighter or darker anchor stays inside 0..1. Chroma is a
 * ratio, so a muted anchor yields a proportionally muted ramp. Hue is an
 * offset in degrees: the reference rotates shades (yellow toward orange, blue
 * toward violet) to hold their perceived hue.
 */
interface StepOffset {
  lightness: number
  chroma: number
  hue: number
}

type Profile = readonly StepOffset[]

function hueDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

function offset(anchor: Oklch, color: Oklch): StepOffset {
  return {
    lightness: color.l >= anchor.l
      ? (color.l - anchor.l) / (1 - anchor.l)
      : (color.l - anchor.l) / anchor.l,
    chroma: anchor.c === 0 ? 0 : color.c / anchor.c,
    hue: hueDelta(anchor.h, color.h),
  }
}

function applyOffset(anchor: Oklch, step: StepOffset): Oklch {
  return {
    l: step.lightness >= 0
      ? anchor.l + (step.lightness * (1 - anchor.l))
      : anchor.l + (step.lightness * anchor.l),
    c: anchor.c * step.chroma,
    h: (anchor.h + step.hue + 360) % 360,
  }
}

function profileOf(anchor: Oklch, ramp: ReferenceRamp): Profile {
  return ramp.map((hex) => offset(anchor, oklchFromHex(hex)))
}

const LIGHT_ANCHORS = Object.fromEntries(
  COLOR_HUES.map((hue) => [hue, oklchFromHex(REFERENCE_RAMPS.light[hue][ANCHOR] ?? '')]),
) as Record<ColorHue, Oklch>

interface Calibration {
  hue: ColorHue
  anchor: Oklch
  profile: Profile
}

function calibrations(mode: ColorMode): Calibration[] {
  return COLOR_HUES.map((hue) => {
    const anchor = oklchFromHex(REFERENCE_RAMPS[mode][hue][ANCHOR] ?? '')
    return { hue, anchor, profile: profileOf(anchor, REFERENCE_RAMPS[mode][hue]) }
  }).sort((left, right) => left.anchor.h - right.anchor.h)
}

const CALIBRATIONS: Record<ColorMode, Calibration[]> = {
  light: calibrations('light'),
  dark: calibrations('dark'),
}

/* The dark anchor of each reference hue, relative to its light anchor. */
const DARK_ANCHOR_OFFSETS = Object.fromEntries(COLOR_HUES.map((hue) => [
  hue,
  offset(LIGHT_ANCHORS[hue], oklchFromHex(REFERENCE_RAMPS.dark[hue][ANCHOR] ?? '')),
])) as Record<ColorHue, StepOffset>

/* Pale ramps are relative to the light anchor of the same hue and do not change with mode. */
const PALE_CALIBRATIONS: Calibration[] = REFERENCE_PALE_HUES.map((hue) => ({
  hue,
  anchor: LIGHT_ANCHORS[hue],
  profile: profileOf(LIGHT_ANCHORS[hue], REFERENCE_PALE_RAMPS[hue]),
})).sort((left, right) => left.anchor.h - right.anchor.h)

function blend(left: Profile, right: Profile, amount: number): Profile {
  return left.map((step, index) => {
    const other = right[index] ?? step
    return {
      lightness: step.lightness + ((other.lightness - step.lightness) * amount),
      chroma: step.chroma + ((other.chroma - step.chroma) * amount),
      hue: step.hue + ((other.hue - step.hue) * amount),
    }
  })
}

/*
 * The profile for an arbitrary hue, interpolated between the two calibrated
 * hues either side of it on the hue circle. A calibrated hue returns its own
 * profile unchanged.
 */
function profileForHue(table: readonly Calibration[], hue: number): Profile {
  const first = table[0]
  const last = table.at(-1)
  if (first === undefined || last === undefined) throw new Error('No calibrated hues.')
  for (const [index, below] of table.entries()) {
    const above = table[index + 1] ?? first
    const span = ((above.anchor.h - below.anchor.h) + 360) % 360 || 360
    const distance = ((hue - below.anchor.h) + 360) % 360
    if (distance <= span) return blend(below.profile, above.profile, distance / span)
  }
  return last.profile
}

function rampFrom(anchor: Oklch, profile: Profile, anchorHex?: string): Ramp {
  return Object.fromEntries(COLOR_STEPS.map((step, index) => [
    step,
    index === ANCHOR && anchorHex !== undefined
      ? anchorHex.toLowerCase()
      : hexFromOklch(applyOffset(anchor, profile[index] ?? { lightness: 0, chroma: 1, hue: 0 })),
  ])) as Ramp
}

function calibration(table: readonly Calibration[], hue: ColorHue): Calibration | undefined {
  return table.find((entry) => entry.hue === hue)
}

/*
 * A reference hue's ramp, calculated from its light anchor. The dark ramp
 * starts from a darker, less saturated anchor and uses the dark profile:
 * colour against a dark surface reads brighter and more saturated than the
 * same colour against white.
 */
export function hueRamp(hue: ColorHue, mode: ColorMode): Ramp {
  const light = LIGHT_ANCHORS[hue]
  const anchor = mode === 'light' ? light : applyOffset(light, DARK_ANCHOR_OFFSETS[hue])
  const profile = calibration(CALIBRATIONS[mode], hue)?.profile
    ?? profileForHue(CALIBRATIONS[mode], anchor.h)
  return rampFrom(anchor, profile)
}

/* A softer ramp for low-emphasis fills; a hue without a calibrated pale ramp interpolates one. */
export function paleRamp(hue: ColorHue): Ramp {
  const anchor = LIGHT_ANCHORS[hue]
  const profile = calibration(PALE_CALIBRATIONS, hue)?.profile
    ?? profileForHue(PALE_CALIBRATIONS, anchor.h)
  return rampFrom(anchor, profile)
}

/* The surfaces the reference sheets draw each mode's ramps on: white, and dark grey 800. */
const REFERENCE_SURFACES: Record<ColorMode, Oklch> = {
  light: oklchFromHex('#ffffff'),
  dark: oklchFromHex(REFERENCE_RAMPS.dark.grey[7] ?? ''),
}

/* Every reference hue step clears one JND (ΔE_OK 0.02) from its surface; 0.04 bounds the correction. */
const VISIBILITY_CAP = 0.04

function asVisible(color: Oklch, calibrated: Oklch, mode: ColorMode): Oklch {
  const surface = REFERENCE_SURFACES[mode]
  const target = Math.min(deltaEOk(gamutMap(calibrated), surface), VISIBILITY_CAP)
  const away = color.l >= surface.l ? 1 : -1
  let moved = color
  for (let index = 0; index < 50 && deltaEOk(gamutMap(moved), surface) < target; index += 1) {
    moved = { ...moved, l: Math.min(1, Math.max(0, moved.l + (away * 0.002))) }
  }
  return moved
}

/* The calibrated anchor at an arbitrary hue, interpolated like `profileForHue`. */
function anchorForHue(table: readonly Calibration[], hue: number): Oklch {
  const first = table[0]
  if (first === undefined) throw new Error('No calibrated hues.')
  for (const [index, below] of table.entries()) {
    const above = table[index + 1] ?? first
    const span = ((above.anchor.h - below.anchor.h) + 360) % 360 || 360
    const amount = (((hue - below.anchor.h) + 360) % 360) / span
    if (amount <= 1) {
      return {
        l: below.anchor.l + ((above.anchor.l - below.anchor.l) * amount),
        c: below.anchor.c + ((above.anchor.c - below.anchor.c) * amount),
        h: hue,
      }
    }
  }
  return first.anchor
}

/*
 * A ramp whose 500 is the given colour exactly, such as a theme's accent for
 * one mode. Chroma and hue follow the colour through the hue's profile.
 * Lightness keeps each step's relative position in the calibrated ramp at
 * that hue and stretches it from the colour to the calibrated 100 and 1000,
 * so the ends sit where the reference ramps put them. An end on the wrong
 * side of the colour falls back to the colour's own profile, which keeps the
 * ramp monotonic. A step that a muted colour leaves closer to the reference
 * surface than the calibrated step is moved away from it in lightness until
 * it is as visible, up to `VISIBILITY_CAP`.
 */
export function anchoredRamp(anchorHex: string, mode: ColorMode): Ramp {
  const anchor = oklchFromHex(anchorHex)
  const profile = profileForHue(CALIBRATIONS[mode], anchor.h)
  const reference = anchorForHue(CALIBRATIONS[mode], anchor.h)
  const offsetAt = (index: number) => profile[index] ?? { lightness: 0, chroma: 1, hue: 0 }
  const end = (index: number) => {
    const calibrated = applyOffset(reference, offsetAt(index)).l
    const own = applyOffset(anchor, offsetAt(index)).l
    const lighter = index < ANCHOR
    return { from: calibrated, to: (lighter ? calibrated > anchor.l : calibrated < anchor.l) ? calibrated : own }
  }
  const ends = { light: end(0), dark: end(COLOR_STEPS.length - 1) }
  return Object.fromEntries(COLOR_STEPS.map((step, index) => {
    if (index === ANCHOR) return [step, anchorHex.toLowerCase()]
    const own = applyOffset(anchor, offsetAt(index))
    const calibrated = applyOffset(reference, offsetAt(index))
    const span = index < ANCHOR ? ends.light : ends.dark
    const position = (calibrated.l - reference.l) / ((span.from - reference.l) || 1)
    const placed = { ...own, l: anchor.l + ((span.to - anchor.l) * position) }
    return [step, hexFromOklch(asVisible(placed, calibrated, mode))]
  })) as Ramp
}

/*
 * The brand colour as published is #B8404D, at 71% of the chroma sRGB allows
 * at its lightness and hue, which reads grey. The reference 500 to 700 steps
 * sit at 91% to 98%. The ramp keeps the published lightness and hue and
 * raises chroma to `BRAND_GAMUT_SHARE`, so contrast with white is unchanged.
 */
export const BRAND_SOURCE_HEX = '#b8404d'
export const BRAND_RAMP = 'crimson'
const BRAND_GAMUT_SHARE = 0.9
const brandSource = oklchFromHex(BRAND_SOURCE_HEX)
export const BRAND_COLOR: Oklch = {
  ...brandSource,
  c: maxChroma(brandSource.l, brandSource.h) * BRAND_GAMUT_SHARE,
}
export const BRAND_HEX = hexFromOklch(BRAND_COLOR)

/*
 * Brand marks and text on the crimson are cream, published as #F2EAD6. On the
 * refined crimson the published cream reads as white, so its chroma rises by
 * the crimson's own factor; lightness and hue, and so contrast, are unchanged.
 */
export const BRAND_CREAM_SOURCE_HEX = '#f2ead6'
const creamSource = oklchFromHex(BRAND_CREAM_SOURCE_HEX)
export const BRAND_CREAM_COLOR: Oklch = { ...creamSource, c: creamSource.c * (BRAND_COLOR.c / brandSource.c) }
export const BRAND_CREAM_HEX = hexFromOklch(BRAND_CREAM_COLOR)

/* The dark anchor offset for an arbitrary hue, interpolated between the reference hues either side. */
function darkOffsetForHue(hue: number): StepOffset {
  const table = COLOR_HUES.map((name) => ({ h: LIGHT_ANCHORS[name].h, offset: DARK_ANCHOR_OFFSETS[name] }))
    .sort((left, right) => left.h - right.h)
  const first = table[0]
  if (first === undefined) throw new Error('No calibrated hues.')
  for (const [index, below] of table.entries()) {
    const above = table[index + 1] ?? first
    const span = ((above.h - below.h) + 360) % 360 || 360
    const amount = (((hue - below.h) + 360) % 360) / span
    if (amount <= 1) {
      return {
        lightness: below.offset.lightness + ((above.offset.lightness - below.offset.lightness) * amount),
        chroma: below.offset.chroma + ((above.offset.chroma - below.offset.chroma) * amount),
        hue: below.offset.hue + ((above.offset.hue - below.offset.hue) * amount),
      }
    }
  }
  return first.offset
}

/*
 * The brand ramp: the brand colour is light 500, and the dark anchor is
 * darkened and desaturated from it as the reference hues either side are.
 */
export function brandHueRamp(mode: ColorMode): Ramp {
  const anchor = mode === 'light' ? BRAND_COLOR : applyOffset(BRAND_COLOR, darkOffsetForHue(BRAND_COLOR.h))
  return anchoredRamp(hexFromOklch(anchor), mode)
}

export function referenceGreyRamp(mode: ColorMode): Ramp {
  return Object.fromEntries(COLOR_STEPS.map((step, index) => [
    step,
    REFERENCE_RAMPS[mode].grey[index] ?? '',
  ])) as Ramp
}

/*
 * Each grey step's perceptual distance from the lightest grey, from the
 * reference grey ramp's OKLab lightness: 0 at 100, 1 at 1000.
 */
const GREY_DISTANCE = (() => {
  const lightness = REFERENCE_RAMPS.light.grey.map((hex) => oklchFromHex(hex).l)
  const top = lightness[0] ?? 1
  const bottom = lightness.at(-1) ?? 0
  return lightness.map((value) => (top - value) / (top - bottom))
})()

/*
 * A theme's neutral ramp, interpolated in OKLab from its background to its
 * text with the reference grey spacing measured outward from the background.
 * Steps are numbered by lightness in both modes, so the background is 100 in
 * light mode and 1000 in dark mode, and both modes resolve finest near the
 * background, where surfaces and their states sit.
 */
export function neutralRamp(backgroundHex: string, textHex: string, mode: ColorMode): Ramp {
  const background = oklchFromHex(backgroundHex)
  const text = oklchFromHex(textHex)
  return Object.fromEntries(COLOR_STEPS.map((step, index) => {
    const fromBackground = mode === 'light' ? index : COLOR_STEPS.length - 1 - index
    const distance = GREY_DISTANCE[fromBackground] ?? 0
    const value = distance === 0
      ? backgroundHex.toLowerCase()
      : distance === 1
        ? textHex.toLowerCase()
        : hexFromOklch(mixOklab(background, text, distance))
    return [step, value]
  })) as Ramp
}

/* An opaque colour at 1000 fading to translucent below; cream fades as white does. */
export function alphaRamp(base: 'white' | 'black' | 'cream'): Ramp {
  const alphas = base === 'black' ? REFERENCE_BLACK_ALPHA : REFERENCE_WHITE_ALPHA
  const opaque = { white: '#ffffff', black: '#000000', cream: BRAND_CREAM_HEX }[base]
  const channels = [1, 3, 5].map((index) => String(Number.parseInt(opaque.slice(index, index + 2), 16))).join(' ')
  return Object.fromEntries(COLOR_STEPS.map((step, index) => {
    const alpha = alphas[index] ?? 1
    return [step, alpha === 1 ? opaque : `rgb(${channels} / ${String(alpha)})`]
  })) as Ramp
}
