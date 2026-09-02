import { useInsertionEffect } from 'react';

/**
 * A component's rules, carried by the component.
 *
 * `structural.css` is a hand-maintained copy of rules authored in
 * `controls.css`, and `tests/package-styles.test.ts` exists to catch the copy
 * drifting — its header records twenty selectors that already had, including a
 * primary button that stopped changing colour on hover. The copy exists because
 * a component and its rules live in different files with different namespaces,
 * so exporting one does not ship the other.
 *
 * A component that carries its own rules has nothing to copy. Exporting it and
 * shipping its styles become the same act, which is the property the mirror was
 * imitating.
 *
 * What may appear in one of these strings is rules. Values belong to the token
 * layer: `structure.css` ships the structural ramp with values and `README.md`
 * holds the palette a consumer defines, so a literal here is a design decision
 * made somewhere no theme can reach it. `tests/component-styles.test.ts`
 * enforces that.
 */

/**
 * `useInsertionEffect` rather than `useEffect`.
 *
 * React runs it before layout effects and before the browser next reads
 * layout, which is the window a stylesheet has to land in. Injecting from
 * `useEffect` means a first paint against no rules, and any component that
 * measures itself in a layout effect measures the unstyled box.
 *
 * Every call for an id after the first is a no-op, so ten cards inject once.
 * Nothing is ever removed: a remount would otherwise repaint unstyled, and the
 * cost of keeping it is one `<style>` element per component the application
 * has ever rendered.
 */
const injected = new Set<string>();

/** Marks the element, and is what a second call looks for. */
const ATTRIBUTE = 'data-shell-styles';

export function useComponentStyles(id: string, css: string): void {
  useInsertionEffect(() => {
    if (injected.has(id)) return;
    // `document` can be absent — a render under plain node, or a test that
    // exercises the props without a DOM. Rules are decoration; refusing to
    // render without them would be worse than rendering without them.
    if (typeof document === 'undefined') return;

    injected.add(id);
    // A document that already carries the rules — a second renderer sharing
    // one document, or a consumer who inlined the published stylesheet.
    if (document.querySelector(`style[${ATTRIBUTE}="${id}"]`) !== null) return;

    const element = document.createElement('style');
    element.setAttribute(ATTRIBUTE, id);
    element.textContent = css;
    document.head.append(element);
  }, [id, css]);
}
