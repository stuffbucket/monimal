import ts from 'typescript';

import {
  declarationOf,
  declaredType,
  literalTypes,
  pushCalls,
  where,
} from './module-bindings.js';

/**
 * Every class name a component can write into `className`, read from the syntax
 * tree rather than from the text.
 *
 * The text matcher this replaces saw `className="…"` and a template literal and
 * nothing else. It was blind to a ternary, to a class array joined at run time,
 * to a default parameter value and to a local variable, which is four of the
 * forms this repository uses. `.btn*` and `.dialog*` shipped with no rule in
 * `structural.css` and the check written to catch that reported clean.
 *
 * Widening a text matcher by matching more strings trades one false report for
 * another. A matcher that scrapes every literal collects test ids, ARIA roles
 * and data attribute values, and the tripwire then fails over classes nothing
 * renders. So the line is drawn at the attribute rather than at the string: the
 * reader starts only where React is handed a class, which is a JSX attribute
 * named `className` or ending in `ClassName`, and evaluates the expression it
 * finds there. Nothing else in the file is read, and a `className` in a comment
 * is not in the tree at all.
 *
 * The reader states what it declined rather than dropping it. `unrecognised`
 * names every expression whose shape it has no case for, and the check fails on
 * it, so the next unrecognised form is loud rather than invisible. `opaque`
 * names every fragment whose value a caller supplies: those are real gaps, but
 * the class is the caller's to declare, and a caller inside the package is read
 * as its own module.
 *
 * Not a `.test.ts` file, so Vitest does not collect it.
 */

/**
 * A fragment the reader cannot compute, standing in the string where the value
 * would be.
 *
 * A name built around it is dropped and a name beside it survives, so
 * `` `${base} ${modifier}` `` still yields `card`, while `` `btn--${variant}` ``
 * over an unknown variant yields nothing rather than the bare `btn--` that no
 * rule will ever match.
 */
const OPAQUE = String.fromCharCode(0);

/** A ceiling on the cross product a concatenation may produce. */
const LIMIT = 64;

export interface ClassNameScan {
  /** Every class name the module can render, sorted and deduplicated. */
  classes: string[];
  /** How many class-name attributes the reader started from. */
  attributes: number;
  /** Every expression the reader has no case for, as `line: source`. */
  unrecognised: string[];
  /** Every fragment whose value a caller supplies, as `line: source`. */
  opaque: string[];
}

/** The attributes React turns into a class. */
function isClassName(name: string): boolean {
  return name === 'className' || name.endsWith('ClassName');
}

/** Every string the two sets produce end to end. */
function concat(left: Set<string>, right: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const before of left) {
    for (const after of right) {
      if (out.size >= LIMIT) return out.add(OPAQUE);
      out.add(before + after);
    }
  }
  return out;
}

function union(...sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) for (const value of set) out.add(value);
  return out;
}

/**
 * Read one module.
 *
 * `classes` is what the check compares against the stylesheet. The other three
 * fields are the reader's account of itself: how much it looked at, what it
 * refused, and what it could not know.
 */
export function scanClassNames(source: string): ClassNameScan {
  const file = ts.createSourceFile(
    'module.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const classes = new Set<string>();
  const unrecognised: string[] = [];
  const opaque: string[] = [];
  let attributes = 0;

  // A parse error would leave the walk below over a truncated tree, which is the
  // empty scope this repository keeps shipping. `parseDiagnostics` is how the
  // compiler reports one without a Program.
  const errors = (file as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  if (errors.length > 0) unrecognised.push(`1: the module does not parse [${errors.length}]`);

  const decline = (node: ts.Node, why: string): Set<string> => {
    unrecognised.push(`${where(node, file)} [${why}]`);
    return new Set([OPAQUE]);
  };

  const active = new Set<ts.Node>();

  /** Every whole string an expression can evaluate to. */
  const values = (node: ts.Node): Set<string> => {
    if (active.has(node)) return new Set([OPAQUE]);
    active.add(node);
    try {
      return evaluate(node);
    } finally {
      active.delete(node);
    }
  };

  /** The elements of an array expression, one value set each. */
  const elements = (node: ts.Node): Set<string>[] | undefined => {
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map((element) =>
        ts.isSpreadElement(element)
          ? decline(element, 'a spread inside a class array')
          : values(element),
      );
    }
    if (!ts.isIdentifier(node)) return undefined;
    const declaration = declarationOf(node, node.text);
    if (declaration === undefined || !ts.isVariableDeclaration(declaration)) return undefined;
    const initializer = declaration.initializer;
    if (initializer === undefined || !ts.isArrayLiteralExpression(initializer)) return undefined;
    const parts = elements(initializer) ?? [];
    for (const call of pushCalls(declaration, node.text)) {
      for (const argument of call.arguments) parts.push(values(argument));
    }
    return parts;
  };

  /** An array joined into one class string. */
  const joined = (call: ts.CallExpression): Set<string> => {
    const target = call.expression;
    if (!ts.isPropertyAccessExpression(target) || target.name.text !== 'join') {
      return decline(call, 'a call that is not a join');
    }
    const parts = elements(target.expression);
    if (parts === undefined) return decline(call, 'a join over an array this module does not hold');

    const first = call.arguments[0];
    const separators = first === undefined ? new Set([',']) : values(first);
    // A separator carrying whitespace keeps every element a class of its own, so
    // the elements need no cross product. Any other builds one name from all.
    if ([...separators].every((separator) => /\s/.test(separator))) return union(...parts);

    let out = new Set(['']);
    parts.forEach((part, index) => {
      if (index > 0) out = concat(out, separators);
      out = concat(out, part);
    });
    return out;
  };

  /**
   * What a parameter or a destructured property can hold.
   *
   * A default value is the component's own class. A closed literal type is the
   * whole of what a caller may pass, so it is the component's too. Anything
   * else arrives from outside and is opaque, which is counted rather than
   * dropped.
   */
  const bound = (declaration: ts.BindingElement | ts.ParameterDeclaration): Set<string> => {
    const out = new Set<string>();
    if (declaration.initializer !== undefined) {
      for (const value of values(declaration.initializer)) out.add(value);
    }

    const declared = literalTypes(declaredType(declaration), file);
    if (declared !== undefined) return union(out, declared);

    opaque.push(where(declaration, file));
    return out.add(OPAQUE);
  };

  const identifier = (node: ts.Identifier): Set<string> => {
    if (node.text === 'undefined') return new Set(['']);
    const declaration = declarationOf(node, node.text);
    if (declaration === undefined) return decline(node, 'a name this module does not declare');
    if (ts.isVariableDeclaration(declaration)) {
      return declaration.initializer === undefined
        ? decline(node, 'a variable with no initialiser')
        : values(declaration.initializer);
    }
    if (ts.isBindingElement(declaration) || ts.isParameter(declaration)) return bound(declaration);
    return decline(node, 'a declaration the reader has no case for');
  };

  function evaluate(node: ts.Node): Set<string> {
    if (ts.isJsxExpression(node)) {
      return node.expression === undefined ? new Set(['']) : values(node.expression);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return new Set([node.text]);
    }
    if (ts.isTemplateExpression(node)) {
      let out = new Set([node.head.text]);
      for (const span of node.templateSpans) {
        out = concat(concat(out, values(span.expression)), new Set([span.literal.text]));
      }
      return out;
    }
    if (ts.isConditionalExpression(node)) {
      return union(values(node.whenTrue), values(node.whenFalse));
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      return values(node.expression);
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.PlusToken) return concat(values(node.left), values(node.right));
      // A guard renders the right side or nothing at all.
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        return union(values(node.right), new Set(['']));
      }
      if (
        operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return union(values(node.left), values(node.right));
      }
      return decline(node, 'an operator the reader has no case for');
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) return new Set(['']);
    if (ts.isIdentifier(node)) return identifier(node);
    if (ts.isCallExpression(node)) return joined(node);
    return decline(node, ts.SyntaxKind[node.kind] ?? 'an expression with no syntax kind');
  }

  const collect = (found: Set<string>): void => {
    for (const value of found) {
      for (const name of value.split(/\s+/)) {
        if (name.length > 0 && !name.includes(OPAQUE)) classes.add(name);
      }
    }
  };

  const walk = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && isClassName(node.name.text)) {
      attributes += 1;
      // A bare `className` is boolean `true`, and React writes nothing.
      if (node.initializer !== undefined) collect(values(node.initializer));
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      isClassName(node.name.text)
    ) {
      attributes += 1;
      collect(values(node.initializer));
    }
    ts.forEachChild(node, walk);
  };
  walk(file);

  return { classes: [...classes].sort(), attributes, unrecognised, opaque };
}

/** Every class name a component writes into `className`. */
export function renderedClasses(source: string): string[] {
  return scanClassNames(source).classes;
}
