/**
 * The peer table in `README.md`, against what the code imports.
 *
 * The table tells a consumer which optional peers to install for the entry
 * point they use, and it is the first thing they read to decide. `README.md`
 * claimed it could not drift, and nothing read it: `scripts/verify-exports.mjs`
 * compared `peerDependencies` against the built import graph and never looked
 * at the prose. It was maintained by hand, and updated by hand in #114 by an
 * agent reading the sentence saying it could not need to be. Issue #121.
 *
 * Plain ESM in `scripts/` for the reason `scripts/shell-variables.mjs` gives:
 * `scripts/verify-exports.mjs` runs under plain `node`. Everything is pure over
 * its inputs, so the caller supplies the prose and the import graph.
 */

/**
 * @typedef {object} PeerTableCheck
 * @property {string} name
 * @property {boolean} ok
 * @property {string} detail What the two sides held, for a check that did not.
 */

/**
 * @typedef {object} PeerTableInput
 * @property {Map<string, string[]>} table
 * @property {Map<string, string[]>} reached
 * @property {readonly string[]} peers
 * @property {readonly {subpath: string, name: string}[]} exceptions
 */

/**
 * A peer a row names that no import reaches, and the row it belongs to.
 *
 * `react-dom` is the whole list, and the reason is in
 * `tests/package-exports.test.ts`: a React component does not import a
 * renderer, the consumer mounting these components needs one, and the table is
 * where they learn which. `peerTableChecks` asserts every name here is a
 * declared peer that no entry point imports, so a name that becomes reachable
 * has to leave rather than sit here excusing itself.
 */
export const PEER_TABLE_EXCEPTIONS = [{ subpath: './renderer', name: 'react-dom' }];

/** A two-cell row whose first cell is a single backticked token. */
const ROW = /^\|\s*`([^`|]+)`\s*\|([^|]*)\|\s*$/gm;

/** What a row's second cell says for an entry point that needs no peer. */
const NO_PEERS = 'none';

/**
 * The rows of the peer table, as export subpath to the peers the row names.
 *
 * Rows are recognised by the package name in the first cell, so the table for
 * `--shell-*` and the table of icon file names are passed over, and so is the
 * whole table if the package is renamed and the prose is not. #120 renamed this
 * package, and a parse that quietly returned nothing would have reported a
 * clean table over no rows at all.
 *
 * A peer is a backticked name in the second cell. `none` carries none, and so
 * does a cell that names a package without the backticks — which
 * `peerTableChecks` then fails, because the import graph reaches one.
 *
 * @param {string} readme
 * @param {string} packageName
 * @returns {Map<string, string[]>}
 */
export function peerTable(readme, packageName) {
  /** @type {Map<string, string[]>} */
  const rows = new Map();

  for (const match of readme.matchAll(ROW)) {
    const entry = match[1];
    if (entry !== packageName && !entry.startsWith(`${packageName}/`)) continue;

    const peers = [...match[2].matchAll(/`([^`]+)`/g)].map((peer) => peer[1]).sort();
    rows.set(`.${entry.slice(packageName.length)}`, peers);
  }

  return rows;
}

/** The peers a row is expected to name: what the entry imports, plus the exceptions. */
function expected(subpath, imports, exceptions) {
  const names = new Set(imports);
  for (const exception of exceptions) {
    if (exception.subpath === subpath) names.add(exception.name);
  }
  return [...names].sort();
}

/**
 * The table against the import graph, in both directions.
 *
 * A peer the table omits fails, and so does a peer the table invents. One
 * direction alone is a ratchet: the table grows and never sheds a package a
 * consumer is still installing for nothing.
 *
 * @param {PeerTableInput} input
 * @returns {PeerTableCheck[]}
 */
export function peerTableChecks(input) {
  const { table, reached, peers, exceptions } = input;
  /** @type {(name: string, ok: boolean, detail?: string) => PeerTableCheck} */
  const made = (name, ok, detail = '') => ({ name, ok, detail });

  /*
   * The floors. A pattern that stopped matching, a package rename the prose
   * missed, or an import graph nothing could read leaves both sides empty, and
   * every comparison below then holds over nothing. That is the shape of the
   * twelve false passes this repository found in a day.
   *
   * `some` over an empty list is false, so each floor names its own count
   * first.
   */
  const checks = [
    made('the peer table has at least one row', table.size > 0),
    made('the import graph reached at least one entry point', reached.size > 0),
    made(
      'at least one row names a peer',
      [...table.values()].some((row) => row.length > 0),
    ),
    made(
      'at least one entry point imports a package',
      [...reached.values()].some((packages) => packages.length > 0),
    ),
    made('the manifest declares at least one peer', peers.length > 0),
  ];

  for (const subpath of reached.keys()) {
    checks.push(made(`the table has a row for ${subpath}`, table.has(subpath)));
  }

  for (const subpath of table.keys()) {
    checks.push(
      made(`${subpath} is an entry point the manifest exports`, reached.has(subpath)),
    );
  }

  for (const [subpath, row] of table) {
    const imports = reached.get(subpath);
    if (imports === undefined) continue;
    const wanted = expected(subpath, imports, exceptions);
    checks.push(
      made(
        `the ${subpath} row names what the entry point imports`,
        row.join(',') === wanted.join(','),
        `table: ${row.join(', ') || NO_PEERS}\n         code:  ${wanted.join(', ') || NO_PEERS}`,
      ),
    );
  }

  /*
   * The exception list, kept honest in both directions. A name here that stops
   * being a peer, or starts being imported, is an excuse for a row the import
   * graph now covers on its own.
   */
  const imported = new Set([...reached.values()].flat());
  for (const { subpath, name } of exceptions) {
    checks.push(made(`${name} is a declared peer`, peers.includes(name)));
    checks.push(
      made(
        `${name} is imported by no entry point, which is why ${subpath} names it by hand`,
        !imported.has(name),
      ),
    );
  }

  return checks;
}

/** The names of the checks that did not hold. */
export function failedPeerTableChecks(checks) {
  return checks.filter((check) => !check.ok).map((check) => check.name);
}
