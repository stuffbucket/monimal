import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  AA_NORMAL,
  CONTRAST_PAIRS,
  checkPalette,
  REQUIRED_TOKENS,
  contrastRatio,
  luminance,
  meets,
  missingTokens,
  parseHex,
  type Rgb,
} from '../src/renderer/lib/contrast.js';
import { isPackageToken, readTokens, stylesheets } from './stylesheets.js';

/**
 * The contrast contract.
 *
 * What is tested here is the maths and the pair list — the part that is the
 * shell's. Whether `tokens.css` satisfies it is a different question, checked
 * by `npm run check:contrast`, because the values in that file are a reference
 * default and a consumer supplies their own.
 *
 * The examples come first and the properties come last. An example pins a
 * point somebody chose; a property states what holds at every point, including
 * the ones nobody chose. See #132 for why both are here, and `docs/testing.md`
 * for why the properties stop at this module.
 */

describe('parseHex', () => {
  it('reads the long form', () => {
    expect(parseHex('#16181d')).toEqual({ r: 0x16, g: 0x18, b: 0x1d });
  });

  it('reads the short form by doubling each digit', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#08f')).toEqual({ r: 0, g: 0x88, b: 255 });
  });

  it('is case insensitive, because tokens.css is not consistent', () => {
    expect(parseHex('#E6E8EC')).toEqual(parseHex('#e6e8ec'));
  });

  it('tolerates the whitespace getPropertyValue leaves on', () => {
    expect(parseHex('  #ffffff  ')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('declines a translucent colour rather than guessing what is behind it', () => {
    // `--accent-soft` and friends are `rgb(r g b / a)`. Compositing them needs
    // a backdrop this function is not given.
    expect(parseHex('rgb(110 168 254 / 0.16)')).toBeUndefined();
  });

  it('declines anything else', () => {
    for (const value of ['', 'white', '#ff', '#fffff', '#gggggg', 'var(--accent)']) {
      expect(parseHex(value), value).toBeUndefined();
    }
  });

  it('is anchored at both ends', () => {
    // Without the anchors a hex buried in a longer value would parse, and a
    // consumer writing `1px solid #ffffff` would get a colour out of a border.
    for (const value of ['x#fff', '#ffffff00', 'solid #ffffff', '#fff;']) {
      expect(parseHex(value), value).toBeUndefined();
    }
  });
});

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
  });

  it('weights green most and blue least, as the specification does', () => {
    const red = luminance({ r: 255, g: 0, b: 0 });
    const green = luminance({ r: 0, g: 255, b: 0 });
    const blue = luminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it('uses the linear segment below the threshold', () => {
    // Values at or under 0.04045 scaled are divided rather than raised to a
    // power. Getting this branch backwards is invisible except in near-blacks,
    // which is most of this palette.
    expect(luminance({ r: 10, g: 10, b: 10 })).toBeCloseTo(10 / 255 / 12.92, 12);
  });
});

describe('contrastRatio', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('is 21 for black on white', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 6);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 10);
  });

  it('does not depend on the order of its arguments', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(contrastRatio(white, black), 10);
  });

  it('agrees with a published figure', () => {
    // #6f7783 on #16181d, the pair that opened issue #28. Reported by axe as
    // 3.92; this pins the maths against an independent tool.
    const ratio = contrastRatio({ r: 0x6f, g: 0x77, b: 0x83 }, { r: 0x16, g: 0x18, b: 0x1d });
    expect(ratio).toBeCloseTo(3.92, 1);
  });
});

describe('meets', () => {
  it('passes a ratio exactly on the threshold', () => {
    // WCAG says a ratio *of* 4.5 passes. Written as `>` this is off by the
    // one case a palette gets deliberately tuned onto.
    expect(meets(4.5, 4.5)).toBe(true);
  });

  it('passes above and fails below', () => {
    expect(meets(4.51, 4.5)).toBe(true);
    expect(meets(4.49, 4.5)).toBe(false);
  });
});

describe('CONTRAST_PAIRS', () => {
  it('names a threshold every pair can be judged against', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(pair.minimum).toBeGreaterThan(1);
      expect(pair.where, `${pair.foreground} on ${pair.background}`).not.toBe('');
    }
  });

  it('names tokens, not colours', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(pair.foreground.startsWith('--')).toBe(true);
      expect(pair.background.startsWith('--')).toBe(true);
    }
  });

  it('lists no pair twice', () => {
    const keys = CONTRAST_PAIRS.map((pair) => `${pair.foreground}|${pair.background}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * Set at run time by the `[data-status]` and `[data-band]` rules rather than
 * supplied by a palette. Requiring them would fail every consumer.
 */
const RUNTIME_ONLY = ['--status', '--status-soft', '--band'];

/** Every `var(--…)` the shell's own stylesheets read. */
function referencedTokens(): string[] {
  const found = new Set<string>();

  for (const [, css] of stylesheets()) {
    for (const token of readTokens(css)) {
      // The `--shell-*` namespace is the public package's contract: a consumer
      // supplies those, README.md documents them, and
      // `tests/package-styles.test.ts` checks them. This used to skip
      // `structural.css` by name, which holds only while there is one file on
      // each side. The namespace is the distinction, so classify the token.
      if (isPackageToken(token)) continue;
      if (!RUNTIME_ONLY.includes(token)) found.add(token);
    }
  }

  return [...found].sort();
}

describe('REQUIRED_TOKENS', () => {
  it('is exactly what the stylesheets read', () => {
    /*
     * The tripwire, and the reason this list is not just data.
     *
     * A component that starts using a token nobody has to define ships a rule
     * that resolves to nothing for a consumer — a transparent background or an
     * inherited colour, never an error. A token dropped from the stylesheets
     * and left here demands something of a consumer for no reason.
     *
     * Read from the files rather than pinned as a literal, so the list cannot
     * be right today and wrong after the next component.
     */
    expect([...REQUIRED_TOKENS].sort()).toEqual(referencedTokens());
  });


  it('names every token the pair list refers to', () => {
    // A pair naming a token nobody has to define is a pair that will always
    // be skipped, which is worse than not listing it.
    for (const pair of CONTRAST_PAIRS) {
      expect(REQUIRED_TOKENS, pair.foreground).toContain(pair.foreground);
      expect(REQUIRED_TOKENS, pair.background).toContain(pair.background);
    }
  });

  it('lists no token twice', () => {
    expect(new Set(REQUIRED_TOKENS).size).toBe(REQUIRED_TOKENS.length);
  });

  it('omits the run-time status properties', () => {
    // `--status`, `--status-soft` and `--band` are set by the `[data-status]`
    // and `[data-band]` rules, not supplied by a palette. Requiring them would
    // fail every consumer.
    expect(REQUIRED_TOKENS).not.toContain('--status');
    expect(REQUIRED_TOKENS).not.toContain('--status-soft');
    expect(REQUIRED_TOKENS).not.toContain('--band');
  });
});

describe('missingTokens', () => {
  it('names what a palette does not define', () => {
    expect(missingTokens({})).toEqual(REQUIRED_TOKENS);
  });

  it('is empty when everything is present', () => {
    const complete = Object.fromEntries(
      REQUIRED_TOKENS.map((token) => [token, '#000000']),
    );
    expect(missingTokens(complete)).toEqual([]);
  });

  it('counts a token as present whatever its value', () => {
    // A palette may define a colour this cannot parse. That is a skipped pair,
    // not a missing token, and the two need different fixes.
    const complete = Object.fromEntries(
      REQUIRED_TOKENS.map((token) => [token, 'oklch(0.7 0.1 250)']),
    );
    expect(missingTokens(complete)).toEqual([]);
  });
});

describe('checkPalette', () => {
  const full = (overrides: Record<string, string>): Record<string, string> => ({
    ...Object.fromEntries(REQUIRED_TOKENS.map((token) => [token, '#000000'])),
    ...overrides,
  });

  it('judges each pair against its own threshold', () => {
    const report = checkPalette(full({ '--text-primary': '#ffffff', '--bg-app': '#000000' }));
    const pair = report.checked.find(
      (result) => result.foreground === '--text-primary' && result.background === '--bg-app',
    );
    expect(pair?.passes).toBe(true);
    expect(pair?.ratio).toBeCloseTo(21, 6);
  });

  it('fails a pair that does not clear its threshold', () => {
    const report = checkPalette(full({ '--text-primary': '#777777', '--bg-app': '#888888' }));
    expect(report.checked.every((result) => result.passes)).toBe(false);
  });

  it('reports a pair it cannot read rather than dropping it', () => {
    // The failure this exists to prevent: an earlier version returned only the
    // pairs it judged, so a palette in `oklch()` produced an empty list and
    // read as success. A green run that checked nothing.
    const report = checkPalette(full({ '--text-primary': 'oklch(0.7 0.1 250)' }));
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(report.skipped.every((pair) => pair.unreadable.includes('--text-primary'))).toBe(
      true,
    );
  });

  it('names which side of a pair it could not read', () => {
    const report = checkPalette(full({ '--bg-app': 'color-mix(in srgb, red, blue)' }));
    const pair = report.skipped.find((entry) => entry.background === '--bg-app');
    expect(pair?.unreadable).toEqual(['--bg-app']);
  });

  it('blames only the foreground when only the foreground is unreadable', () => {
    // The mirror of the case above. Without both, a version that always blames
    // both sides passes: every assertion about one side still holds.
    const report = checkPalette(full({ '--text-invalid': 'oklch(0.6 0.2 20)' }));
    const pair = report.skipped.find((entry) => entry.foreground === '--text-invalid');
    expect(pair?.unreadable).toEqual(['--text-invalid']);
  });

  it('names both sides when neither reads', () => {
    const report = checkPalette({});
    expect(report.checked).toEqual([]);
    expect(report.skipped).toHaveLength(CONTRAST_PAIRS.length);
    expect(report.skipped[0]?.unreadable).toHaveLength(2);
  });

  it('carries the missing tokens through', () => {
    expect(checkPalette({}).missing).toEqual(REQUIRED_TOKENS);
    expect(checkPalette(full({})).missing).toEqual([]);
  });

  it('accounts for every pair, either checked or skipped', () => {
    // The invariant that makes a summary trustworthy: nothing vanishes.
    const report = checkPalette(full({ '--text-primary': 'oklch(0.7 0.1 250)' }));
    expect(report.checked.length + report.skipped.length).toBe(CONTRAST_PAIRS.length);
  });

  it('reads the threshold from the pair, not from a constant', () => {
    const report = checkPalette(full({}));
    expect(report.checked[0]?.minimum).toBe(AA_NORMAL);
  });

  it('carries `where` through, so a failure names something findable', () => {
    const report = checkPalette(full({ '--text-muted': '#6f7783', '--bg-app': '#16181d' }));
    const pair = report.checked.find(
      (result) => result.foreground === '--text-muted' && result.background === '--bg-app',
    );
    expect(pair?.where).toContain('nav heading');
    expect(pair?.passes).toBe(false);
  });
});

/* ----------------------------------------------------------- properties */

/**
 * The seed is fixed, and `FAST_CHECK_SEED` moves it.
 *
 * Stryker maps tests to mutants from a dry run and then reruns the covering
 * tests once per mutant. A suite that draws different inputs on the second run
 * can report a mutant as surviving for a reason that has nothing to do with
 * the mutant, and `npm run mutate` breaks below 100. So exploration is a thing
 * somebody does on purpose by moving the seed, not something a gate does by
 * accident. A failure prints the seed and the shrunk counterexample, and both
 * reproduce the run exactly.
 */
const config = {
  seed: Number(process.env['FAST_CHECK_SEED'] ?? 132),
  numRuns: 200,
} as const;

const channel = fc.integer({ min: 0, max: 255 });
const colour: fc.Arbitrary<Rgb> = fc.record({ r: channel, g: channel, b: channel });

/** Two channel values, the second strictly above the first. */
const rising = fc
  .integer({ min: 0, max: 254 })
  .chain((low) => fc.tuple(fc.constant(low), fc.integer({ min: low + 1, max: 255 })));

const twoDigits = (value: number): string => value.toString(16).padStart(2, '0');
const longHex = ({ r, g, b }: Rgb): string =>
  `#${twoDigits(r)}${twoDigits(g)}${twoDigits(b)}`;

/** One hexadecimal digit. `fc.hexa` was removed in fast-check 4. */
const hexDigit = fc.constantFrom(...'0123456789abcdef');

/** The forms a real palette is written in, readable and not. */
const tokenValue = fc.oneof(
  colour.map(longHex),
  colour.map((rgb) => longHex(rgb).toUpperCase()),
  fc.tuple(hexDigit, hexDigit, hexDigit).map(([r, g, b]) => `#${r}${g}${b}`),
  fc.constantFrom(
    'oklch(0.7 0.1 250)',
    'rgb(110 168 254 / 0.16)',
    'color-mix(in srgb, red, blue)',
    'var(--accent)',
    'white',
    '',
  ),
  fc.string(),
);

describe('contrastRatio, over every pair of colours', () => {
  it('does not depend on the order of its arguments', () => {
    // The examples above assert this for black and white. Symmetry is a claim
    // about every pair, and a version that divides `first` by `second`
    // satisfies that example and fails here.
    fc.assert(
      fc.property(colour, colour, (a, b) => {
        expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
      }),
      config,
    );
  });

  it('stays inside the range the specification defines', () => {
    // Exact bounds rather than approximate ones: white sums to a luminance of
    // 1 in floating point, so 21 is reached and never passed.
    fc.assert(
      fc.property(colour, colour, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }),
      config,
    );
  });

  it('never rises as one grey moves toward the other', () => {
    const grey = (value: number): Rgb => ({ r: value, g: value, b: value });

    fc.assert(
      fc.property(channel, channel, channel, (x, y, z) => {
        const light = Math.max(x, y, z);
        const dark = Math.min(x, y, z);
        const between = x + y + z - light - dark;
        expect(contrastRatio(grey(dark), grey(light))).toBeGreaterThanOrEqual(
          contrastRatio(grey(between), grey(light)),
        );
      }),
      config,
    );
  });
});

describe('luminance, over every colour', () => {
  it('rises when any one channel rises', () => {
    // Monotone in each channel separately. A coefficient written as zero, or
    // with the wrong sign, passes the weighting example above for the other
    // two channels and fails here on the one it broke.
    fc.assert(
      fc.property(colour, fc.constantFrom('r', 'g', 'b'), rising, (base, key, [low, high]) => {
        expect(luminance({ ...base, [key]: high })).toBeGreaterThan(
          luminance({ ...base, [key]: low }),
        );
      }),
      config,
    );
  });
});

describe('parseHex, over every string', () => {
  it('round trips a colour through its long form', () => {
    fc.assert(
      fc.property(colour, (rgb) => {
        expect(parseHex(longHex(rgb))).toEqual(rgb);
      }),
      config,
    );
  });

  it('reads a short form as the long form with each digit doubled', () => {
    fc.assert(
      fc.property(hexDigit, hexDigit, hexDigit, (r, g, b) => {
        expect(parseHex(`#${r}${g}${b}`)).toEqual(parseHex(`#${r}${r}${g}${g}${b}${b}`));
      }),
      config,
    );
  });

  it('returns whole channels in range, or nothing at all', () => {
    /*
     * The failure this rules out is a partial read. `Number.parseInt` returns
     * NaN for a digit it does not recognise, and a NaN channel reaches a ratio
     * that compares as false against every threshold — a palette that fails
     * for a reason no message names.
     */
    let read = 0;

    fc.assert(
      fc.property(tokenValue, (text) => {
        const rgb = parseHex(text);
        if (rgb === undefined) return;
        read += 1;
        for (const value of [rgb.r, rgb.g, rgb.b]) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(255);
        }
      }),
      config,
    );

    expect(read, 'no generated value parsed, so the assertions never ran').toBeGreaterThan(0);
  });
});

describe('meets, over every ratio', () => {
  const ratio = fc.double({ min: 1, max: 21, noNaN: true });

  it('passes a ratio against itself, which is where the boundary is', () => {
    // `>` satisfies every example except the one on the boundary. This is that
    // example, at every point.
    fc.assert(
      fc.property(ratio, (value) => {
        expect(meets(value, value)).toBe(true);
      }),
      config,
    );
  });

  it('never fails a threshold below one it clears', () => {
    let cleared = 0;

    fc.assert(
      fc.property(ratio, ratio, ratio, (value, x, y) => {
        if (!meets(value, Math.max(x, y))) return;
        cleared += 1;
        expect(meets(value, Math.min(x, y))).toBe(true);
      }),
      config,
    );

    expect(cleared, 'no generated ratio cleared its higher threshold').toBeGreaterThan(0);
  });
});

describe('checkPalette, over every palette', () => {
  /*
   * Built inside each test rather than beside them. Read at describe time,
   * this runs while the file is being collected, and a mutant that empties
   * `REQUIRED_TOKENS` then throws before a single test exists — which the
   * mutation runner scores as a survivor rather than as a failure. It cost a
   * point off `npm run mutate` once already.
   */
  const palettes = () => fc.dictionary(fc.constantFrom(...REQUIRED_TOKENS), tokenValue);
  const key = (pair: { foreground: string; background: string }): string =>
    `${pair.foreground}|${pair.background}`;
  const expected = CONTRAST_PAIRS.map(key).sort();

  it('reports every pair exactly once, checked or skipped', () => {
    /*
     * The machine-checked form of the second false pass this repository
     * recorded. `checkPalette` returned only the pairs it could judge, so a
     * palette written in `oklch()` produced an empty list and read as a clean
     * run. Nothing may vanish, whatever the palette says.
     */
    let checked = 0;
    let skipped = 0;

    fc.assert(
      fc.property(palettes(), (values) => {
        const report = checkPalette(values);
        checked += report.checked.length;
        skipped += report.skipped.length;

        expect([...report.checked, ...report.skipped].map(key).sort()).toEqual(expected);
      }),
      config,
    );

    expect(checked, 'no pair was ever judged, so `checked` was never examined').toBeGreaterThan(
      0,
    );
    expect(skipped, 'no pair was ever skipped, so `skipped` was never examined').toBeGreaterThan(
      0,
    );
  });

  it('never reports a verdict on a colour it could not read', () => {
    let judged = 0;
    let declined = 0;

    fc.assert(
      fc.property(palettes(), (values) => {
        const report = checkPalette(values);

        for (const result of report.checked) {
          judged += 1;
          expect(parseHex(values[result.foreground] ?? '')).toBeDefined();
          expect(parseHex(values[result.background] ?? '')).toBeDefined();
        }

        for (const pair of report.skipped) {
          declined += 1;
          expect(pair.unreadable.length).toBeGreaterThan(0);
          for (const token of pair.unreadable) {
            expect(parseHex(values[token] ?? '')).toBeUndefined();
          }
        }
      }),
      config,
    );

    expect(judged, 'no pair was judged, so the verdicts went unexamined').toBeGreaterThan(0);
    expect(declined, 'no pair was skipped, so the reasons went unexamined').toBeGreaterThan(0);
  });

  it('skips every pair that names a token the palette does not define', () => {
    // The cross-check between the two halves of the report. A missing token is
    // reported once in `missing`, and again as the reason each pair naming it
    // reached no verdict.
    fc.assert(
      fc.property(palettes(), (values) => {
        const report = checkPalette(values);

        for (const token of report.missing) {
          for (const pair of CONTRAST_PAIRS) {
            if (pair.foreground !== token && pair.background !== token) continue;
            const entry = report.skipped.find((candidate) => key(candidate) === key(pair));
            expect(entry?.unreadable, `${token} in ${pair.where}`).toContain(token);
          }
        }
      }),
      config,
    );
  });
});
