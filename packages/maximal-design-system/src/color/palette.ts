/*
 * The palette stylesheet: atomic ramps and the semantic colours that alias
 * them, for both modes at once.
 *
 * Colours are calculated in JavaScript only when a theme is applied. The
 * result is one stylesheet whose semantic tokens are `var()` aliases of
 * atomic steps, so the cascade resolves every colour; switching between
 * light and dark is a `data-theme` change with no script.
 */
import { hexFromOklch, oklchFromHex, wcagContrast } from './oklab'
import {
  COLOR_HUES,
  COLOR_STEPS,
  BRAND_CREAM_HEX,
  BRAND_RAMP,
  alphaRamp,
  anchoredRamp,
  brandHueRamp,
  hueRamp,
  neutralRamp,
  paleRamp,
  referenceGreyRamp,
  type ColorHue,
  type ColorMode,
  type ColorStep,
  type Ramp,
} from './ramps'

export interface PaletteSeed {
  background: string
  surface: string
  text: string
  accent: string
  /* Pins icon-onbrand, such as to a brand mark's colour, regardless of contrast. */
  accentIcon?: string
}

export interface PaletteSeeds {
  light: PaletteSeed
  dark: PaletteSeed
}

export type PaletteTokens = Record<`--${string}`, string>

const PREFIX = '--maximal-color'

/* WCAG 2.1 §1.4.3 text and §1.4.11 non-text minimums. */
const TEXT_CONTRAST = 4.5
const GRAPHIC_CONTRAST = 3

/*
 * Colour roles, from the colour role guide: a role names a meaning, and any
 * type takes it (`text-danger`, `bg-danger`). A hue role's `bg` is its ramp's
 * 500 fill; `text` is the first step from 500 that reads at 4.5:1 on the
 * theme's surfaces and on the role's own tint, and `icon` and `border` the
 * first that reach 3:1. Text ramps are tried in order: warning text falls back
 * to orange where no yellow step reads, which is every light background.
 */
const HUE_ROLES = {
  brand: { fill: 'brand', text: ['brand'] },
  component: { fill: 'purple', text: ['purple'] },
  assistive: { fill: 'pink', text: ['pink'] },
  danger: { fill: 'red', text: ['red'] },
  measure: { fill: 'red', text: ['red'] },
  warning: { fill: 'yellow', text: ['yellow', 'orange'] },
  success: { fill: 'green', text: ['green'] },
} as const satisfies Record<string, { fill: string; text: readonly string[] }>

/*
 * Light-fill roles: `bg` is a light fill in both modes, so a selection or
 * notice reads the same on light and dark surfaces. Selection takes the brand
 * ramp and info blue. Content on it takes `text-on{role}`, a dark step of the
 * same ramp, because the mode's own text colours are light in dark mode.
 */
const LIGHT_FILL_ROLES = { selected: 'brand', info: 'blue' } as const satisfies Record<string, string>
const LIGHT_FILLS = { fill: 200, hover: 300, pressed: 400 } as const satisfies Record<string, ColorStep>

/* Each element's surface, as a neutral distance from the background: bg-default for toolbars, bg-tertiary for menus and tooltips. */
const ELEMENT_SURFACES = { toolbar: 0, menu: 2, tooltip: 2 } as const satisfies Record<string, number>

/* Alpha steps of the on colour: 600 is 80% opaque and 400 is 40% white or 30% black. */
const ON_FILL_ALPHA = { secondary: 600, tertiary: 400 } as const satisfies Record<string, ColorStep>

/* 500 is 50% black or 70% white, which keeps secondary canvas text readable over the half of the range it is for. */
const CANVAS_TEXT_ALPHA = { secondary: 500 } as const satisfies Record<string, ColorStep>

/* Categorical chart series; series 8 is the reference grey. */
const DATA_VIZ_HUES = [
  'teal',
  'green',
  'yellow',
  'pink',
  'blue',
  'purple',
  'persimmon',
  'grey',
] as const satisfies readonly (ColorHue | 'grey')[]

type AtomicRamps = Record<string, Ramp>

function atomic(name: string, step: ColorStep): `--${string}` {
  return `${PREFIX}-${name}-${String(step)}`
}

function alias(name: string, step: ColorStep): string {
  return `var(${atomic(name, step)})`
}

/* The step `distance` steps from the background: 100 upward in light mode, 1000 downward in dark mode. */
function fromBackground(mode: ColorMode, distance: number): ColorStep {
  const index = mode === 'light' ? distance : COLOR_STEPS.length - 1 - distance
  const step = COLOR_STEPS[index]
  if (step === undefined) throw new Error(`No step ${String(distance)} from the background.`)
  return step
}

/* Steps from the anchor outward, away from the background, so the first match keeps the most colour. */
function towardContrast(mode: ColorMode): ColorStep[] {
  return mode === 'light'
    ? [500, 600, 700, 800, 900, 1000]
    : [500, 400, 300, 200, 100]
}

/*
 * The ramp's outermost step continued away from the background in OKLCH,
 * keeping its hue and its chroma relative to lightness, until it meets
 * `minimum`; used when a mid-tone background leaves no step readable.
 */
function extended(hex: string, mode: ColorMode, surfaces: readonly string[], minimum: number): string {
  const start = oklchFromHex(hex)
  const target = mode === 'light' ? 0 : 1
  for (let amount = 0.02; amount <= 1; amount += 0.02) {
    const l = start.l + ((target - start.l) * amount)
    const c = mode === 'light' ? start.c * (l / start.l) : start.c * ((1 - l) / (1 - start.l))
    const candidate = hexFromOklch({ l, c, h: start.h })
    if (Math.min(...surfaces.map((surface) => wcagContrast(candidate, surface))) >= minimum) return candidate
  }
  return mode === 'light' ? '#000000' : '#ffffff'
}

/*
 * An alias of the first step that meets `minimum` against every surface,
 * trying each ramp in order; otherwise the first ramp extended past its end.
 */
function firstReadable(
  ramps: AtomicRamps,
  names: readonly string[],
  mode: ColorMode,
  surfaces: readonly string[],
  minimum: number,
): string {
  for (const name of names) {
    const ramp = ramps[name]
    if (ramp === undefined) throw new Error(`No ${name} ramp.`)
    for (const step of towardContrast(mode)) {
      const contrast = Math.min(...surfaces.map((surface) => wcagContrast(ramp[step], surface)))
      if (contrast >= minimum) return alias(name, step)
    }
  }
  const name = names[names.length - 1]
  const ramp = name === undefined ? undefined : ramps[name]
  if (ramp === undefined) throw new Error('No candidate ramps.')
  return extended(ramp[mode === 'light' ? 1000 : 100], mode, surfaces, minimum)
}

function atomicRamps(seed: PaletteSeed, mode: ColorMode): AtomicRamps {
  const ramps: AtomicRamps = {
    white: alphaRamp('white'),
    black: alphaRamp('black'),
    cream: alphaRamp('cream'),
    grey: referenceGreyRamp(mode),
    neutral: neutralRamp(seed.background, seed.text, mode),
    brand: anchoredRamp(seed.accent, mode),
    [BRAND_RAMP]: brandHueRamp(mode),
  }
  for (const hue of COLOR_HUES) {
    ramps[hue] = hueRamp(hue, mode)
    ramps[`pale-${hue}`] = paleRamp(hue)
  }
  return ramps
}

function modeTokens(seed: PaletteSeed, mode: ColorMode): PaletteTokens {
  const ramps = atomicRamps(seed, mode)
  const tokens: PaletteTokens = {}
  for (const [name, ramp] of Object.entries(ramps)) {
    for (const step of COLOR_STEPS) tokens[atomic(name, step)] = ramp[step]
  }

  const near = (distance: number) => alias('neutral', fromBackground(mode, distance))
  const pinned = (hex: string) => hex.toLowerCase() === BRAND_CREAM_HEX.toLowerCase() ? alias('cream', 1000) : hex.toLowerCase()
  const surfaces = [seed.background, seed.surface]
  const tint = fromBackground(mode, 1)
  const tintOf = (ramp: string) => ramps[ramp]?.[tint] ?? seed.background
  const color = (type: string, ...parts: string[]) => `${PREFIX}-${[type, ...parts].join('-')}` as const

  Object.assign(tokens, {
    [color('bg', 'default')]: near(0),
    [color('bg', 'secondary')]: seed.surface.toLowerCase(),
    [color('bg', 'tertiary')]: near(2),
    [color('bg', 'hover')]: near(1),
    [color('bg', 'pressed')]: near(2),
    [color('text', 'default')]: near(9),
    [color('text', 'secondary')]: near(6),
    [color('text', 'tertiary')]: near(5),
    [color('border', 'default')]: near(3),
    [color('border', 'strong')]: near(4),
  })

  /* Neutral icons follow the text hierarchy, so a glyph beside its label never outweighs it. */
  for (const prominence of ['default', 'secondary', 'tertiary'] as const) {
    tokens[color('icon', prominence)] = `var(${color('text', prominence)})`
  }

  /* Content over user content keeps one colour in every theme and mode: dark on light canvases, light on dark ones. */
  Object.assign(tokens, {
    [color('text', 'onlightcanvas')]: alias('black', 1000),
    [color('text', 'onlightcanvas', 'secondary')]: alias('black', CANVAS_TEXT_ALPHA.secondary),
    [color('text', 'ondarkcanvas')]: alias('white', 1000),
    [color('text', 'ondarkcanvas', 'secondary')]: alias('white', CANVAS_TEXT_ALPHA.secondary),
    [color('icon', 'onlightcanvas')]: alias('black', 1000),
    [color('icon', 'ondarkcanvas')]: alias('white', 1000),
  })

  for (const [role, { fill, text }] of Object.entries(HUE_ROLES)) {
    const ramp = ramps[fill]
    if (ramp === undefined) throw new Error(`No ${fill} ramp.`)
    const against = [...surfaces, tintOf(fill)]
    /* Brand content is cream where it reads; otherwise the on colour is whichever of white and black reads better. */
    const on = role === 'brand' && wcagContrast(BRAND_CREAM_HEX, ramp[500]) >= TEXT_CONTRAST
      ? 'cream'
      : wcagContrast('#000000', ramp[500]) >= wcagContrast('#ffffff', ramp[500]) ? 'black' : 'white'
    /* Hover and pressed move the fill away from its on colour, so text on it only gains contrast. */
    const deeper = on === 'black' ? [400, 300] as const : [600, 700] as const
    const strong = firstReadable(ramps, text, mode, against, TEXT_CONTRAST)
    const graphic = firstReadable(ramps, text, mode, against, GRAPHIC_CONTRAST)
    Object.assign(tokens, {
      [color('bg', role)]: alias(fill, 500),
      [color('bg', role, 'hover')]: alias(fill, deeper[0]),
      [color('bg', role, 'pressed')]: alias(fill, deeper[1]),
      [color('bg', role, 'secondary')]: alias(fill, tint),
      [color('bg', role, 'secondary', 'hover')]: alias(fill, fromBackground(mode, 2)),
      [color('bg', role, 'tertiary')]: alias(fill, fromBackground(mode, 0)),
      [color('text', role)]: strong,
      [color('icon', role)]: graphic,
      [color('border', role)]: graphic,
      [color('border', role, 'strong')]: strong,
      [color('bg', `on${role}`)]: alias(on, 1000),
      [color('text', `on${role}`)]: alias(on, 1000),
      [color('icon', `on${role}`)]: role === 'brand' && seed.accentIcon !== undefined
        ? pinned(seed.accentIcon)
        : alias(on, 1000),
      /* Secondary and tertiary text on the fill keep the on colour and fade it, as the reference does. */
      [color('text', `on${role}`, 'secondary')]: alias(on, ON_FILL_ALPHA.secondary),
      [color('text', `on${role}`, 'tertiary')]: alias(on, ON_FILL_ALPHA.tertiary),
    })
  }

  for (const [role, hue] of Object.entries(LIGHT_FILL_ROLES)) {
    const ramp = ramps[hue]
    if (ramp === undefined) throw new Error(`No ${hue} ramp.`)
    const fills = Object.values(LIGHT_FILLS).map((step) => ramp[step])
    /* The fills are light in both modes, so readable content is searched toward the dark end, as in light mode. */
    const onFill = firstReadable(ramps, [hue], 'light', fills, TEXT_CONTRAST)
    const strong = firstReadable(ramps, [hue], mode, surfaces, TEXT_CONTRAST)
    const graphic = firstReadable(ramps, [hue], mode, surfaces, GRAPHIC_CONTRAST)
    Object.assign(tokens, {
      [color('bg', role)]: alias(hue, LIGHT_FILLS.fill),
      [color('bg', role, 'hover')]: alias(hue, LIGHT_FILLS.hover),
      [color('bg', role, 'pressed')]: alias(hue, LIGHT_FILLS.pressed),
      [color('bg', role, 'strong')]: alias(hue, 500),
      [color('text', role)]: strong,
      [color('icon', role)]: graphic,
      [color('border', role)]: graphic,
      /* A selected control's strong outline must read against its light selection fill in either mode. */
      [color('border', role, 'strong')]: role === 'selected' ? onFill : strong,
      [color('text', `on${role}`)]: onFill,
      [color('icon', `on${role}`)]: onFill,
    })
  }

  /* Disabled is exempt from contrast minimums (WCAG 2.1 §1.4.3); it stays visible but recedes. */
  Object.assign(tokens, {
    /* Dark mode lifts disabled fills with translucent white, so they sit on any dark surface. */
    [color('bg', 'disabled')]: mode === 'dark' ? alias('white', 500) : near(2),
    [color('bg', 'disabled', 'secondary')]: near(1),
    [color('text', 'disabled')]: near(4),
    [color('icon', 'disabled')]: near(4),
    [color('border', 'disabled')]: near(2),
  })

  /* Inverse is the opposite of the background: dark grey in light mode, near white in dark mode. */
  Object.assign(tokens, {
    [color('bg', 'inverse')]: near(7),
    [color('text', 'inverse')]: near(0),
    [color('icon', 'inverse')]: near(0),
    [color('border', 'inverse')]: near(7),
  })

  /*
   * Elements sit on the surface the app gives them: toolbars on the chrome,
   * menus and tooltips on the floating surface. Hover steps one neutral further
   * from the background, and a selected item takes the brand fill, with
   * text-onbrand and icon-onbrand on it.
   */
  for (const [element, distance] of Object.entries(ELEMENT_SURFACES)) {
    Object.assign(tokens, {
      [color('bg', element, 'default')]: near(distance),
      [color('bg', element, 'hover')]: near(distance + 1),
      [color('bg', element, 'selected')]: `var(${color('bg', 'brand')})`,
    })
    if (element === 'toolbar' || element === 'menu') {
      Object.assign(tokens, {
        [color('border', element, 'default')]: near(Math.max(3, distance + 1)),
        [color('border', element, 'strong')]: firstReadable(
          ramps, ['neutral'], mode, [resolvePaletteToken(tokens, color('bg', element, 'default'))], GRAPHIC_CONTRAST,
        ),
      })
    }
  }

  DATA_VIZ_HUES.forEach((hue, index) => {
    tokens[`--data-viz-series-${String(index + 1)}`] = firstReadable(ramps, [hue], mode, surfaces, GRAPHIC_CONTRAST)
  })

  return tokens
}

export function paletteTokens(seeds: PaletteSeeds): Record<ColorMode, PaletteTokens> {
  return { light: modeTokens(seeds.light, 'light'), dark: modeTokens(seeds.dark, 'dark') }
}

function block(selector: string, tokens: PaletteTokens): string {
  const body = Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
  return `${selector} {\n${body}\n}\n`
}

/* Dark is the default; the light block matches the selector the shell's other light rules use. */
export function paletteCss(seeds: PaletteSeeds): string {
  const tokens = paletteTokens(seeds)
  return `${block(':root', tokens.dark)}\n${block("[data-theme='light']", tokens.light)}`
}

/* Resolves a palette token through its `var()` aliases to a literal colour. */
export function resolvePaletteToken(tokens: PaletteTokens, name: `--${string}`): string {
  let value = tokens[name]
  for (let depth = 0; value !== undefined && depth < 8; depth += 1) {
    const reference = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1]
    if (reference === undefined) return value
    value = tokens[reference as `--${string}`]
  }
  throw new Error(`${name} does not resolve to a colour.`)
}

export const PALETTE_STYLE_ID = 'maximal-palette'

/* Replaces the palette stylesheet; unchanged text is not rewritten, so the cascade is not invalidated. */
export function applyPalette(
  seeds: PaletteSeeds,
  target = globalThis.document,
): void {
  if (target === undefined) return
  const css = paletteCss(seeds)
  let style = target.getElementById(PALETTE_STYLE_ID)
  if (style === null) {
    style = target.createElement('style')
    style.id = PALETTE_STYLE_ID
    target.head.appendChild(style)
  }
  if (style.textContent !== css) style.textContent = css
}
