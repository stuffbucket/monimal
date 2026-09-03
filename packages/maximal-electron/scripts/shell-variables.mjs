/**
 * The `--shell-*` contract, derived from the stylesheets rather than declared.
 *
 * `structural.css` ships no palette. It reads custom properties the host
 * defines, and nothing published which ones, so `stuffbucket/maximal`
 * hand-maintained a guess and drifted seven variables behind. Issue #93, and
 * `docs/shell-variables.md` for the contract itself.
 *
 * A hand-written list would drift the same way, so nothing here holds one:
 * every name comes out of the CSS the package ships.
 *
 * Plain ESM in `scripts/` for the reason `terminal-package.mjs` gives — `dist/`
 * is ESM syntax in a package with no `"type": "module"`, and a consumer's check
 * runs under plain `node`. Everything is pure over its inputs, so the caller
 * supplies the stylesheet text.
 */

/**
 * @typedef {'required' | 'fallback' | 'structural' | 'runtime'} ShellVariableKind
 */

/**
 * @typedef {object} ShellStylesheet
 * @property {string} name
 * @property {string} css
 */

/**
 * @typedef {object} ShellVariableEntry
 * @property {string} name
 * @property {ShellVariableKind} kind
 */

/**
 * @typedef {object} ShellVariableInput
 * @property {readonly ShellStylesheet[]} stylesheets
 * @property {readonly string[]} runtimeProperties
 * @property {readonly ShellVariableEntry[]} published
 */

/**
 * @typedef {object} ShellVariableCheck
 * @property {string} name
 * @property {boolean} ok
 */

/** The prefix that marks a custom property as the host's to define. */
export const SHELL_NAMESPACE = '--shell-';

/**
 * The stylesheets this package ships, source path to published path.
 *
 * `copy-renderer-css.mjs` performs the copy from this list and
 * `tests/shell-variables.test.ts` checks it against the `exports` map, so a
 * stylesheet cannot reach one and be missed by the other.
 *
 * A function rather than a constant, because a constant is evaluated once at
 * import and a mutant inside it never reaches a test.
 */
export function packageStylesheets() {
  return [
    {
      /*
       * Concatenated in order. `structure.css` declares the structural tokens
       * and must precede the rules that read them, so a consumer who overrides
       * one still wins: a later declaration in the same file beats an earlier
       * one at equal specificity.
       */
      sources: ['src/renderer/styles/structure.css', 'src/renderer/styles/structural.css'],
      published: 'dist/renderer/styles.css',
    },
  ];
}

/**
 * Case-sensitive, because a custom property is. `var(--Shell-Text)` names a
 * different property, and matching it here would publish a name no rule reads.
 */
const READ = /var\(\s*(--shell-[a-z0-9-]+)\s*([,)])/g;

const sorted = (names) => [...names].sort();

/**
 * Every `--shell-*` a stylesheet reads, split by whether the read carries a
 * fallback. `var(--shell-x)` is the host's to define; `var(--shell-x, 8px)`
 * already has a value.
 */
export function shellVariablesIn(css) {
  const required = new Set();
  const fallback = new Set();

  for (const match of css.matchAll(READ)) {
    (match[2] === ',' ? fallback : required).add(match[1]);
  }

  return { required: sorted(required), fallback: sorted(fallback) };
}

/**
 * The whole contract: every variable the shipped stylesheets read, plus the
 * properties JavaScript resolves. `SHELL_TERMINAL_PROPERTIES` names three the
 * emulator reads at construction, and two of those appear in no rule.
 *
 * @param {Pick<ShellVariableInput, 'stylesheets' | 'runtimeProperties'>} input
 */
export function shellVariableContract(input) {
  const required = new Set();
  const fallback = new Set();
  const structural = new Set();

  for (const sheet of input.stylesheets) {
    const found = shellVariablesIn(sheet.css);
    for (const name of found.required) required.add(name);
    for (const name of found.fallback) fallback.add(name);
    for (const name of declaredIn(sheet.css)) structural.add(name);
  }

  // Read both ways, a variable is required: the rule with no fallback is the
  // one that renders nothing.
  for (const name of required) fallback.delete(name);

  /*
   * Declared beats read, whichever way it is read.
   *
   * A name a shipped stylesheet declares with a value is one a consumer never
   * has to supply, so reporting it as `required` sends them to define
   * something that already has an answer. `--shell-radius-large` is read bare
   * and declared in `structure.css`; before this it was published as
   * `required` and `README.md`'s table is the list of what a consumer must
   * define.
   */
  for (const name of structural) {
    required.delete(name);
    fallback.delete(name);
  }

  const runtime = new Set(input.runtimeProperties);
  for (const name of required) runtime.delete(name);
  for (const name of fallback) runtime.delete(name);
  for (const name of structural) runtime.delete(name);

  return {
    required: sorted(required),
    fallback: sorted(fallback),
    structural: sorted(structural),
    runtime: sorted(runtime),
  };
}

/**
 * Every `--shell-*` a stylesheet declares a value for.
 *
 * Anchored on the start of a declaration, so `var(--shell-x, …)` inside a
 * value is not mistaken for one. Issue #93 is the same reader in reverse.
 *
 * @param {string} css
 * @returns {string[]}
 */
function declaredIn(css) {
  return [...css.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:/gm)].map((match) => match[1] ?? '');
}

/** The whole contract as one list of name and kind, in name order. */
export function shellVariableEntries(input) {
  const contract = shellVariableContract(input);
  const kinds = new Map();

  for (const name of contract.required) kinds.set(name, 'required');
  for (const name of contract.fallback) kinds.set(name, 'fallback');
  for (const name of contract.structural) kinds.set(name, 'structural');
  for (const name of contract.runtime) kinds.set(name, 'runtime');

  return sorted(kinds.keys()).map((name) => ({ name, kind: kinds.get(name) }));
}

/**
 * The derived contract against a published one, in both directions.
 *
 * A variable added to a stylesheet and left unpublished fails, and so does a
 * published variable nothing reads. One direction alone is a ratchet: the list
 * grows and never sheds a name a consumer is still setting for nothing.
 *
 * @param {ShellVariableInput} input
 * @returns {ShellVariableCheck[]}
 */
export function shellVariableChecks(input) {
  const derived = new Map(shellVariableEntries(input).map((entry) => [entry.name, entry.kind]));
  const published = new Map(input.published.map((entry) => [entry.name, entry.kind]));

  /*
   * The floor. Point the parser at the wrong file, or let the pattern stop
   * matching, and both maps are empty — at which point every comparison below
   * holds and the run reports a published contract over nothing. That is the
   * shape of six false passes in this repository; #92 has the two most recent.
   *
   * `every` over an empty list is true, so each floor names its own length
   * first.
   */
  const checks = [
    { name: 'a stylesheet was read', ok: input.stylesheets.length > 0 },
    {
      name: 'every stylesheet has text',
      ok: input.stylesheets.length > 0 && input.stylesheets.every((sheet) => sheet.css.length > 0),
    },
    { name: 'the derived contract is not empty', ok: derived.size > 0 },
    {
      name: 'a variable is read with no fallback',
      ok: [...derived.values()].includes('required'),
    },
    {
      name: 'a variable is read with a fallback',
      ok: [...derived.values()].includes('fallback'),
    },
    { name: 'the published contract is not empty', ok: published.size > 0 },
  ];

  for (const [name, kind] of derived) {
    checks.push({ name: `${name} is published as ${kind}`, ok: published.get(name) === kind });
  }

  for (const name of published.keys()) {
    checks.push({ name: `${name} is read by this package`, ok: derived.has(name) });
  }

  return checks;
}

/** The names of the checks that did not hold. */
export function failedShellVariableChecks(checks) {
  return checks.filter((check) => !check.ok).map((check) => check.name);
}
