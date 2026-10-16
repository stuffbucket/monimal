import ts from 'typescript';

import { browserEventForReactProp } from './pulse-event-matrix.ts';
import type { PulseEventBinding } from './react-state-types.ts';

function lineOf(root: ts.SourceFile, node: ts.Node): number {
  return root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1;
}

function jsxTarget(root: ts.SourceFile, attribute: ts.JsxAttribute): string {
  const owner = attribute.parent.parent;
  if (!ts.isJsxOpeningElement(owner) && !ts.isJsxSelfClosingElement(owner)) {
    return '<unknown>';
  }
  const qualifiers = owner.attributes.properties.flatMap((candidate) => {
    if (
      !ts.isJsxAttribute(candidate)
      || !candidate.initializer
      || !ts.isStringLiteral(candidate.initializer)
    ) return [];
    const name = candidate.name.getText(root);
    if (name === 'className') {
      return candidate.initializer.text
        .split(/\s+/u)
        .filter((className) => /^[A-Za-z_][\w-]*$/u.test(className))
        .map((className) => `.${className}`);
    }
    return ['aria-label', 'data-testid', 'name', 'role', 'type'].includes(name)
      ? [`[${name}="${candidate.initializer.text}"]`]
      : [];
  });
  return `${owner.tagName.getText(root)}${qualifiers.join('')}`;
}

export function pulseEventBindings(
  root: ts.SourceFile,
  body: ts.ConciseBody,
): PulseEventBinding[] {
  const bindings: PulseEventBinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)) {
      const reactProp = node.name.getText(root);
      const event = browserEventForReactProp(reactProp);
      const expression = node.initializer
        && ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : undefined;
      if (event !== undefined && expression !== undefined) {
        const line = lineOf(root, node);
        const handler = ts.isIdentifier(expression)
          ? expression.text
          : ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)
            ? `jsx:${reactProp}@${String(line)}`
            : expression.getText(root);
        bindings.push({
          event,
          reactProp,
          target: jsxTarget(root, node),
          line,
          handler,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return bindings;
}
