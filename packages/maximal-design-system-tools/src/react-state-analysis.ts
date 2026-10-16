import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

import ts from 'typescript';

import {
  analysisRisks,
  crossProductComponents,
} from './state-machine-cross-products.ts';
import { buildPulseEventMatrix } from './pulse-event-matrix.ts';
import { pulseEventBindings } from './pulse-jsx-events.ts';
import type {
  AnalyzedHandler,
  AnalyzedHandlerCall,
  AnalyzedReactState,
  AnalyzedStateWrite,
  AnalyzedStateMachine,
  ReactImplementationAnalysis,
} from './react-state-types.ts';

export type {
  AnalysisRisk,
  AnalyzedHandler,
  AnalyzedHandlerCall,
  AnalyzedReactState,
  AnalyzedStateWrite,
  AnalyzedStateMachine,
  CrossProductComponent,
  PulseEventBinding,
  PulseEventMatrix,
  PulseResponseCell,
  PulseStateTransition,
  ReactImplementationAnalysis,
} from './react-state-types.ts';

export {
  implementationAnalysisToMarkdown,
  stateMachinesToDot,
} from './state-machine-report.ts';

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function property(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const candidate of object.properties) {
    if (
      ts.isPropertyAssignment(candidate)
      && propertyName(candidate.name) === name
    ) return candidate.initializer;
  }
  return undefined;
}

function stringValue(node: ts.Expression | undefined, label: string): string {
  if (!node || !ts.isStringLiteral(node)) {
    throw new Error(`${label} must be a string literal.`);
  }
  return node.text;
}

function stringArray(node: ts.Expression | undefined, label: string): string[] {
  if (!node || !ts.isArrayLiteralExpression(node)) {
    throw new Error(`${label} must be an array of string literals.`);
  }
  return node.elements.map((element, index) =>
    stringValue(element, `${label}[${String(index)}]`));
}

function transitionMap(
  node: ts.Expression | undefined,
  label: string,
): Record<string, string> {
  if (node === undefined) return {};
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(`${label} must be an object literal.`);
  }
  return Object.fromEntries(node.properties.map((candidate) => {
    if (!ts.isPropertyAssignment(candidate)) {
      throw new Error(`${label} may contain only property assignments.`);
    }
    const event = propertyName(candidate.name);
    if (event === undefined) throw new Error(`${label} contains an unsupported event name.`);
    return [event, stringValue(candidate.initializer, `${label}.${event}`)];
  }));
}

function parseMachine(
  object: ts.ObjectLiteralExpression,
  source: string,
): AnalyzedStateMachine {
  const id = stringValue(property(object, 'id'), 'machine.id');
  const initial = stringValue(property(object, 'initial'), `${id}.initial`);
  const events = stringArray(property(object, 'events'), `${id}.events`);
  const statesNode = property(object, 'states');
  if (!statesNode || !ts.isObjectLiteralExpression(statesNode)) {
    throw new Error(`${id}.states must be an object literal.`);
  }
  const states = Object.fromEntries(statesNode.properties.map((candidate) => {
    if (!ts.isPropertyAssignment(candidate)) {
      throw new Error(`${id}.states may contain only property assignments.`);
    }
    const state = propertyName(candidate.name);
    if (state === undefined || !ts.isObjectLiteralExpression(candidate.initializer)) {
      throw new Error(`${id}.states contains an unsupported state definition.`);
    }
    return [
      state,
      { on: transitionMap(property(candidate.initializer, 'on'), `${id}.${state}.on`) },
    ];
  }));
  return { id, source, initial, events, states };
}

export function analyzeStateMachineSource(
  text: string,
  source = '<source>',
): AnalyzedStateMachine[] {
  const root = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
  const machines: AnalyzedStateMachine[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'defineStateMachine'
    ) {
      const definition = node.arguments[0];
      if (!definition || !ts.isObjectLiteralExpression(definition)) {
        throw new Error(`${source}: defineStateMachine requires an object literal.`);
      }
      machines.push(parseMachine(definition, source));
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return machines;
}

function resolveLocalImport(source: string, specifier: string): string | undefined {
  const unresolved = resolve(dirname(source), specifier);
  const base = ['.js', '.mjs', '.cjs'].includes(extname(unresolved))
    ? unresolved.slice(0, -extname(unresolved).length)
    : unresolved;
  for (const candidate of [
    unresolved,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function localImports(text: string, source: string): string[] {
  const root = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
  return root.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.moduleSpecifier.text.startsWith('.')
    ) return [];
    const imported = resolveLocalImport(source, statement.moduleSpecifier.text);
    return imported === undefined ? [] : [imported];
  });
}

function reachableLocalSources(entry: string): Map<string, string> {
  const sources = new Map<string, string>();
  const pending = [resolve(entry)];
  while (pending.length > 0) {
    const source = pending.pop();
    if (source === undefined || sources.has(source)) continue;
    const text = readFileSync(source, 'utf8');
    sources.set(source, text);
    pending.push(...localImports(text, source));
  }
  return sources;
}

function namedFiniteDomains(sources: ReadonlyMap<string, string>): Map<string, string[]> {
  const domains = new Map<string, string[]>();
  for (const [source, text] of sources) {
    const root = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
    for (const statement of root.statements) {
      if (!ts.isTypeAliasDeclaration(statement)) continue;
      const direct = finiteTypeDomain(statement.type);
      if (direct) {
        domains.set(statement.name.text, direct);
        continue;
      }
      if (!ts.isUnionTypeNode(statement.type)) continue;
      const discriminants = statement.type.types.flatMap((member) => {
        if (!ts.isTypeLiteralNode(member)) return [];
        const state = member.members.find((candidate) =>
          ts.isPropertySignature(candidate)
          && candidate.name
          && propertyName(candidate.name) === 'state');
        if (!state || !ts.isPropertySignature(state) || !state.type) return [];
        const values = finiteTypeDomain(state.type);
        if (values) return values;
        if (ts.isLiteralTypeNode(state.type) && ts.isStringLiteral(state.type.literal)) {
          return [state.type.literal.text];
        }
        return [];
      });
      if (discriminants.length === statement.type.types.length) {
        domains.set(statement.name.text, discriminants);
      }
    }
  }
  return domains;
}

function lineOf(root: ts.SourceFile, node: ts.Node): number {
  return root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1;
}

function finiteTypeDomain(type: ts.TypeNode | undefined): string[] | undefined {
  if (!type || !ts.isUnionTypeNode(type)) return undefined;
  const values = type.types.flatMap((member) => {
    if (ts.isLiteralTypeNode(member)) {
      if (ts.isStringLiteral(member.literal) || ts.isNumericLiteral(member.literal)) {
        return [member.literal.text];
      }
      if (member.literal.kind === ts.SyntaxKind.TrueKeyword) return ['true'];
      if (member.literal.kind === ts.SyntaxKind.FalseKeyword) return ['false'];
    }
    if (member.kind === ts.SyntaxKind.UndefinedKeyword) return ['absent'];
    return [];
  });
  return values.length === type.types.length ? values : undefined;
}

function stateDomain(
  call: ts.CallExpression,
  hook: 'useState' | 'useReducer',
  machines: readonly AnalyzedStateMachine[],
  namedDomains: ReadonlyMap<string, string[]>,
): string[] | undefined {
  if (hook === 'useReducer') {
    return machines.length === 1 ? Object.keys(machines[0]?.states ?? {}) : undefined;
  }
  const typed = finiteTypeDomain(call.typeArguments?.[0]);
  if (typed) return typed;
  const typeArgument = call.typeArguments?.[0];
  if (typeArgument && ts.isTypeReferenceNode(typeArgument) && ts.isIdentifier(typeArgument.typeName)) {
    const named = namedDomains.get(typeArgument.typeName.text);
    if (named) return named;
  }
  const initial = call.arguments[0];
  if (!initial) return ['absent', 'present'];
  if (
    initial.kind === ts.SyntaxKind.TrueKeyword
    || initial.kind === ts.SyntaxKind.FalseKeyword
  ) return ['false', 'true'];
  if (ts.isStringLiteral(initial)) return ['empty', 'nonempty'];
  if (ts.isArrayLiteralExpression(initial)) return ['empty', 'nonempty'];
  return undefined;
}

function containsHook(node: ts.Node): boolean {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (
      ts.isCallExpression(candidate)
      && ts.isIdentifier(candidate.expression)
      && ['useState', 'useReducer'].includes(candidate.expression.text)
    ) found = true;
    if (!found) ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (
      ts.isJsxElement(candidate)
      || ts.isJsxSelfClosingElement(candidate)
      || ts.isJsxFragment(candidate)
    ) found = true;
    if (!found) ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function isComponentName(name: string | undefined): boolean {
  return /^[A-Z]/u.test(name ?? '');
}

function componentCandidate(
  name: string | undefined,
  body: ts.ConciseBody,
): { body: ts.ConciseBody; stateful: boolean } | undefined {
  if (!isComponentName(name) || !containsJsx(body)) return undefined;
  return { body, stateful: containsHook(body) };
}

function componentBody(root: ts.SourceFile): ts.ConciseBody | undefined {
  const candidates: Array<{ body: ts.ConciseBody; stateful: boolean }> = [];
  for (const statement of root.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      const candidate = componentCandidate(statement.name?.text, statement.body);
      if (candidate) candidates.push(candidate);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          declaration.initializer
          && (ts.isArrowFunction(declaration.initializer)
            || ts.isFunctionExpression(declaration.initializer))
        ) {
          const name = ts.isIdentifier(declaration.name)
            ? declaration.name.text
            : undefined;
          const candidate = componentCandidate(
            name,
            declaration.initializer.body,
          );
          if (candidate) candidates.push(candidate);
        }
      }
    }
  }
  return candidates.find((candidate) => candidate.stateful)?.body
    ?? candidates[0]?.body;
}

function analyzeReactStates(
  root: ts.SourceFile,
  body: ts.ConciseBody,
  machines: readonly AnalyzedStateMachine[],
  namedDomains: ReadonlyMap<string, string[]>,
): AnalyzedReactState[] {
  const states: AnalyzedReactState[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isArrayBindingPattern(node.name)
      && node.name.elements.length >= 2
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && (
        node.initializer.expression.text === 'useState'
        || node.initializer.expression.text === 'useReducer'
      )
    ) {
      const stateElement = node.name.elements[0];
      const setterElement = node.name.elements[1];
      const state = stateElement && ts.isBindingElement(stateElement)
        ? stateElement.name
        : undefined;
      const setter = setterElement && ts.isBindingElement(setterElement)
        ? setterElement.name
        : undefined;
      if (state && setter && ts.isIdentifier(state) && ts.isIdentifier(setter)) {
        const hook = node.initializer.expression.text;
        const domain = stateDomain(node.initializer, hook, machines, namedDomains);
        states.push({
          name: state.text,
          setter: setter.text,
          hook,
          initial: node.initializer.arguments[hook === 'useReducer' ? 1 : 0]?.getText(root)
            ?? 'undefined',
          ...(domain === undefined ? {} : { domain }),
          line: lineOf(root, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return states;
}

interface HandlerNode {
  name: string;
  node: ts.ArrowFunction | ts.FunctionExpression;
}

function derivedStateReads(
  body: ts.ConciseBody,
  states: readonly AnalyzedReactState[],
): Map<string, Set<string>> {
  const stateNames = new Set(states.map((state) => state.name));
  const aliases = new Map<string, Set<string>>();
  const declarations: ts.VariableDeclaration[] = [];
  if (ts.isBlock(body)) {
    for (const statement of body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name)
          && !stateNames.has(declaration.name.text)
          && declaration.initializer
          && !ts.isArrowFunction(declaration.initializer)
          && !ts.isFunctionExpression(declaration.initializer)
        ) declarations.push(declaration);
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
      const dependencies = new Set<string>();
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
          if (stateNames.has(node.text)) dependencies.add(node.text);
          for (const dependency of aliases.get(node.text) ?? []) dependencies.add(dependency);
        }
        ts.forEachChild(node, visit);
      };
      visit(declaration.initializer);
      const current = aliases.get(declaration.name.text) ?? new Set<string>();
      const before = current.size;
      for (const dependency of dependencies) current.add(dependency);
      if (current.size !== before) {
        aliases.set(declaration.name.text, current);
        changed = true;
      }
    }
  }
  return aliases;
}

function handlerNodes(root: ts.SourceFile, body: ts.ConciseBody): HandlerNode[] {
  const handlers: HandlerNode[] = [];
  const seen = new Set<number>();
  const add = (
    name: string,
    node: ts.ArrowFunction | ts.FunctionExpression,
  ): void => {
    if (seen.has(node.pos)) return;
    seen.add(node.pos);
    handlers.push({ name, node });
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
    ) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        add(node.name.text, node.initializer);
      } else if (
        ts.isCallExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression)
        && node.initializer.expression.text === 'useCallback'
      ) {
        const callback = node.initializer.arguments[0];
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          add(node.name.text, callback);
        }
      }
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && ['useEffect', 'useTransportEvent'].includes(node.expression.text)
    ) {
      const callback = node.arguments[node.expression.text === 'useEffect' ? 0 : 1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const event = node.expression.text === 'useTransportEvent'
          ? node.arguments[0]?.getText(root) ?? 'unknown'
          : `effect@${String(lineOf(root, node))}`;
        add(event, callback);
      }
    }
    if (
      ts.isJsxAttribute(node)
      && node.initializer
      && ts.isJsxExpression(node.initializer)
      && node.initializer.expression
      && (
        ts.isArrowFunction(node.initializer.expression)
        || ts.isFunctionExpression(node.initializer.expression)
      )
    ) {
      add(
        `jsx:${node.name.getText(root)}@${String(lineOf(root, node))}`,
        node.initializer.expression,
      );
    }
    if (
      ts.isPropertyAssignment(node)
      && propertyName(node.name)?.startsWith('on') === true
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      add(
        `property:${propertyName(node.name) ?? 'handler'}@${String(lineOf(root, node))}`,
        node.initializer,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return handlers;
}

function setterValue(call: ts.CallExpression, root: ts.SourceFile): string {
  const value = call.arguments[0];
  if (!value) return 'undefined';
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return '<derived>';
  const text = value.getText(root);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function setterWrite(
  call: ts.CallExpression,
  root: ts.SourceFile,
  state: string,
): AnalyzedStateWrite {
  const value = call.arguments[0];
  if (!value || (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value))) {
    return { state, value: setterValue(call, root) };
  }
  const parameter = value.parameters[0]?.name;
  const expression = ts.isBlock(value.body) ? undefined : value.body;
  const togglesParameter = parameter
    && ts.isIdentifier(parameter)
    && expression
    && ts.isPrefixUnaryExpression(expression)
    && expression.operator === ts.SyntaxKind.ExclamationToken
    && ts.isIdentifier(expression.operand)
    && expression.operand.text === parameter.text;
  return {
    state,
    value: '<derived>',
    updater: togglesParameter ? 'toggle' : 'derived',
  };
}

function dispatchEvent(call: ts.CallExpression): string | undefined {
  const value = call.arguments[0];
  if (!value || !ts.isObjectLiteralExpression(value)) return undefined;
  const type = property(value, 'type');
  return type && ts.isStringLiteral(type) ? type.text : undefined;
}

function propertyAccessPath(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (!ts.isPropertyAccessExpression(node)) return undefined;
  const owner = propertyAccessPath(node.expression);
  return owner === undefined ? undefined : `${owner}.${node.name.text}`;
}

function containsCurrentRef(node: ts.Node): boolean {
  if (
    ts.isPropertyAccessExpression(node)
    && node.name.text === 'current'
  ) return true;
  return node.getChildren().some(containsCurrentRef);
}

function isOwnershipGuard(node: ts.Expression): boolean {
  let ownershipEvidence = false;
  const visit = (child: ts.Node): void => {
    if (ts.isBinaryExpression(child) && [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
    ].includes(child.operatorToken.kind) && containsCurrentRef(child)) {
      ownershipEvidence = true;
    }
    if (
      ts.isCallExpression(child)
      && /(?:own|current|generation|match)/iu.test(child.expression.getText())
      && containsCurrentRef(child)
    ) {
      ownershipEvidence = true;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return ownershipEvidence;
}

function analyzeHandler(
  root: ts.SourceFile,
  handler: HandlerNode,
  states: readonly AnalyzedReactState[],
  handlerNames: ReadonlySet<string>,
  derivedReads: ReadonlyMap<string, ReadonlySet<string>>,
): AnalyzedHandler {
  const stateNames = new Set(states.map((state) => state.name));
  const setterOwners = new Map(states.map((state) => [state.setter, state.name]));
  const reads = new Set<string>();
  const writes: AnalyzedStateWrite[] = [];
  const dispatches = new Set<string>();
  const transportCalls = new Set<string>();
  const calls: AnalyzedHandlerCall[] = [];
  const guards = new Set<string>();
  const ownershipGuards = new Set<string>();
  const activeGuards: string[] = [];
  let asynchronous = handler.node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
  ) ?? false;
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText(root);
      guards.add(condition);
      if (isOwnershipGuard(node.expression)) ownershipGuards.add(condition);
      visit(node.expression);
      activeGuards.push(condition);
      visit(node.thenStatement);
      activeGuards.pop();
      if (node.elseStatement) {
        activeGuards.push(`!(${condition})`);
        visit(node.elseStatement);
        activeGuards.pop();
      }
      return;
    }
    if (ts.isIdentifier(node)) {
      if (stateNames.has(node.text)) reads.add(node.text);
      for (const dependency of derivedReads.get(node.text) ?? []) reads.add(dependency);
    }
    if (ts.isAwaitExpression(node)) asynchronous = true;
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression)) {
        const owner = setterOwners.get(expression.text);
        if (owner) {
          const write = setterWrite(node, root, owner);
          writes.push(activeGuards.length === 0
            ? write
            : { ...write, guards: [...activeGuards] });
        }
        if (expression.text.startsWith('dispatch')) {
          const event = dispatchEvent(node);
          if (event) dispatches.add(event);
        }
        if (
          handlerNames.has(expression.text)
          && !calls.some((call) =>
            call.handler === expression.text
            && call.guards.join('\u0000') === activeGuards.join('\u0000'))
        ) {
          calls.push({
            handler: expression.text,
            guards: [...activeGuards],
          });
        }
      }
      if (ts.isPropertyAccessExpression(expression)) {
        const path = propertyAccessPath(expression);
        if (path?.startsWith('transport.') === true) transportCalls.add(path);
        if (['then', 'catch', 'finally'].includes(expression.name.text)) asynchronous = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.node.body);
  return {
    name: handler.name,
    line: lineOf(root, handler.node),
    reads: [...reads].sort(),
    writes,
    dispatches: [...dispatches].sort(),
    transportCalls: [...transportCalls].sort(),
    calls: calls.sort((left, right) =>
      left.handler.localeCompare(right.handler)
      || left.guards.join('\u0000').localeCompare(right.guards.join('\u0000'))),
    guards: [...guards],
    ownershipGuards: [...ownershipGuards],
    asynchronous,
  };
}

function mergeStrings(target: string[], source: readonly string[]): boolean {
  const values = new Set(target);
  const before = values.size;
  for (const value of source) values.add(value);
  if (values.size === before) return false;
  target.splice(0, target.length, ...[...values].sort());
  return true;
}

function mergeHandlerEffects(handlers: AnalyzedHandler[]): AnalyzedHandler[] {
  const byName = new Map(handlers.map((handler) => [handler.name, handler]));
  const merged = handlers.map((handler) => ({
    ...handler,
    reads: [...handler.reads],
    writes: [...handler.writes],
    dispatches: [...handler.dispatches],
    transportCalls: [...handler.transportCalls],
    guards: [...handler.guards],
    ownershipGuards: [...handler.ownershipGuards],
  }));
  const mergedByName = new Map(merged.map((handler) => [handler.name, handler]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const handler of merged) {
      for (const call of handler.calls) {
        const called = mergedByName.get(call.handler) ?? byName.get(call.handler);
        if (!called) continue;
        if (mergeStrings(handler.reads, called.reads)) changed = true;
        if (mergeStrings(handler.dispatches, called.dispatches)) changed = true;
        if (mergeStrings(handler.transportCalls, called.transportCalls)) changed = true;
        if (mergeStrings(handler.guards, called.guards)) changed = true;
        if (mergeStrings(handler.ownershipGuards, called.ownershipGuards)) {
          changed = true;
        }
        for (const calledWrite of called.writes) {
          const write = {
            ...calledWrite,
            guards: [...call.guards, ...(calledWrite.guards ?? [])],
          };
          if (!handler.writes.some(
            (current) =>
              current.state === write.state
              && current.value === write.value
              && current.updater === write.updater
              && (current.guards ?? []).join('\u0000') === write.guards.join('\u0000'),
          )) {
            handler.writes.push(write);
            changed = true;
          }
        }
        if (called.asynchronous && !handler.asynchronous) {
          handler.asynchronous = true;
          changed = true;
        }
      }
    }
  }
  return merged;
}

export function analyzeReactImplementationFile(entry: string): ReactImplementationAnalysis {
  const absoluteEntry = resolve(entry);
  if (!existsSync(absoluteEntry)) throw new Error(`File not found: ${absoluteEntry}`);
  const machines = discoverStateMachines(absoluteEntry);
  const sources = reachableLocalSources(absoluteEntry);
  const text = readFileSync(absoluteEntry, 'utf8');
  const root = ts.createSourceFile(absoluteEntry, text, ts.ScriptTarget.Latest, true);
  const body = componentBody(root);
  if (!body) throw new Error(`No React component found in ${absoluteEntry}.`);
  const states = analyzeReactStates(root, body, machines, namedFiniteDomains(sources));
  const nodes = handlerNodes(root, body);
  const names = new Set(nodes.map((handler) => handler.name));
  const derivedReads = derivedStateReads(body, states);
  const directHandlers = nodes.map((handler) =>
    analyzeHandler(root, handler, states, names, derivedReads));
  const handlers = mergeHandlerEffects(directHandlers);
  const eventMatrix = buildPulseEventMatrix(
    states,
    handlers,
    pulseEventBindings(root, body),
  );
  return {
    entry: absoluteEntry,
    machines,
    states,
    handlers,
    eventMatrix,
    crossProducts: crossProductComponents(states, handlers),
    risks: analysisRisks(states, handlers, directHandlers),
  };
}

export function validateStateMachine(machine: AnalyzedStateMachine): void {
  const states = new Set(Object.keys(machine.states));
  const events = new Set(machine.events);
  if (!states.has(machine.initial)) {
    throw new Error(`${machine.id}: initial state "${machine.initial}" is not defined.`);
  }
  for (const [from, state] of Object.entries(machine.states)) {
    for (const [event, to] of Object.entries(state.on)) {
      if (!events.has(event)) {
        throw new Error(`${machine.id}: "${from}" uses undeclared event "${event}".`);
      }
      if (!states.has(to)) {
        throw new Error(`${machine.id}: "${from}" targets unknown state "${to}".`);
      }
    }
  }
  const reachable = new Set([machine.initial]);
  const pending = [machine.initial];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const target of Object.values(machine.states[current]?.on ?? {})) {
      if (!reachable.has(target)) {
        reachable.add(target);
        pending.push(target);
      }
    }
  }
  const unreachable = [...states].filter((state) => !reachable.has(state));
  if (unreachable.length > 0) {
    throw new Error(`${machine.id}: unreachable states: ${unreachable.join(', ')}.`);
  }
}

export function analyzeStateMachineFile(entry: string): AnalyzedStateMachine[] {
  const absoluteEntry = resolve(entry);
  if (!existsSync(absoluteEntry)) throw new Error(`File not found: ${absoluteEntry}`);
  const machines = discoverStateMachines(absoluteEntry);
  if (machines.length === 0) {
    throw new Error(`No defineStateMachine declaration is reachable from ${absoluteEntry}.`);
  }
  return machines;
}

function discoverStateMachines(absoluteEntry: string): AnalyzedStateMachine[] {
  const machines: AnalyzedStateMachine[] = [];
  for (const [source, text] of reachableLocalSources(absoluteEntry)) {
    machines.push(...analyzeStateMachineSource(text, source));
  }
  const ids = new Set<string>();
  for (const machine of machines) {
    if (ids.has(machine.id)) throw new Error(`Duplicate state machine id: ${machine.id}.`);
    ids.add(machine.id);
    validateStateMachine(machine);
  }
  return machines;
}
