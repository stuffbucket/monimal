import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportedModules } from './stylesheets.js';

/**
 * Every component a consumer can import has a story.
 *
 * The renderer entry point went from about nineteen exported names to
 * forty-three. Twenty-four crossed into the public API, Storybook did not
 * change, and nothing said so. A component with no story is one nobody has
 * seen in every state, and `npm run storybook:check` never renders it, never
 * runs a `play` function over it, and never puts axe on it.
 *
 * The set is walked from `src/renderer/index.ts` rather than listed, for the
 * reason `scripts/verify-exports.mjs` gives about its own hand-written list: a
 * list does not grow when the export does. `exportedModules` in
 * `tests/stylesheets.ts` already makes that walk, without a build.
 */

const RENDERER = new URL('../src/renderer/', import.meta.url);

/**
 * Components exported without a story, and the issue that would write one.
 *
 * Empty, and it stays that way: the list may only shrink. Issue #180 emptied
 * it — `Canvas`, `ShellLayout`, `TerminalTabs` and `TerminalView` were the last
 * four, and the terminal pair needed a fake `TerminalTransport` rather than a
 * new exemption.
 */
const PENDING = new Map<string, string>();

/**
 * Every component module the entry point reaches.
 *
 * A `.tsx` file is the component; a `.ts` beside it is a barrel or a helper,
 * and neither is a thing to render. The extension is the toolchain's own
 * distinction, so it does not need maintaining.
 */
function componentModules(): string[] {
  return exportedModules()
    .map(([base]) => base)
    .filter((base) => existsSync(new URL(`${base}.tsx`, RENDERER)))
    .sort();
}

/** The `*.stories.tsx` files sitting in the same directory as a module. */
function siblingStories(base: string): string[] {
  const directory = new URL(`${path.posix.dirname(base)}/`, RENDERER);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.stories.tsx'))
    .map((name) => readFileSync(new URL(name, directory), 'utf8'));
}

/**
 * Whether a story file imports the module beside it.
 *
 * A file named `Canvas.stories.tsx` proves nothing on its own: the name is a
 * convention and the import is the dependency. The emitter wants a `.js`
 * suffix on a relative import, so that is what the source carries.
 */
function imports(source: string, base: string): boolean {
  const name = path.posix.basename(base);
  return new RegExp(`from\\s*'\\./${name}(\\.jsx?|\\.tsx?)?'`).test(source);
}

describe('every exported component has a story', () => {
  const modules = componentModules();
  const covered = modules.filter((base) =>
    siblingStories(base).some((source) => imports(source, base)),
  );

  it(`walks the export tree, so an empty scan cannot pass [${String(
    modules.length,
  )} component modules, ${String(covered.length)} with a story]`, () => {
    // The floor, and the count this test reports. A walk that found nothing
    // would report a fully covered public surface by examining none of it,
    // which is the defect `.claude/skills/write-a-check/SKILL.md` catalogues.
    expect(modules.length).toBeGreaterThan(PENDING.size);
    // A named member, so a walk that returns unrelated files still fails.
    expect(modules).toContain('components/TabBar');
  });

  it('has a sibling story importing each one', () => {
    const missing = modules.filter(
      (base) => !covered.includes(base) && !PENDING.has(base),
    );

    expect(missing).toEqual([]);
  });

  it(`carries no entry for a component that now has one [${String(
    PENDING.size,
  )} exempt]`, () => {
    // The list may only shrink. An entry that has stopped being true is how an
    // exemption becomes the rule, which is what `tests/check-scope.test.ts`
    // guards its own `PENDING` against. The count is in the name because the
    // loop below examines nothing when the list is empty, and a silent pass
    // over an empty set reads the same as a pass over a full one.
    for (const base of PENDING.keys()) {
      expect(modules, base).toContain(base);
      expect(covered, base).not.toContain(base);
    }
  });

  it(`gives every entry an issue number [${String(PENDING.size)} exempt]`, () => {
    for (const [base, issue] of PENDING) expect(issue, base).toMatch(/^#\d+$/);
  });
});
