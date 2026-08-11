import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { RENDERER_SURFACE } from '../scripts/export-checks.mjs';
import { exportedModules } from './stylesheets.js';

/**
 * Every public name says what it is, in the place a consumer reads.
 *
 * An outside agent installed the tarball with no access to this repository and
 * built a working application from the `.d.ts` comments alone. `docs/` is not
 * in the tarball and the README is one file, so those comments are the
 * documentation, not a supplement to it.
 *
 * `NavRail` is why this exists. Its docstring sat above `NavRailEntry` with a
 * blank line between, so TypeScript attached it to the row type and emitted
 * nothing on the component. Three consumers then reported that the component
 * could not do the one thing that docstring described, and two of them
 * rebuilt it by hand.
 *
 * The parse is the same question the emitter asks, so a comment this accepts
 * is a comment `dist/` carries. Matching text would accept the detached one.
 */

/** Where a public name is declared, and whether JSDoc reaches it. */
interface Declaration {
  name: string;
  module: string;
  documented: boolean;
}

/**
 * A declaration's own JSDoc, or its statement's.
 *
 * `export const X = …` puts the comment on the statement rather than on the
 * variable, and both are correct authoring. Reading only the identifier would
 * fail every constant in the surface.
 */
function documented(node: ts.Node): boolean {
  if (ts.getJSDocCommentsAndTags(node).length > 0) return true;
  const statement = ts.findAncestor(node, ts.isVariableStatement);
  return statement !== undefined && ts.getJSDocCommentsAndTags(statement).length > 0;
}

/** Public names this module declares, with whether each carries JSDoc. */
function declarationsIn(module: string, text: string): Declaration[] {
  const source = ts.createSourceFile(`${module}.tsx`, text, ts.ScriptTarget.Latest, true);
  const found: Declaration[] = [];

  const visit = (node: ts.Node): void => {
    const exported = ts
      .getModifiers(node as ts.HasModifiers)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

    if (exported === true && ts.isFunctionDeclaration(node) && node.name) {
      found.push({ name: node.name.text, module, documented: documented(node) });
    }

    if (exported === true && ts.isVariableStatement(node)) {
      for (const entry of node.declarationList.declarations) {
        if (ts.isIdentifier(entry.name)) {
          found.push({ name: entry.name.text, module, documented: documented(entry) });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

const declarations = exportedModules().flatMap(([module, text]) =>
  declarationsIn(module, text),
);

/** Only the names the package promises. A helper beside one is not public. */
const surface = declarations.filter((entry) => RENDERER_SURFACE.includes(entry.name));

describe('the public renderer names', () => {
  it(`are found in the export tree [${String(surface.length)} of ${String(RENDERER_SURFACE.length)} named, ${String(declarations.length)} declarations walked]`, () => {
    /*
     * The floor. Every assertion below filters this list, so a walk that found
     * nothing would report a clean surface over no components at all.
     *
     * The two counts differ legitimately: `RENDERER_SURFACE` holds names the
     * entry re-exports from modules this walk does not reach, such as the type
     * aliases. A name it cannot find is not a failure, but finding almost none
     * is.
     */
    expect(declarations.length).toBeGreaterThan(40);
    expect(surface.length).toBeGreaterThan(25);
  });

  it('each carry a docstring the emitter will attach', () => {
    /*
     * A blank line between a comment and its declaration is the whole defect.
     * The comment survives in the source and reaches nobody, which reads as a
     * documented component to every reviewer and as an undocumented one to
     * every consumer.
     */
    const bare = surface
      .filter((entry) => !entry.documented)
      .map((entry) => `${entry.module}: ${entry.name}`)
      .sort();

    expect(bare).toEqual([]);
  });
});
