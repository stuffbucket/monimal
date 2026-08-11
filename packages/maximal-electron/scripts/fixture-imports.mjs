/**
 * What the capture fixture imports, and whether it could.
 *
 * `docs/recording.md` says the fixture is "the first consumer of those
 * primitives, which is the same relationship a dependent project will have".
 * That claim was false for as long as every import read `../../../src/`, which
 * is a path no third party has. It is true now, and this module is the part
 * that keeps it true.
 *
 * Pure, and split from `verify-fixture-imports.mjs` for the reason
 * `docs-claims.mjs` is split from `verify-docs.mjs`: extraction is where the
 * defects are, and a check whose own parser is untested is the empty-scope
 * defect one level up.
 */

import path from 'node:path';

/** The extensions this module knows how to read an import out of. */
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.css', '.html'];

/**
 * Every specifier a file names, with the line it is on.
 *
 * Deliberately literal. A comment that writes `from '../../../src/x'` is
 * reported as an import, because the alternative is stripping comments, and
 * stripping `//` to end of line eats the tail of any line holding a URL. An
 * over-report names a line a person can read; an under-report is the failure
 * this check exists to prevent.
 */
export function importSpecifiers(text, extension) {
  const patterns =
    extension === '.css'
      ? [
          /@import\s+['"]([^'"]+)['"]/g,
          /\burl\(\s*['"]?([^'")]+?)['"]?\s*\)/g,
        ]
      : extension === '.html'
        ? [/\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g]
        : [/(?:\bfrom|\bimport|\brequire)\s*(?:\(\s*)?['"]([^'"]+)['"]/g];

  const lines = text.split('\n');
  const found = [];

  for (const [index, line] of lines.entries()) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        found.push({ specifier: match[1], line: index + 1 });
      }
    }
  }

  return found;
}

/**
 * Why a specifier reaches outside the package's public exports, or undefined.
 *
 * Two rules, because one of them alone has a hole. Resolving a relative
 * specifier catches every escape from the fixture directory, whatever it is
 * called. Naming `src/` catches the case a resolver would not see: an alias, a
 * root-relative path, or a specifier that resolves back inside the fixture
 * through a symbolic link.
 */
export function reachesOutside(specifier, { fromDir, root }) {
  if (/(^|\/)src\//.test(specifier)) {
    return 'names src/, which is this repository and not the package';
  }

  if (!specifier.startsWith('.')) return undefined;

  const resolved = path.resolve(fromDir, specifier);
  if (resolved === root || resolved.startsWith(root + path.sep)) return undefined;
  return 'resolves outside the fixture directory';
}

/**
 * The subpath a specifier names in this package, or undefined for anything
 * else. `@scope/name` itself is the root subpath `.`, which this package does
 * not export at all.
 */
export function packageSubpath(specifier, packageName) {
  if (specifier === packageName) return '.';
  if (!specifier.startsWith(`${packageName}/`)) return undefined;
  return `./${specifier.slice(packageName.length + 1)}`;
}
