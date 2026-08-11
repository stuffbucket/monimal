/**
 * Every assertion reports how many things it examined, and zero fails.
 *
 * Seven checks in this repository have passed while examining an empty set,
 * and one of them shipped a broken terminal in `v0.0.2`. The logic was right
 * every time. The collection under it was empty, and a bare `ok` line cannot
 * carry that.
 *
 * So a scope is not optional here: `check` throws without one. A convention
 * only binds the author who remembers it, and the record says nobody does.
 *
 * `of` is a noun the caller chooses, because the sets differ. A file scan
 * counts files, a selector parser counts selectors, a package check counts
 * targets. One abstraction over all three would fit none of them.
 *
 * See `.claude/skills/write-a-check/SKILL.md`.
 */

/** How many things an assertion ran over, and what they were. */
function describe(scope) {
  if (typeof scope !== 'object' || scope === null) {
    throw new TypeError('a check needs a scope: { count, of }');
  }
  const { count, of: noun } = scope;
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError(`scope.count must be a whole number, got ${String(count)}`);
  }
  if (typeof noun !== 'string' || noun.trim() === '') {
    throw new TypeError('scope.of must name what was counted');
  }
  return `${String(count)} ${noun}`;
}

/**
 * A run of scoped assertions.
 *
 * `log` and `fail` are injected so the unit tests read the output rather than
 * the internals. A check whose reporting is untested is the same defect one
 * level up.
 */
export function scopedChecks({ log = console.log, fail = console.error } = {}) {
  const results = [];

  /**
   * Assert something, over a set whose size is stated.
   *
   * An empty set fails whatever `ok` says, and says so in its own words, so
   * the output tells "this was wrong" apart from "there was nothing to look
   * at".
   */
  const check = (ok, message, scope) => {
    const described = describe(scope);
    const empty = scope.count === 0;
    const passed = ok === true && !empty;
    results.push({ passed, message, count: scope.count, of: scope.of });

    const label = passed ? '  ok  ' : ' FAIL ';
    const note = empty ? `nothing to check: ${described}` : described;
    (passed ? log : fail)(`${label} ${message}  [${note}]`);
    return passed;
  };

  return {
    check,

    /**
     * Print the totals and return an exit code.
     *
     * The totals are the scope of the run itself. A script that asserts
     * nothing at all is the empty-set defect wearing a different hat, so it
     * fails here rather than exiting 0 in silence.
     */
    summary: (subject) => {
      const failed = results.filter((result) => !result.passed);
      const examined = results.reduce((total, result) => total + result.count, 0);

      if (results.length === 0) {
        fail(`\n FAIL  ${subject}: no assertions ran`);
        return 1;
      }

      const line =
        `${String(results.length)} assertion(s) over ${String(examined)} things` +
        `, ${String(failed.length)} failed`;

      if (failed.length > 0) {
        fail(`\n${subject}: ${line}`);
        return 1;
      }
      log(`\n${subject}: ${line}`);
      return 0;
    },
  };
}
