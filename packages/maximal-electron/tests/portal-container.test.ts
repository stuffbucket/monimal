import { describe, expect, it } from 'vitest';

import { shellPortalRoot } from '../src/renderer/components/controls/Overlays.js';
import { exportedModules } from './stylesheets.js';

/**
 * Where a portalled subtree lands.
 *
 * `structural.css` is the only stylesheet the package ships, and every selector
 * in it is scoped under `.sb-shell`. A Radix portal with no `container`
 * resolves to `document.body`, which is outside that element, so the modal, the
 * scrim, the menu and the tooltip arrive at a consumer with no rule at all.
 *
 * Neither existing check can see it. `tests/package-styles.test.ts` asks
 * whether a rendered class has a rule, and `.menu` has one.
 * `tests/package-exports.test.ts` asks whether every selector is scoped, and
 * every selector is. In this repository both components look right because
 * `shell.css` and `controls.css` are unscoped and match a portalled element
 * happily.
 *
 * Three layers, because no one of them reaches the whole property.
 *
 * - The scan below reads source text. It is the only layer whose scope is the
 *   whole export graph, so a portal added to a component nobody wrote a test
 *   for is still caught. That is the shape this defect had: three portals, none
 *   of them containered.
 * - `shellPortalRoot` is executed, against the smallest document it touches, so
 *   the class it puts on the element it creates is measured rather than
 *   matched. The Vitest environment here is `node` and neither `jsdom` nor
 *   `happy-dom` is installed, which is why the document is a stub.
 * - `ShellLayout.stories.tsx` asserts in a real browser that the container each
 *   portal names is the element the shell class sits on, for both the composed
 *   and the standalone case. Nothing here can see that, and `storybook:check`
 *   does not run in CI, so it is the layer a reviewer runs by hand.
 */

/** The class every rule the package ships sits under. */
const SHELL_ROOT = 'sb-shell';

/**
 * The floor on portals found. Three ship today: the dialog, the menu, and the
 * tooltip inside `IconButton`. A parser that stopped matching would report
 * every portal as containered by finding none of them.
 */
const PORTALS = 3;

/**
 * Every `<Something.Portal …>` opening tag in a source file, as the module
 * name and the props text.
 *
 * The props are read to the closing angle bracket at brace depth zero, so a
 * prop holding an arrow function or a generic does not cut the tag short.
 */
function portals(name: string, source: string): { where: string; props: string }[] {
  const found: { where: string; props: string }[] = [];

  for (const match of source.matchAll(/<([A-Za-z][\w]*\.Portal)\b/g)) {
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;
    while (end < source.length) {
      const character = source[end];
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth === 0) break;
      end += 1;
    }
    found.push({ where: `${name}: ${match[1] ?? ''}`, props: source.slice(start, end) });
  }

  return found;
}

interface StubElement {
  className: string;
  attributes: Map<string, string>;
  setAttribute: (name: string, value: string) => void;
}

/**
 * The smallest document `shellPortalRoot` touches, and nothing else.
 *
 * `querySelector` throws on anything but the one attribute selector, so a
 * lookup that changed shape reports itself rather than returning null and
 * letting the function pass by creating a second element.
 */
function stubDocument(): { document: Document; appended: StubElement[] } {
  const appended: StubElement[] = [];

  const target = {
    createElement: (): StubElement => {
      const attributes = new Map<string, string>();
      return {
        className: '',
        attributes,
        setAttribute: (name: string, value: string) => void attributes.set(name, value),
      };
    },
    querySelector: (selector: string): StubElement | null => {
      const attribute = /^\[([\w-]+)]$/.exec(selector)?.[1];
      if (attribute === undefined) {
        throw new Error(`the stub answers one attribute selector, not ${selector}`);
      }
      return appended.find((element) => element.attributes.has(attribute)) ?? null;
    },
    body: { append: (element: StubElement) => void appended.push(element) },
  };

  return { document: target as unknown as Document, appended };
}

describe('a portalled subtree', () => {
  const modules = exportedModules();
  const found = modules.flatMap(([name, source]) => portals(name, source));
  const overlays = modules.find(([name]) => name === 'components/controls/Overlays')?.[1] ?? '';

  it(`is scanned across the export tree [${String(modules.length)} modules, ${String(
    found.length,
  )} portals]`, () => {
    // The floor under the walk, and the count this file reports. Everything
    // below iterates one of these two lists, so a walk or a scanner that found
    // nothing would report a clean contract over no components at all.
    expect(modules.length).toBeGreaterThan(1);
    expect(overlays.length).toBeGreaterThan(0);
    expect(found.length).toBeGreaterThanOrEqual(PORTALS);
  });

  it('names a container on every portal an exported component renders', () => {
    expect(
      found.filter(({ props }) => !/\bcontainer=\{/.test(props)).map(({ where }) => where),
    ).toEqual([]);
  });

  it('resolves that container from the shell root rather than naming one', () => {
    // A `container={document.body}` satisfies the test above and ships the
    // defect. The expression has to be a binding the module took from the
    // provider `ShellLayout` sets, so a member expression or a call is not one.
    const wrong = found.filter(({ where, props }) => {
      const name = /\bcontainer=\{([A-Za-z_$][\w$]*)\}/.exec(props)?.[1];
      if (name === undefined) return true;
      const source = modules.find(([module]) => where.startsWith(`${module}: `))?.[1] ?? '';
      return !new RegExp(`\\b${name}\\s*=\\s*useShellPortalContainer\\(\\)`).test(source);
    });

    expect(wrong.map(({ where }) => where)).toEqual([]);
  });

  it('has a provider on the element the shell class sits on', () => {
    // One element carries `.sb-shell`, and the provider has to be the same
    // component, or a portal resolves to a container that is not the root the
    // stylesheet is scoped to.
    const roots = modules.filter(([, source]) =>
      new RegExp(`className="${SHELL_ROOT}[\\s"]`).test(source),
    );

    expect(roots.map(([name]) => name)).toEqual(['components/ShellLayout']);
    expect(
      roots.filter(([, source]) => !source.includes('<ShellPortalRoot')).map(([name]) => name),
    ).toEqual([]);
  });

  it('builds a shell root of its own when there is no shell around it', () => {
    /*
     * The Radix default is not merely unstyled. A standalone `Dialog` on
     * `document.body` computed `position: static`, `width 1280px`, transparent,
     * over a scrim that painted nothing, while Radix kept the focus trap — 12
     * tabs never left the dialog — and set `aria-hidden` on the consumer's
     * whole application. Modal behaviour, the appearance of a paragraph.
     *
     * So the fallback is an element carrying the same class `ShellLayout`
     * renders, and the class is read off the element rather than off the source.
     */
    const { document, appended } = stubDocument();

    const created = shellPortalRoot(document);
    expect(appended).toEqual([created]);
    expect(created.className).toBe(SHELL_ROOT);

    // Idempotent, or a consumer's document grows one element per render.
    expect(shellPortalRoot(document)).toBe(created);
    expect(appended).toHaveLength(1);
  });

  it('never resolves a portal container to the Radix default', () => {
    // `?? undefined` was the previous fallback, and `document.body` is what
    // Radix reads it as. Neither may come back. Matched where a value is
    // produced, so the prose above `shellPortalRoot` may keep naming it.
    expect(overlays).toMatch(/useContext\(\w+\)/);
    expect(overlays).toMatch(/shellPortalRoot\(document\)/);
    expect(overlays).not.toMatch(/(?:\?\?|[=:])\s*document\.body\b/);
    expect(overlays).not.toMatch(/\buseContext\(\w+\)\s*\?\?\s*undefined/);
    expect(
      found.filter(({ props }) => /document\.body|undefined/.test(props)).map(({ where }) => where),
    ).toEqual([]);
  });
});
