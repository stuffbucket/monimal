---
name: verify-ui
description: Prove a user interface change actually renders, not just that tests pass
---

# Verify a user interface change

Ported from `stuffbucket/maximal`'s `ui-layout-verification` skill. Use it for
any change under `src/renderer/**`.

## Why this exists

Unit tests here run without a layout engine. They build a DOM tree and never
compute flex, grid, gap, or the box model. So "is there really 16 pixels
between these cards?" is unanswerable there, and a CSS selector that matches
nothing fails silently.

Two regression classes come from this, and both shipped past green suites in
maximal:

1. **A lost gap.** Content moved into a new component lost the parent rule that
   only spaced direct children.
2. **A dropped hook.** A rewrite omitted the attribute the CSS keyed on, so the
   rule matched nothing. The class name was still there, so every class-name
   assertion still passed.

This repository has already produced a third: card name and subtitle were
inline spans, so they rendered as `Design systemEdited 1 day ago` on one line.
The DOM was correct. Only computed layout caught it.

## The workflow

1. Build the bundles the harness drives.

   ```bash
   npm run package
   ```

2. Run the suite.

   ```bash
   npm run test:e2e
   ```

3. **Look at the screenshot.** It is written to `test-results/shell.png`. Open
   it. A passing assertion does not mean the result looks right.

4. Encode what you just checked as an assertion, so the regression cannot come
   back. Add it to `e2e/shell.spec.ts`.

## How to write the assertion

Read computed style or a bounding box. Do not assert on class names.

```ts
// Good: the engine resolved the token.
const gap = await window
  .locator('[data-testid="view-grid"]')
  .evaluate((node) => getComputedStyle(node).rowGap);
expect(gap).toBe('12px');

// Good: two elements really are on separate lines.
expect(subBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);

// Useless: this passes even when the stylesheet never loaded.
await expect(window.locator('.grid')).toHaveClass(/grid/);
```

## Determinism

The harness already forces reduced motion and disables animation. Keep it that
way. A measured width that races a transition produces a test that fails one
run in ten, which is worse than no test.

Sample data in `src/renderer/lib/data.ts` is deterministic on purpose. Do not
introduce randomness or wall-clock time there.

## Definition of done

- [ ] `npm run typecheck` and `npm run lint` pass.
- [ ] `npm test` passes.
- [ ] `npm run test:e2e` passes.
- [ ] You opened `test-results/shell.png` and looked at it.
- [ ] The invariant you checked by hand is now an assertion.
