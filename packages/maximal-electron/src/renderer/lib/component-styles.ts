import { useContext, useInsertionEffect } from 'react';

import { ShellRoot } from './shell-root.js';

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
 * made somewhere no theme can reach it. `scripts/component-css.mjs` is that
 * judgement, delivered twice — by `eslint/shell-styles.mjs` at the character
 * as it is typed, and by `tests/component-styles.test.ts` over every carried
 * string at once.
 */

/**
 * The layer these rules land in, and why they land in one at all.
 *
 * Without a layer, a consumer cannot override anything here. Every rule is
 * `.sb-shell .thing`, and a consumer writing `.sb-shell .thing` matches it
 * exactly: equal specificity, so source order decides, and these arrive by
 * `document.head.append` during the first render — after any stylesheet the
 * consumer linked. They would lose every time. The same is true of the tokens
 * a component declares for its own geometry, which `docs/shell-variables.md`
 * described as overridable when they were not.
 *
 * A cascade layer inverts that: an unlayered rule beats a layered one whatever
 * its specificity, so a consumer's plain `.sb-shell .thing` wins without
 * `!important` and without this package policing how many classes it chains.
 * Radix Themes retrofitted exactly this after shipping two-class selectors
 * that outranked their consumers' utilities.
 *
 * `base` is the shipped stylesheet and `components` is what a component
 * carries, in that order, so a carried rule still wins over the sheet the way
 * it does today. Both sit under one name so a consumer can place the whole
 * package with a single `@layer` statement of their own.
 */
export const SHELL_STYLE_LAYERS = 'sb-shell.base, sb-shell.components';

/** The layer a carried stylesheet is wrapped in. */
export const SHELL_COMPONENT_LAYER = 'sb-shell.components';

/** Marks the element, and is what a second call looks for. */
const ATTRIBUTE = 'data-shell-styles';

/**
 * The id of the element that fixes layer order.
 *
 * Layer order is decided by first appearance, and a carried stylesheet appears
 * whenever its component first renders. Without this statement the order would
 * depend on which surface a consumer happened to open first.
 */
const ORDER_ID = 'layer-order';

/**
 * Puts one carried stylesheet into a document, and keeps it current.
 *
 * Keyed on an attribute in the target document rather than on a module
 * variable, which is the rule `shellPortalRoot` already follows here and for
 * the same two reasons: a document served by two copies of this module gets
 * one element, and a second window gets its own. The predecessor held a module
 * `Set` and consulted it first, which made the check against the document
 * unreachable — so a popped-out window rendered every carried rule unstyled
 * while the registry reported the id as injected.
 *
 * Exported so it can be executed by a test. The Vitest environment here is
 * `node`, with neither jsdom nor happy-dom installed, so the hook itself
 * cannot be rendered; `tests/component-styles.test.ts` drives this against a
 * stub document instead, which is the arrangement `tests/portal-container.
 * test.ts` uses for the same reason.
 */
export function injectComponentStyles(target: Document, id: string, css: string): void {
  const head = target.head;

  if (head.querySelector(`style[${ATTRIBUTE}="${ORDER_ID}"]`) === null) {
    const order = target.createElement('style');
    order.setAttribute(ATTRIBUTE, ORDER_ID);
    order.textContent = `@layer ${SHELL_STYLE_LAYERS};`;
    head.prepend(order);
  }

  const text = `@layer ${SHELL_COMPONENT_LAYER} {\n${css}\n}\n`;
  const found = head.querySelector(`style[${ATTRIBUTE}="${id}"]`);

  if (found !== null) {
    // Rewritten rather than left alone. The two ids that reach here twice with
    // different text are a module replaced by the dev server and a component
    // whose rules depend on a prop; leaving the first render's text in place
    // makes an edit appear to do nothing until a reload.
    if (found.textContent !== text) found.textContent = text;
    return;
  }

  const element = target.createElement('style');
  element.setAttribute(ATTRIBUTE, id);
  element.textContent = text;
  head.append(element);
}

/**
 * `useInsertionEffect` rather than `useEffect`.
 *
 * React runs it before layout effects and before the browser next reads
 * layout, which is the window a stylesheet has to land in. Injecting from
 * `useEffect` means a first paint against no rules, and any component that
 * measures itself in a layout effect measures the unstyled box.
 *
 * Every call for an id after the first is a lookup and a no-op, so ten cards
 * inject once. Nothing is ever removed: a remount would otherwise repaint
 * unstyled, and the cost of keeping it is one `<style>` element per component
 * the application has ever rendered.
 *
 * The document comes from the shell root when there is one above this
 * component, so a surface rendered into a second window styles that window.
 * `document` is the fallback for a component with no `ShellLayout` above it,
 * and `undefined` for a render with no document at all — under plain node, or
 * in a test that exercises the props. Rules are decoration; refusing to render
 * without them would be worse than rendering without them.
 */
export function useComponentStyles(id: string, css: string): void {
  const root = useContext(ShellRoot);
  const target = root?.ownerDocument ?? (typeof document === 'undefined' ? undefined : document);

  useInsertionEffect(() => {
    if (target === undefined) return;
    injectComponentStyles(target, id, css);
  }, [target, id, css]);
}
