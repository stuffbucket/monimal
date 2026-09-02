import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderedClasses, scanClassNames } from './class-names.js';
import {
  baseStyledClasses,
  componentStyles,
  exportedModules,
  isPackageToken,
  mirroredRules,
  packageReads,
  readTokens,
  styledClasses,
  stylesheets,
} from './stylesheets.js';

/**
 * What `structural.css` owes a consumer, and what a consumer owes it.
 *
 * `structural.css` is the stylesheet the package ships. It defines no palette:
 * it reads the `--shell-*` namespace, and `README.md` holds the table that
 * tells a consumer which of those they have to define. Nothing checked that
 * table, and nothing checked that the file styles the classes the exported
 * components actually render.
 *
 * Both are the `REQUIRED_TOKENS` defect on the seam `stuffbucket/maximal`
 * depends on. A token or a class the package stylesheet does not carry is a
 * rule that resolves to nothing for a consumer — a transparent background or an
 * unstyled element, never an error.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const structural = readFileSync(new URL('structural.css', STYLES), 'utf8');
const reads = packageReads(structural);

/** The class every rule the package ships sits under. */
const SHELL_ROOT = '.sb-shell';

/**
 * The reference application's stylesheets, which are the oracle for a rule the
 * package owes. They are the ones an eye is on: `npm start` renders them and
 * `npm run stills` photographs them.
 *
 * `shell.css` alone was the oracle until the class-name reader was widened, and
 * it holds the shell and none of the controls. Stripping the base
 * `.btn--primary` rule out of `structural.css` and leaving its hover selector
 * behind then passed, which is the `nav__break` hole in the other direction:
 * the class was compared against a stylesheet that never styled it.
 */
const REFERENCE = ['shell.css', 'controls.css'];

function reference(): string {
  const found = stylesheets().filter(([name]) => REFERENCE.includes(name));
  // The floor. A rename here would leave every comparison below over an empty
  // string, which reports a clean package stylesheet by reading nothing.
  if (found.length !== REFERENCE.length) {
    throw new Error(`the style directory holds ${found.length} of ${REFERENCE.join(' and ')}`);
  }
  return found.map(([, css]) => css).join('\n');
}

/** The table in README.md that tells a consumer what to define. */
function documented(): string[] {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  return [...readme.matchAll(/^\| `(--shell-[a-z0-9-]+)` \| /gm)]
    .map((match) => match[1] ?? '')
    .sort();
}

describe('the package token namespace', () => {
  it('partitions every token the stylesheets read', () => {
    // The claim that lets `contrast.test.ts` classify by prefix rather than by
    // filename. A stylesheet reading both namespaces would belong to both
    // contracts, and neither check could say which one owned it.
    for (const [name, css] of stylesheets()) {
      const tokens = readTokens(css);
      const ours = tokens.filter((token) => isPackageToken(token));
      const theirs = tokens.filter((token) => !isPackageToken(token));

      expect(
        ours.length === 0 || theirs.length === 0,
        `${name} reads both namespaces: ${theirs[0] ?? ''} and ${ours[0] ?? ''}`,
      ).toBe(true);
    }
  });

  it('is the whole of what structural.css reads', () => {
    // The package stylesheet ships no palette, so every value in it is the
    // consumer's. A palette token here would resolve against `tokens.css`
    // during development and against nothing in a consumer's application.
    expect(reads.required.size).toBeGreaterThan(0);
    expect(readTokens(structural).filter((token) => !isPackageToken(token))).toEqual([]);
  });

  it('declares none of its own tokens', () => {
    // A declaration here would be a default palette, which README.md says the
    // stylesheet does not ship. A consumer would inherit colours they did not
    // choose, on whichever properties happened to be declared.
    const declared = [...structural.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map(
      (match) => match[1] ?? '',
    );
    expect(declared).toEqual([]);
  });
});

describe('the README contract table', () => {
  it('names exactly the tokens a consumer has to define', () => {
    /*
     * The tripwire.
     *
     * Both sides are read from the files, so the table cannot be right today
     * and wrong after the next component. A token added to the CSS without a
     * fallback and left out of the table ships a rule that resolves to
     * nothing. A token in the table the CSS no longer reads asks a consumer
     * for a colour that is never drawn.
     */
    expect([...reads.required].sort()).toEqual(documented());
  });

  it('leaves out the tokens the CSS defaults for itself', () => {
    // README.md says these have structural fallbacks. Listing one as required
    // would make a consumer supply a value the CSS already carries.
    for (const token of reads.optional) {
      expect(documented(), token).not.toContain(token);
    }
  });

  it('reads no token both with and without a fallback', () => {
    // A fallback in one rule and none in another is a fallback that lies. The
    // consumer who trusts it gets a styled control in one place and an
    // unstyled one in the next.
    expect([...reads.required].filter((token) => reads.optional.has(token))).toEqual([]);
  });
});

describe('the exported components', () => {
  const modules = exportedModules();
  /*
   * Both sources of a shipped rule. `structural.css` is the stylesheet a
   * consumer links; a component that carries its own rules injects them at
   * first render instead. A class styled by either arrives at the consumer,
   * and a class styled by neither does not.
   */
  const shipped = `${structural}\n${componentStyles()}`;
  const styled = styledClasses(shipped);

  it('are all reachable from the package entry point', () => {
    // The floor. Everything below iterates this list, so a walk that found
    // nothing would report a clean contract over no components at all. That is
    // the shape of both false passes this repository has shipped.
    expect(modules.length).toBeGreaterThan(1);
    expect(modules.map(([name]) => name)).toContain('components/TabBar');
  });

  it('write every class through an expression the reader can evaluate', () => {
    /*
     * The tripwire under the two below, and the one this suite was missing.
     *
     * Both comparisons are over what `renderedClasses` returned, so an
     * extraction that quietly saw fewer classes reported a clean stylesheet. It
     * did: the text matcher read `className="…"` and a template literal only,
     * and `.btn*` and `.dialog*` shipped with no rule while this file passed.
     *
     * An expression the reader has no case for is named here rather than
     * dropped, so the next form is a failure with a line number instead of a
     * silently shorter list. `overlay.tsx` holds one today —
     * `` `card__status--${status.state}` `` — and it is not an exported module.
     */
    const scans = modules.map(([name, source]) => [name, scanClassNames(source)] as const);

    // The floor, and the scope. A walk that read no attribute at all would
    // report every expression recognised by recognising none of them.
    const attributes = scans.reduce((total, [, scan]) => total + scan.attributes, 0);
    expect(attributes).toBeGreaterThan(60);

    expect(
      scans.flatMap(([name, scan]) => scan.unrecognised.map((entry) => `${name}: ${entry}`)),
    ).toEqual([]);

    /*
     * What the reader declined, stated rather than left out.
     *
     * A prop with an open type is a class the caller names, so the reader
     * cannot compute it and the package owes no rule for it. That is a
     * narrowing, and `npm run verify:docs` is the precedent for printing one:
     * an answer a check could not compute must not read as one it did.
     *
     * Written out per module, because the harm is a class leaving view. A
     * component that swapped `className="tab"` for a prop would drop the class
     * from both comparisons below and report clean, which is this defect again.
     */
    const opaque = scans
      .filter(([, scan]) => scan.opaque.length > 0)
      .map(([name, scan]) => `${name}: ${scan.opaque.length}`)
      .sort();

    expect(opaque).toEqual([
      'components/Canvas: 1',
      'components/controls/Button: 1',
      'components/controls/Overlays: 2',
      'components/controls/Tile: 1',
    ]);
  });

  it('render only classes structural.css writes a rule for', () => {
    /*
     * The second tripwire.
     *
     * A component may be styled twice: by `shell.css`, which is the reference
     * application's, and by `structural.css`, which is the package's. Only the
     * second ships. A class added to an exported component and styled in
     * `shell.css` alone looks correct in this repository and arrives at a
     * consumer with no rule at all.
     *
     * Found `nav__break`, added to the exported `NavRail` and styled only in
     * `shell.css`, and `icon-button--danger`, which had never been in the
     * package stylesheet.
     *
     * `styledClasses` reads the parsed selectors. It used to match `.name`
     * anywhere in the text, so a class surviving in a comment counted. Issue
     * #118.
     *
     * Widening the reader to see a joined class array found one more:
     * `btn--default`, which no stylesheet has ever written a rule for. `Button`
     * leaves the modifier off that variant now, because the default variant is
     * the base `.btn`.
     */
    // The floor. A parse that returned nothing would report every class
    // rendered as styled by finding none of them missing.
    expect(styled.size).toBeGreaterThan(30);

    const missing = modules
      .flatMap(([name, source]) =>
        renderedClasses(source)
          .filter((className) => !styled.has(className))
          .map((className) => `${name}: ${className}`),
      )
      .sort();

    expect(missing).toEqual([]);
  });

  it('carry every base rule the reference stylesheets give them', () => {
    /*
     * The third tripwire, and the one a mention cannot satisfy.
     *
     * A class keeps its name in `structural.css` for as long as one selector
     * anywhere still writes it, so the test above passes while the rule that
     * lays the element out is gone. Renaming `.sb-shell .tab__emphasis` and
     * leaving the two `[data-emphasis]` descendants alone strips the marker of
     * `position: absolute` and shifts the whole tab, and nothing said so.
     * Issue #118.
     *
     * `REFERENCE` is the comparison rather than a list of classes, for the
     * reason `scripts/shell-variables.mjs` gives about the `--shell-*` contract:
     * a hand-written list drifts, and these two are already maintained by the
     * application the screenshots are taken of. A class the reference styles on
     * its own and the package styles only in a descendant or a state is a rule
     * a consumer never gets.
     */
    const referenceBase = baseStyledClasses(reference(), '');
    const packageBase = baseStyledClasses(structural, SHELL_ROOT);
    const rendered = [...new Set(modules.flatMap(([, source]) => renderedClasses(source)))].sort();

    // The floors, one per set. Any of the three coming back empty satisfies the
    // comparison below by comparing nothing.
    expect(referenceBase.size).toBeGreaterThan(20);
    expect(packageBase.size).toBeGreaterThan(20);
    expect(rendered.length).toBeGreaterThan(20);

    expect(
      rendered.filter((className) => referenceBase.has(className) && !packageBase.has(className)),
    ).toEqual([]);
  });
});

/**
 * What each shared rule declares, which a class name cannot say.
 *
 * The three tripwires above compare class names. `styledClasses` and
 * `baseStyledClasses` parse selectors and return names, and no rule body is
 * ever read, so they report a class as styled by a rule whose whole body is
 * gone. Deleting `display`, `flex-direction`, `min-width`, `min-height` and
 * `background` from `.sb-shell .panel` — the three-panel container, which is
 * the shell's entire layout — left the suite at 1067 passing.
 *
 * The consequence was not hypothetical either. `structural.css` and the two
 * reference stylesheets are a hand-maintained mirror, and 20 shared selectors
 * had already drifted: a consumer's primary button did not change colour on
 * hover, a long tab title widened its tab instead of truncating, and the
 * status dot lost the halo that makes 7px read as live.
 */
describe('the mirror between the package stylesheet and the reference', () => {
  const mirror = mirroredRules(reference(), structural, SHELL_ROOT);

  /**
   * A property the package rule deliberately does not carry, and why.
   *
   * On the `PENDING` pattern in `tests/check-scope.test.ts`: each one is named,
   * each carries its reason, and the list may only shrink. An entry that has
   * stopped being true fails below, because an exemption nobody revisits is how
   * the exemption becomes the rule.
   *
   * Keyed by `<selector> <property>`, on the normalised selector — the package
   * one with `.sb-shell` stripped, which is the reference one.
   */
  const DELIBERATE = new Map([
    ['.panel--drawer background', '`.panel` already paints it, and a drawer is always a panel'],
    ['.switch font-size', '`font: inherit` here is the shorthand that carries font-size'],
    ['.tab flex', '`flex: 0 1 auto` in the reference is the initial value, written to record it'],
    ['.tab:focus-visible background', 'the package ships one focus ring for twelve selectors'],
    ['.tab:focus-visible color', 'the same shared ring'],
    ['.tab:focus-visible border-radius', 'restated by the reference; `.tab` already sets it'],
  ]);

  const drift = mirror.drift.flatMap(({ selector, missing }) =>
    missing.map((property) => `${selector} ${property}`),
  );

  it(`is measured over what both sides declare [${String(mirror.selectors)} selectors, ${String(
    mirror.properties,
  )} properties, ${String(mirror.unmatchedReference)} reference-only and ${String(
    mirror.unmatchedPackage,
  )} package-only selectors declined]`, () => {
    /*
     * The floors, and the scope this file reports.
     *
     * A normalisation that stopped matching — the root stripped wrongly, a
     * combinator spaced differently, a quote style — leaves the comparison
     * below over an empty intersection, which reports a perfect mirror by
     * comparing nothing. That is this repository's recurring defect, and it is
     * the one a selector-keyed comparison is most exposed to.
     *
     * The two declined counts are stated rather than left out, the way
     * `npm run verify:docs` prints the paths it declined. A selector on one
     * side only is not judged here at all: the reference styles this
     * application's own furniture, and the package styles elements the
     * reference has no equivalent for.
     */
    expect(mirror.selectors).toBeGreaterThan(100);
    expect(mirror.properties).toBeGreaterThan(400);
  });

  it('leaves no shared rule short of a property the reference declares', () => {
    /*
     * Names, never values. The reference carries a palette — `var(--accent)`,
     * literal colours — and `structural.css` reads `--shell-*` from its host.
     * That difference is the whole design of the package, so a comparison of
     * values would fail on every shared rule and be deleted inside a week. A
     * name is what says whether the rule does anything at all.
     */
    expect(drift.filter((entry) => !DELIBERATE.has(entry))).toEqual([]);
  });

  it('carries no deliberate omission the package stylesheet has since closed', () => {
    // The list may only shrink. A property added to `structural.css` and left
    // named here is an exemption standing over a rule that no longer needs one.
    expect([...DELIBERATE.keys()].filter((entry) => !drift.includes(entry))).toEqual([]);
  });
});
