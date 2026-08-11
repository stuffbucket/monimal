/**
 * What the shell requires of a palette.
 *
 * The values in `tokens.css` are a reference default. A consumer of this shell
 * supplies their own, the same way `lib/data.ts` says to supply your own data,
 * so asserting *these* hex values in CI would be gating on sample content.
 *
 * What does belong to the shell is the list below: which token is drawn on
 * which surface, and therefore which pairs have to be legible. That is a claim
 * about the shell's own markup, and it holds whoever supplies the colours.
 *
 * So this module ships. The maths and the pair list are checked in CI; whether
 * a given palette satisfies them is checked by `npm run check:contrast`, and
 * by whatever a consumer runs against theirs.
 *
 * WCAG 2.2 contrast, from the relative-luminance definition in the
 * specification.
 *
 * Only opaque colours. A token defined as `rgb(r g b / a)` composites against
 * whatever is behind it, which this cannot know, so the soft tints are outside
 * the contract — including the surface a selected row or the current nav item
 * actually sits on. Those are real surfaces text is drawn on, and this will
 * never see them; `npm run storybook:check` runs axe over rendered pixels and
 * does. The two checks are not redundant.
 */

/** The ratio normal text must reach. Large text may use `AA_LARGE`. */
export const AA_NORMAL = 4.5;
/** 18pt, or 14pt bold. Nothing in this shell qualifies at present. */
export const AA_LARGE = 3;
/**
 * WCAG 2.2 SC 1.4.11. For a shape that carries meaning and holds no text: a
 * status dot, a tab's emphasis marker, the accent along a selected tab.
 */
export const AA_NON_TEXT = 3;

export interface ContrastPair {
  /** The token drawn in the foreground. */
  foreground: string;
  /** The token it is drawn on. */
  background: string;
  /** Where this happens, so a failure names something findable. */
  where: string;
  /** The threshold this pair has to clear. */
  minimum: number;
}

/**
 * Every foreground-on-background pair the shell actually draws.
 *
 * Derived from the stylesheets rather than from what looks plausible. A pair
 * missing here is a pair nothing checks, so add one when a component starts
 * drawing a token on a surface that is not already listed.
 *
 * `tests/contrast-coverage.test.ts` finds the pairs a single rule states
 * outright. A shape drawn by one rule onto a surface set by another is issue
 * #65 and has to be added by hand; the tab markers below are three of those.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { foreground: '--text-primary', background: '--bg-app', where: 'body text', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-canvas', where: 'canvas text', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-raised', where: 'card title', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-panel', where: 'dialog text', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-input', where: 'field value', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-active', where: 'pressed segment', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-hover', where: 'hovered tab, hovered icon button', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--tab-active', where: 'selected tab label', minimum: AA_NORMAL },
  { foreground: '--text-secondary', background: '--bg-app', where: 'nav item, field label', minimum: AA_NORMAL },
  { foreground: '--text-secondary', background: '--bg-raised', where: 'card subtitle', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-app', where: 'nav heading, tab label, placeholder', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-raised', where: 'row subtitle, hint', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-canvas', where: 'empty state', minimum: AA_NORMAL },
  { foreground: '--accent', background: '--bg-app', where: 'current nav item, busy tab marker', minimum: AA_NORMAL },
  { foreground: '--accent', background: '--tab-active', where: 'selected tab accent, busy marker on the selected tab', minimum: AA_NON_TEXT },
  { foreground: '--warning', background: '--bg-app', where: 'attention tab marker', minimum: AA_NON_TEXT },
  { foreground: '--warning', background: '--tab-active', where: 'attention marker on the selected tab', minimum: AA_NON_TEXT },
  { foreground: '--accent-contrast', background: '--accent', where: 'primary button label', minimum: AA_NORMAL },
  { foreground: '--text-on-solid', background: '--danger-fill', where: 'danger button label', minimum: AA_NORMAL },
  { foreground: '--text-invalid', background: '--bg-app', where: 'field error', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-panel', where: 'menu item, overlay hint', minimum: AA_NORMAL },
];

/**
 * Every token the shell's own stylesheets read.
 *
 * A palette that omits one of these leaves a rule resolving to nothing, which
 * renders as a transparent background or an inherited colour rather than as an
 * error. `checkPalette` cannot catch it: a pair whose tokens are absent is
 * skipped, so a consumer who never defines `--bg-input` would otherwise pass.
 *
 * Extracted from `var(--…)` in `src/renderer/styles/*.css`. `--status` and
 * `--status-soft` are deliberately absent: those are set at run time by the
 * `[data-status]` rules, not supplied by a palette.
 */
export const REQUIRED_TOKENS: string[] = [
  '--accent',
  '--accent-contrast',
  '--accent-soft',
  '--bg-active',
  '--bg-app',
  '--bg-canvas',
  '--bg-hover',
  '--bg-input',
  '--bg-panel',
  '--bg-raised',
  '--border-input',
  '--border-input-hover',
  '--border-invalid',
  '--border-strong',
  '--border-subtle',
  '--control-lg',
  '--control-md',
  '--control-sm',
  '--danger',
  '--danger-fill',
  '--danger-soft',
  '--duration-fast',
  '--ease-out',
  '--elevation-dialog',
  '--elevation-popover',
  '--focus-ring-color',
  '--focus-ring-offset',
  '--focus-ring-width',
  '--font-body',
  '--font-mono',
  '--icon-stroke',
  '--leading-base',
  '--nav-heading',
  '--opacity-disabled',
  '--radius-card',
  '--radius-chip',
  '--radius-dialog',
  '--radius-input',
  '--radius-pill',
  '--size-row',
  '--size-tabbar',
  '--size-titlebar',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--success',
  '--success-soft',
  '--tab-active',
  '--tab-fade',
  '--tab-max',
  '--tab-min',
  '--text-base',
  '--text-invalid',
  '--text-md',
  '--text-muted',
  '--text-on-solid',
  '--text-primary',
  '--text-secondary',
  '--text-sm',
  '--text-xs',
  '--tracking-caps',
  '--warning',
  '--warning-soft',
  '--weight-base',
  '--weight-lg',
  '--weight-md',
];

/** The tokens the shell needs that a palette does not define. */
export function missingTokens(palette: Record<string, string>): string[] {
  return REQUIRED_TOKENS.filter((token) => palette[token] === undefined);
}

/** An opaque colour, 0-255 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#rgb` or `#rrggbb`.
 *
 * Returns undefined for anything else, including the `rgb(r g b / a)` form the
 * soft tokens use. A translucent colour has no contrast of its own, and
 * guessing what sits behind it would be worse than declining.
 */
export function parseHex(value: string): Rgb | undefined {
  const text = value.trim();
  // Tested rather than captured. Capture groups would be indexed, and
  // `noUncheckedIndexedAccess` would then require a fallback that the match
  // itself already rules out — a branch no test can reach.
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return undefined;

  const hex = text.slice(1);
  const width = hex.length === 3 ? 1 : 2;
  const channel = (index: number): number => {
    const part = hex.slice(index * width, index * width + width);
    return Number.parseInt(width === 1 ? part + part : part, 16);
  };

  return { r: channel(0), g: channel(1), b: channel(2) };
}

/** Relative luminance, per the WCAG definition. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    // Stryker disable next-line EqualityOperator: the boundary is 0.04045,
    // which is 10.31 in a 0-255 channel. No integer channel value lands on it,
    // so `<` and `<=` cannot be told apart by any colour. The specification
    // says `<=`, and that is why it says `<=`.
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio, between 1 and 21. Order of the arguments does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface PairResult extends ContrastPair {
  ratio: number;
  passes: boolean;
}

/**
 * Whether a ratio clears a threshold.
 *
 * Its own function because the boundary is the part that gets written wrong:
 * WCAG says a ratio *of* 4.5 passes, so this is `>=`. Exactly 4.5 is a case a
 * palette can be tuned onto deliberately.
 */
export function meets(ratio: number, minimum: number): boolean {
  return ratio >= minimum;
}

/** A pair that could not be judged, and why. */
export interface SkippedPair extends ContrastPair {
  /** The tokens that were absent or in a form `parseHex` does not read. */
  unreadable: string[];
}

export interface PaletteReport {
  checked: PairResult[];
  /** Pairs no verdict could be reached on. Not a pass. */
  skipped: SkippedPair[];
  /** Tokens the shell reads that the palette does not define. */
  missing: string[];
}

/**
 * Check a palette against the pairs above.
 *
 * `palette` maps a token name to its value. A pair whose colours are absent or
 * in a form this cannot read — `oklch()`, `color-mix()`, `rgb(r g b / a)` —
 * gets no verdict, because guessing what a consumer meant would make the check
 * worth ignoring.
 *
 * What it must not do is drop those quietly. An earlier version returned only
 * the pairs it judged, so a palette written in `oklch()` produced an empty
 * result and read as success: a green run that checked nothing. `skipped` and
 * `missing` are why this returns a report rather than a list.
 */
export function checkPalette(palette: Record<string, string>): PaletteReport {
  const checked: PairResult[] = [];
  const skipped: SkippedPair[] = [];

  for (const pair of CONTRAST_PAIRS) {
    // Read explicitly rather than through `?? ''`: an absent token and one
    // written as `''` are both unreadable, so the fallback was a branch no
    // test could tell apart from the real thing.
    const front = palette[pair.foreground];
    const back = palette[pair.background];
    const foreground = front === undefined ? undefined : parseHex(front);
    const background = back === undefined ? undefined : parseHex(back);

    if (!foreground || !background) {
      const unreadable: string[] = [];
      if (!foreground) unreadable.push(pair.foreground);
      if (!background) unreadable.push(pair.background);
      skipped.push({ ...pair, unreadable });
      continue;
    }

    const ratio = contrastRatio(foreground, background);
    checked.push({ ...pair, ratio, passes: meets(ratio, pair.minimum) });
  }

  return { checked, skipped, missing: missingTokens(palette) };
}
