import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  browserEventForReactProp,
  buildPulseEventMatrix,
} from '../src/pulse-event-matrix.ts';
import { pulseEventBindings } from '../src/pulse-jsx-events.ts';
import type {
  AnalyzedHandler,
  AnalyzedReactState,
  AnalyzedStateWrite,
  PulseEventBinding,
} from '../src/react-state-types.ts';

function state(
  name: string,
  domain?: string[],
): AnalyzedReactState {
  return {
    name,
    setter: `set${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`,
    hook: 'useState',
    initial: domain?.[0] ?? 'initialValue',
    ...(domain === undefined ? {} : { domain }),
    line: 1,
  };
}

function handler(
  name: string,
  writes: AnalyzedStateWrite[] = [],
  reads: string[] = [],
): AnalyzedHandler {
  return {
    name,
    line: 1,
    reads,
    writes,
    dispatches: [],
    transportCalls: [],
    calls: [],
    guards: [],
    ownershipGuards: [],
    asynchronous: false,
  };
}

function binding(handlerName: string, line = 1): PulseEventBinding {
  return {
    event: 'click',
    reactProp: 'onClick',
    target: 'button',
    line,
    handler: handlerName,
  };
}

describe('Pulse event matrix', () => {
  it('maps React capture props to browser events', () => {
    expect(browserEventForReactProp('onKeyDownCapture')).toBe('keydown');
    expect(browserEventForReactProp('onDoubleClick')).toBe('dblclick');
    expect(browserEventForReactProp('onMadeUp')).toBeUndefined();
  });

  it('enumerates both directions of a boolean toggle exactly', () => {
    const matrix = buildPulseEventMatrix(
      [
        state('open', ['false', 'true']),
        state('unrelated', ['first', 'second', 'third']),
      ],
      [handler('toggle', [{
        state: 'open',
        value: '<derived>',
        updater: 'toggle',
      }])],
      [binding('toggle')],
    );

    expect(matrix).toEqual({
      bindings: [binding('toggle')],
      cells: [
        expect.objectContaining({
          start: { open: 'false' },
          transitions: [{
            state: 'open',
            from: 'false',
            to: 'true',
            resolution: 'toggle',
            guards: [],
            applicability: 'reachable',
          }],
        }),
        expect.objectContaining({
          start: { open: 'true' },
          transitions: [{
            state: 'open',
            from: 'true',
            to: 'false',
            resolution: 'toggle',
            guards: [],
            applicability: 'reachable',
          }],
        }),
      ],
      theoreticalCellCount: 2,
      omittedCellCount: 0,
      unresolvedBindings: [],
      opaqueBindings: [],
    });
  });

  it('abstracts literal, derived, absent, collection, and open writes', () => {
    const states = [
      state('mode', ['idle', 'busy']),
      state('text', ['empty', 'nonempty']),
      state('items', ['empty', 'nonempty']),
      state('selection', ['absent', 'present']),
      state('result'),
      state('derived', ['false', 'true']),
      state('emptyItems', ['empty', 'nonempty']),
      state('singleQuoted', ['empty', 'nonempty']),
      state('doubleQuoted', ['empty', 'nonempty']),
      state('templateQuoted', ['empty', 'nonempty']),
      state('malformedQuoted', ['empty', 'nonempty']),
      state('malformedDoubleQuoted', ['empty', 'nonempty']),
      state('malformedTemplateQuoted', ['empty', 'nonempty']),
    ];
    const writes: AnalyzedStateWrite[] = [
      { state: 'mode', value: "'busy'" },
      { state: 'text', value: "''" },
      { state: 'items', value: '[item]' },
      { state: 'selection', value: 'undefined' },
      { state: 'result', value: 'nextValue' },
      { state: 'derived', value: '<derived>', updater: 'derived' },
      { state: 'emptyItems', value: '[]' },
      { state: 'ghost', value: 'externalValue' },
      { state: 'singleQuoted', value: "'value'" },
      { state: 'doubleQuoted', value: '"value"' },
      { state: 'templateQuoted', value: '`value`' },
      { state: 'malformedQuoted', value: "value'" },
      { state: 'malformedDoubleQuoted', value: 'value"' },
      { state: 'malformedTemplateQuoted', value: 'value`' },
    ];
    const matrix = buildPulseEventMatrix(
      states,
      [handler('respond', writes)],
      [binding('respond')],
    );
    const first = matrix.cells[0];

    expect(first?.transitions.map(({ state: name, to, resolution }) =>
      ({ name, to, resolution }))).toEqual([
      { name: 'mode', to: 'busy', resolution: 'exact' },
      { name: 'text', to: 'empty', resolution: 'exact' },
      { name: 'items', to: 'nonempty', resolution: 'exact' },
      { name: 'selection', to: 'absent', resolution: 'exact' },
      { name: 'result', to: 'nextValue', resolution: 'open' },
      { name: 'derived', to: '?', resolution: 'derived' },
      { name: 'emptyItems', to: 'empty', resolution: 'exact' },
      { name: 'ghost', to: 'externalValue', resolution: 'open' },
      { name: 'singleQuoted', to: 'nonempty', resolution: 'exact' },
      { name: 'doubleQuoted', to: 'nonempty', resolution: 'exact' },
      { name: 'templateQuoted', to: 'nonempty', resolution: 'exact' },
      { name: 'malformedQuoted', to: '?', resolution: 'derived' },
      { name: 'malformedDoubleQuoted', to: '?', resolution: 'derived' },
      { name: 'malformedTemplateQuoted', to: '?', resolution: 'derived' },
    ]);
  });

  it('does not over-abstract literals outside a state domain', () => {
    const matrix = buildPulseEventMatrix(
      [
        state('mode', ['idle', 'busy']),
        state('optional', ['absent', 'present']),
        state('collection', ['empty', 'nonempty']),
        state('required', ['present', 'other']),
        state('nonemptyOnly', ['nonempty', 'other']),
      ],
      [handler('respond', [
        { state: 'mode', value: "'other'" },
        { state: 'optional', value: 'null' },
        { state: 'collection', value: '42' },
        { state: 'required', value: 'null' },
        { state: 'nonemptyOnly', value: "''" },
      ])],
      [binding('respond')],
    );

    expect(matrix.cells[0]?.transitions.map(({ state: name, to, resolution }) =>
      ({ name, to, resolution }))).toEqual([
      { name: 'mode', to: '?', resolution: 'derived' },
      { name: 'optional', to: 'absent', resolution: 'exact' },
      { name: 'collection', to: '?', resolution: 'derived' },
      { name: 'required', to: '?', resolution: 'derived' },
      { name: 'nonemptyOnly', to: '?', resolution: 'derived' },
    ]);
  });

  it('classifies state guards as reachable, blocked, or conditional', () => {
    const guarded = handler('start', [{
      state: 'mode',
      value: "'busy'",
      guards: ["mode === 'idle' && event.type === 'click'"],
    }], ['mode']);
    const matrix = buildPulseEventMatrix(
      [state('mode', ['idle', 'busy'])],
      [guarded],
      [binding('start')],
    );

    expect(matrix.cells.map((cell) => ({
      start: cell.start,
      applicability: cell.transitions[0]?.applicability,
    }))).toEqual([
      { start: { mode: 'idle' }, applicability: 'conditional' },
      { start: { mode: 'busy' }, applicability: 'blocked' },
    ]);
  });

  it('separates unresolved and opaque bindings', () => {
    const opaque = handler('prevent');
    const dispatching = { ...handler('dispatching'), dispatches: ['SAVE'] };
    const transporting = { ...handler('transporting'), transportCalls: ['transport.save'] };
    const matrix = buildPulseEventMatrix(
      [],
      [opaque, dispatching, transporting],
      [
        binding('missing', 1),
        binding('prevent', 2),
        binding('dispatching', 3),
        binding('transporting', 4),
      ],
    );

    expect(matrix.unresolvedBindings).toEqual([binding('missing', 1)]);
    expect(matrix.opaqueBindings).toEqual([binding('prevent', 2)]);
    expect(matrix.cells).toHaveLength(3);
    expect(matrix.cells[0]).toEqual(expect.objectContaining({
      line: 2,
      handler: 'prevent',
      start: {},
      transitions: [],
    }));
  });

  it('enforces the global matrix bound across event bindings', () => {
    const states = ['a', 'b', 'c', 'd', 'e'].map((name) =>
      state(name, ['false', 'true']));
    const respond = handler(
      'respond',
      [{ state: 'a', value: 'true' }],
      states.map((candidate) => candidate.name),
    );
    const bindings = Array.from({ length: 20 }, (_, index) =>
      binding('respond', index + 1));

    const matrix = buildPulseEventMatrix(states, [respond], bindings);

    expect(matrix.theoreticalCellCount).toBe(640);
    expect(matrix.cells).toHaveLength(256);
    expect(matrix.omittedCellCount).toBe(384);
    expect(matrix.cells.every((cell) =>
      Object.keys(cell.start).length === states.length)).toBe(true);
  });

  it('extracts named, inline, qualified, and delegated JSX stimuli', () => {
    const source = ts.createSourceFile(
      'Component.tsx',
      `
        function Component(props: { act(): void }) {
          return (
            <section>
              <button className="primary action" type="button" aria-label="Save" onClick={save}>
                Save
              </button>
              <input name="query" onKeyDownCapture={() => submit()} />
              <Button data-testid="delegate" onClick={props.act} />
              <div onMadeUp={() => undefined} />
            </section>
          );
        }
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const component = source.statements.find(ts.isFunctionDeclaration);
    if (!component?.body) throw new Error('Fixture component body was not parsed.');

    expect(pulseEventBindings(source, component.body)).toEqual([
      expect.objectContaining({
        event: 'click',
        target: 'button.primary.action[type="button"][aria-label="Save"]',
        handler: 'save',
      }),
      expect.objectContaining({
        event: 'keydown',
        reactProp: 'onKeyDownCapture',
        target: 'input[name="query"]',
        handler: expect.stringMatching(/^jsx:onKeyDownCapture@\d+$/u),
      }),
      expect.objectContaining({
        event: 'click',
        target: 'Button[data-testid="delegate"]',
        handler: 'props.act',
      }),
    ]);
  });
});
