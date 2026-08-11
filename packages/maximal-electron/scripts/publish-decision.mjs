/**
 * Whether a run may publish, and whether there is anything left to publish.
 *
 * Pure over facts the caller has already read, so `tests/publish-decision.test.ts`
 * runs offline and the rails below are asserted rather than assumed.
 *
 * A tag push is a one-shot fuse. The tag is immutable, so a run that never
 * started spends the version: on 2026-07-29 an Actions outage cancelled
 * `tag-check` after fifteen minutes in the queue, and the sibling repository's
 * `v0.4.4` exists with nothing built and nothing published. Publishing is
 * therefore something a run is asked to do against a tag that already exists,
 * and can be asked again until it succeeds.
 *
 * That widens what a dispatch may do, so the two rails live here, in one place
 * a test can run, rather than only in a workflow condition nobody can execute
 * locally. See `docs/ci.md`.
 */

/** The rail a workflow condition cannot state: what this run was asked to do. */
export const MODES = ['publish', 'rehearse'];

/** What the registry says about the exact version this run holds. */
export const REGISTRY_STATES = ['present', 'absent', 'unreadable'];

/** Markers npm uses when a version is already in the registry. */
const CONFLICT_MARKERS = ['EPUBLISHCONFLICT', 'E409', '409 Conflict', 'cannot publish over'];

/**
 * Whether npm refused because the version is already there.
 *
 * The second rail on idempotency, behind the registry probe. A probe that
 * could not read the registry still lets a publish be attempted, and this is
 * what turns the resulting refusal into an answer rather than a stack trace.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function isVersionConflict(text) {
  const haystack = String(text).toLowerCase();
  return CONFLICT_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}

/**
 * What `npm view <name>@<version> version` answered, as a state.
 *
 * npm reports three different things and two of them look alike. A version
 * that is present prints itself. A version that is absent from a package that
 * exists prints nothing and still exits 0. A package that does not exist at
 * all exits non-zero with `E404`. Anything else — a 401, a proxy, a network
 * failure — is unreadable, and must not read as absent: that is the difference
 * between "publish this" and "we could not tell".
 *
 * @param {{code: number, stdout?: string, stderr?: string, version: string}} answer
 * @returns {{state: string, detail: string}}
 */
export function registryStateFrom({ code, stdout, stderr, version }) {
  const out = String(stdout ?? '').trim();
  const err = String(stderr ?? '').trim();

  if (code === 0 && out === version) {
    return { state: 'present', detail: `the registry answered ${out} for ${version}.` };
  }
  if (code === 0 && out === '') {
    return { state: 'absent', detail: `the registry holds the package and no ${version}.` };
  }
  if (code !== 0 && err.includes('E404')) {
    return { state: 'absent', detail: 'the registry holds no such package yet.' };
  }
  return {
    state: 'unreadable',
    detail: `npm view exited ${String(code)} and said ${JSON.stringify(err || out)}.`,
  };
}

/**
 * The decision, from the mode, the ref, and the registry.
 *
 * Both rails a real publish must clear are here as refusals, not as
 * assumptions: the run must have been asked for a publish, and it must be on a
 * tag. A dispatch against a branch fails the second one whatever it was asked
 * for, which is the property `.github/workflows/release.yml` states in its
 * header and `tests/publish-decision.test.ts` walks a table over.
 *
 * @param {{mode: unknown, refType: unknown, registry: {state: string, detail?: string}}} facts
 * @returns {{action: string, reason: string}}
 */
export function decidePublish({ mode, refType, registry }) {
  if (!MODES.includes(mode)) {
    return {
      action: 'refuse',
      reason: `\`--mode ${String(mode)}\` is not one of ${MODES.join(', ')}.`,
    };
  }
  if (!REGISTRY_STATES.includes(registry.state)) {
    return {
      action: 'refuse',
      reason: `\`${String(registry.state)}\` is not one of ${REGISTRY_STATES.join(', ')}.`,
    };
  }
  if (mode === 'rehearse') {
    return { action: 'rehearse', reason: registry.detail ?? '' };
  }
  if (refType !== 'tag') {
    return {
      action: 'refuse',
      reason: `a real publish needs a tag ref, and this run is on a ${String(refType)}. No input makes a branch publishable. Dispatch against the tag instead.`,
    };
  }
  if (registry.state === 'present') {
    return { action: 'already-published', reason: registry.detail ?? '' };
  }
  return { action: 'publish', reason: registry.detail ?? '' };
}

/** The word that leads the outcome line, and what that action did. */
const OUTCOMES = new Map([
  ['publish', { headline: 'PUBLISHED', narration: 'this run uploaded it' }],
  ['already-published', { headline: 'ALREADY PUBLISHED', narration: 'this run uploaded nothing' }],
  ['rehearse', { headline: 'REHEARSED', narration: 'nothing was uploaded to any registry' }],
  ['refuse', { headline: 'REFUSED', narration: 'nothing was uploaded to any registry' }],
]);

/**
 * One line naming which of the outcomes happened.
 *
 * An operation that did nothing must not read like one that did something.
 * `PUBLISHED` and `ALREADY PUBLISHED` are both successes and are the two a
 * reader has to tell apart, so each names what this run uploaded.
 *
 * @param {{action: string, name: string, version: string, registry: string, reason?: string}} outcome
 * @returns {string}
 */
export function renderOutcome({ action, name, version, registry, reason }) {
  const words = OUTCOMES.get(action);
  if (words === undefined) throw new Error(`no outcome line for action \`${String(action)}\``);
  const detail = reason === undefined || reason === '' ? '' : ` ${reason}`;
  return `${words.headline}  ${name}@${version} at ${registry}: ${words.narration}.${detail}`;
}

/** Whether the run may exit 0. Only a refusal is a failure. */
export function isFailure(action) {
  return action === 'refuse';
}

/**
 * The argv npm gets, with the one argument that has already gone wrong.
 *
 * npm reads a bare `a/b` as an `owner/repo` git shorthand and clones it over
 * SSH. The first dry run of `publish-package` failed exactly that way, on the
 * path to the tarball it had just downloaded, so an argument that is not an
 * absolute path is refused here rather than handed over.
 *
 * @param {{file: unknown, registry: string, dryRun: boolean}} call
 * @returns {string[]}
 */
export function publishArguments({ file, registry, dryRun }) {
  if (!String(file).startsWith('/')) {
    throw new Error(
      `npm publish needs an absolute path, and got \`${String(file)}\`. A bare a/b argument is an owner/repo git shorthand, which npm clones over SSH.`,
    );
  }
  const argv = ['publish', String(file), '--registry', registry];
  if (dryRun) argv.push('--dry-run');
  return argv;
}
