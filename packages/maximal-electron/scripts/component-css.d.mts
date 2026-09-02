/**
 * Types for `component-css.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately. This one
 * is loaded from two places that are both outside it — a flat ESLint config
 * and a Vitest test — so the declarations are what keep the two callers
 * agreeing about the shape.
 */

/** One thing wrong with a carried stylesheet, and where in it. */
export interface ComponentCssFinding {
  /** Which check reported it; a key of `COMPONENT_CSS_MESSAGES`. */
  id: string;
  /** Offset into the string that was analysed. */
  index: number;
  /** How many characters the finding covers. */
  length: number;
  /** The offending text, for a message that names it. */
  text: string;
  /** The placeholders the message interpolates. */
  data: Record<string, string>;
}

/** The contract a carried stylesheet is judged against. */
export interface ComponentCssContract {
  /** Every `--shell-*` the shipped stylesheets read or declare. */
  published: ReadonlySet<string>;
}

/** The prefix a custom property this package writes must carry. */
export declare const SHELL_NAMESPACE: string;
/** What each finding means, in the words the reporter uses. */
export declare const COMPONENT_CSS_MESSAGES: Record<string, string>;
/** The text with every comment blanked, offsets intact. */
export declare function withoutComments(css: string): string;
/** Every custom property the text declares a value for. */
export declare function declaredTokens(css: string): string[];
/** Every custom property the text reads through `var()`. */
export declare function readTokens(css: string): string[];
/** Everything wrong with one carried stylesheet. */
export declare function componentCssFindings(
  css: string,
  contract: ComponentCssContract,
): ComponentCssFinding[];
