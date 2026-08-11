import ts from 'typescript';

/**
 * Where a name comes from, read off the syntax tree of one module.
 *
 * `tests/class-names.ts` evaluates a class-name expression, and every
 * interesting expression in this repository reaches a name rather than a
 * literal: a local variable, a destructured prop with a default, a parameter
 * whose type is a union of two strings. Resolving those is what this module
 * does, and it is a separate concern from what the resolved string is used for.
 *
 * One module and no `Program`. A type checker would answer more, at the cost of
 * a compilation on every test run and a resolution of every import; the four
 * forms the components use are all declared in the file that uses them, so the
 * checker would buy nothing here. What the reader cannot answer it reports, so
 * the limit is visible rather than assumed.
 *
 * Not a `.test.ts` file, so Vitest does not collect it.
 */

/** The type alias a name stands for, when this module declares it. */
function typeAlias(file: ts.SourceFile, name: string): ts.TypeNode | undefined {
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return statement.type;
  }
  return undefined;
}

/**
 * The strings a type permits, or `undefined` when it permits any string.
 *
 * `base: 'card' | 'row'` is closed: a caller can pass nothing else, so both
 * strings belong to the component. `className?: string` is open, so whatever
 * arrives belongs to the caller.
 */
export function literalTypes(
  type: ts.TypeNode | undefined,
  file: ts.SourceFile,
): Set<string> | undefined {
  if (type === undefined) return undefined;
  if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) {
    return new Set([type.literal.text]);
  }
  if (type.kind === ts.SyntaxKind.UndefinedKeyword) return new Set<string>();
  if (ts.isParenthesizedTypeNode(type)) return literalTypes(type.type, file);
  if (ts.isUnionTypeNode(type)) {
    const out = new Set<string>();
    for (const member of type.types) {
      const values = literalTypes(member, file);
      if (values === undefined) return undefined;
      for (const value of values) out.add(value);
    }
    return out;
  }
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const alias = typeAlias(file, type.typeName.text);
    return alias === undefined ? undefined : literalTypes(alias, file);
  }
  return undefined;
}

/** The type written for one property of an annotation, across an intersection. */
function propertyType(annotation: ts.TypeNode | undefined, name: string): ts.TypeNode | undefined {
  if (annotation === undefined) return undefined;
  const members = ts.isIntersectionTypeNode(annotation) ? annotation.types : [annotation];
  for (const member of members) {
    if (!ts.isTypeLiteralNode(member)) continue;
    for (const property of member.members) {
      if (!ts.isPropertySignature(property)) continue;
      if (ts.isIdentifier(property.name) && property.name.text === name) return property.type;
    }
  }
  return undefined;
}

/**
 * The type a binding was declared with.
 *
 * A parameter carries its own. A destructured property carries none, so the
 * type is the one its owner's annotation writes for that name.
 */
export function declaredType(
  declaration: ts.BindingElement | ts.ParameterDeclaration,
): ts.TypeNode | undefined {
  if (ts.isParameter(declaration)) return declaration.type;
  const owner = declaration.parent.parent;
  const annotation =
    ts.isParameter(owner) || ts.isVariableDeclaration(owner) ? owner.type : undefined;
  const key = declaration.propertyName ?? declaration.name;
  return ts.isIdentifier(key) ? propertyType(annotation, key.text) : undefined;
}

/** The nearest enclosing function or module, which is where locals live. */
function scopeOf(node: ts.Node): ts.Node {
  for (let walk = node.parent; walk !== undefined; walk = walk.parent) {
    if (ts.isFunctionLike(walk) || ts.isSourceFile(walk)) return walk;
  }
  return node.getSourceFile();
}

/**
 * The declaration a name binds to, searched outwards from the use.
 *
 * A scope contributes its own parameters and variables and not those of a
 * function nested inside it, so the innermost binding wins.
 */
export function declarationOf(use: ts.Node, name: string): ts.Node | undefined {
  for (let scope = use.parent; scope !== undefined; scope = scope.parent) {
    let found: ts.Node | undefined;
    const visit = (node: ts.Node): void => {
      if (found !== undefined) return;
      const declares =
        ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node);
      if (declares && ts.isIdentifier(node.name) && node.name.text === name) {
        found = node;
        return;
      }
      if (node !== scope && ts.isFunctionLike(node)) return;
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(scope, visit);
    if (found !== undefined) return found;
    if (ts.isSourceFile(scope)) return undefined;
  }
  return undefined;
}

/** Every `name.push(…)` inside the scope that declares the name. */
export function pushCalls(declaration: ts.Node, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'push' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === name
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(scopeOf(declaration));
  return found;
}

/** A one-line citation, so a failure names the expression it could not read. */
export function where(node: ts.Node, file: ts.SourceFile): string {
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return `${line + 1}: ${node.getText(file).replace(/\s+/g, ' ').slice(0, 90)}`;
}
