/**
 * Types for `css-selectors.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/** A selector, and whether a conditional at-rule encloses the rule it opens. */
export interface SelectorRule {
  selector: string;
  conditional: boolean;
}

/** A style rule: one selector, the at-rules around it, and what it declares. */
export interface StyleRule {
  selector: string;
  /** The conditional at-rule preludes enclosing it, outermost first. */
  conditions: string[];
  /** The property names its body sets, in source order and with repeats. */
  properties: string[];
}

/** Every style rule in a stylesheet, one per selector in a selector list. */
export declare function styleRules(css: string): StyleRule[];
/** Every property name a declaration body sets. */
export declare function declaredProperties(body: string): string[];
/** Every selector in a stylesheet, with the conditions around each. */
export declare function selectorRules(css: string): SelectorRule[];
/** Every individual selector in a stylesheet, in source order. */
export declare function selectors(css: string): string[];
/** Every class a stylesheet writes a rule for. */
export declare function styledClassNames(css: string): string[];
/** Every class a stylesheet styles under `root` and under nothing else. */
export declare function baseStyledClassNames(css: string, root: string): string[];
/** Whether a selector is confined to a root class. */
export declare function isScoped(selector: string, root: string): boolean;
/** Every selector in a stylesheet that escapes the root class. */
export declare function unscopedSelectors(css: string, root: string): string[];
