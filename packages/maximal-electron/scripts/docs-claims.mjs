/**
 * What a documentation check can decide.
 *
 * Prose style is a judgement and no tool has it. These questions are not
 * judgements: a name either exists or it does not. Every documentation defect
 * found in this repository has been one of them.
 *
 * | Defect | Rule |
 * | --- | --- |
 * | `npm run lint:docs` after the script was deleted | `npmScripts` |
 * | `READ_ONLY_TOOLS`, three refactors stale | `constants` |
 * | `MIN_SCREENSHOT_BYTES`, replaced the same day | `constants` |
 * | A link to a file that moved | `links` |
 * | A backticked path to a script that was never written | `pathClaims` |
 *
 * Kept pure, and separate from the script that walks the tree, so the matching
 * is unit tested rather than trusted.
 */

/** Strip fenced code blocks. Their contents are examples, not claims. */
export function withoutFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

/**
 * The contents of every inline code span, fenced blocks removed.
 *
 * A backtick pair is the boundary between prose and a name. Matching names
 * outside one reports "you can npm run whatever you like" as a claim, which is
 * how the prose linter this replaced earned its removal.
 */
export function codeSpans(text) {
  return [...withoutFences(text).matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

/**
 * Every `npm run <name>` in the text, wherever it sits.
 *
 * One pattern, read by the rule and by the count of what the rule declines:
 * the number that says how much is out of scope is only worth printing if it
 * is the same question. Two copies drifted apart in nothing but mutation
 * score, because the count the second fed is a length rather than a list of
 * names, so every mutant of it survived.
 */
const NPM_RUN = /\bnpm run ([a-z][a-z0-9:-]*)/g;

/**
 * Every `npm run <name>` named in prose.
 *
 * Matched inside a span rather than against a whole span. The commands table
 * writes `npm run package && npm run test:e2e` in one pair of backticks, and
 * an anchored rule read the first of the two and dropped the second in
 * silence.
 */
export function npmScripts(text) {
  return codeSpans(text).flatMap((span) =>
    [...span.matchAll(NPM_RUN)].map((match) => match[1]),
  );
}

/**
 * A span that could name a file: a directory separator, or an extension.
 *
 * The extension has to start with a letter and end the span, or `v0.0.2` and
 * `v1.2.3-alpha.1` read as file names.
 */
function pathShaped(span) {
  return !/\s/.test(span) && (span.includes('/') || /\.[a-z][a-z0-9]{0,4}$/i.test(span));
}

/**
 * A span written as a path inside the source tree rather than from the root.
 *
 * `native/llama-host.ts` and `host/crash-artifacts.ts` sit in one table row in
 * `docs/architecture.md`, at two different depths, because a reader of that
 * table is already inside `src/`. A leading `.`, `/`, `@` or `~` is a relative
 * import, an export subpath, a package specifier or a home directory, and
 * `node_modules/` is somebody else's tree.
 */
const OWN_TREE = /^[a-z]/i;

/**
 * Every path-shaped backticked span, sorted into what the checker can decide.
 *
 * One pass and four buckets, because the counts have to add up. The rule this
 * replaces kept the spans under a declared root and dropped the rest on the
 * floor, so a document could name `.vite/build/anything.js` and stay green
 * while the run reported 205 paths as its scope. #152 is the two break
 * attempts that passed that way. `declined` is the residue, so the caller can
 * print a number instead of nothing.
 *
 * A colon cannot appear in a path this repository carries — Windows forbids one
 * in a file name — so everything from the first colon is a location, whether it
 * is `:142` or `:142:7`, and the span is trimmed to the file it points at.
 * Globs are kept as written: the caller decides whether a pattern matching
 * nothing is a defect, and there it is.
 *
 * - `repo` sits under `roots` and names a file in the checkout.
 * - `build` sits under `buildRoots`, which a checkout does not contain. An
 *   optional leading slash is an archive listing entry, `/.vite/build/main.js`.
 * - `relative` carries one of `moduleExtensions` and is written from inside the
 *   source tree.
 */
export function pathClaims(text, { roots, buildRoots, moduleExtensions }) {
  const claims = { repo: [], build: [], relative: [], declined: [] };
  for (const raw of codeSpans(text)) {
    const span = raw.trim().split(':')[0];
    if (!pathShaped(span)) continue;
    const listed = span.startsWith('/') ? span.slice(1) : span;

    if (roots.some((root) => span.startsWith(root + '/'))) claims.repo.push(span);
    else if (buildRoots.some((root) => listed === root || listed.startsWith(root + '/')))
      claims.build.push(span);
    else if (
      OWN_TREE.test(span) &&
      span.includes('/') &&
      !span.startsWith('node_modules/') &&
      moduleExtensions.some((extension) => span.endsWith(extension))
    )
      claims.relative.push(span);
    else claims.declined.push(span);
  }
  return claims;
}

/**
 * Every `npm run <name>` this deliberately does not check.
 *
 * A fenced block is a worked example and may show a command from another
 * project, and a mention outside a code span is prose. Both are choices, and
 * 29 of the 101 mentions in these documents fall into them. Counting them is
 * how the choice stays visible in the output instead of looking like coverage.
 */
export function npmScriptsOutOfScope(text) {
  return [...text.matchAll(NPM_RUN)].length - npmScripts(text).length;
}

/**
 * Backticked SCREAMING_SNAKE names.
 *
 * Four characters and up, because `ID` and `URL` appear in prose as words.
 * A trailing `()` or a leading `--` is excluded elsewhere; this is only the
 * shape that constants, fuses, and environment variables share.
 */
export function constants(text) {
  return [...withoutFences(text).matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)].map(
    (match) => match[1],
  );
}

/** Relative markdown link targets, with any anchor removed. */
export function links(text) {
  return [...text.matchAll(/]\((?!https?:|mailto:|#)([^)\s]+)\)/g)].map(
    (match) => match[1].split('#')[0],
  );
}
