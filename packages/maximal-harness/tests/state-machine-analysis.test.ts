import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeReactImplementationFile,
  analyzeStateMachineFile,
  analyzeStateMachineSource,
  implementationAnalysisToMarkdown,
  stateMachinesToDot,
  validateStateMachine,
} from '@maximal/maximal-design-system-tools/react-state';

describe('state-machine file analyzer', () => {
  it('discovers machines through an implementation file and its local imports', () => {
    const implementation = resolve(import.meta.dirname, '../src/renderer/Overlay.tsx');
    const machines = analyzeStateMachineFile(implementation);

    expect(machines).toHaveLength(1);
    expect(machines[0]).toMatchObject({
      id: 'overlay-operation',
      initial: 'idle',
      events: ['submit', 'request-accepted', 'request-rejected', 'abort', 'abort-failed', 'end'],
    });
    expect(stateMachinesToDot(machines)).toContain(
      '"aborting:running" -> "idle" [label="end"]',
    );
  });

  it('derives React state, handlers, async paths, and coupled cross-products', () => {
    const implementation = resolve(import.meta.dirname, '../src/renderer/Overlay.tsx');
    const analysis = analyzeReactImplementationFile(implementation);

    expect(analysis.states.find((state) => state.name === 'operation')?.domain).toEqual([
        'idle',
        'starting',
        'running',
        'aborting:starting',
        'aborting:running',
    ]);
    expect(analysis.states.find((state) => state.name === 'status')?.domain).toEqual([
        'probing',
        'ready',
        'select-model',
        'needs-model',
        'unavailable',
    ]);
    const submit = analysis.handlers.find((handler) => handler.name === 'submit');
    expect(submit?.asynchronous).toBe(true);
    expect(submit?.dispatches).toEqual(
      expect.arrayContaining(['submit', 'request-accepted', 'request-rejected']),
    );
    expect(submit?.transportCalls).toEqual(
      expect.arrayContaining(['transport.ask', 'transport.steer']),
    );
    expect(analysis.handlers.find((handler) => handler.name === 'onEscape')?.reads)
      .toContain('operation');
    expect(analysis.crossProducts.some((product) =>
      product.states.includes('activeChatId')
      && product.states.includes('terminalConfirmation')
      && product.finiteLowerBound > 1
    )).toBe(true);
    expect(analysis.handlers.find(
      (handler) => handler.name === 'transport.onDelta',
    )?.ownershipGuards).toEqual([
      '!matchesOwnership(activeRunId.current, event.runId)',
    ]);
    expect(analysis.risks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'external-event-without-operation-guard',
        handlers: ['transport.onDelta'],
      }),
    ]));
    expect(analysis.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'independently-writable-coupling',
        states: ['activeChatId', 'terminalConfirmation'],
      }),
    ]));
    expect(implementationAnalysisToMarkdown(analysis)).toContain(
      '## Asynchronous transport paths',
    );
  });

  it('parses only explicit machine declarations', () => {
    expect(analyzeStateMachineSource(`
      const ignored = { initial: 'idle' };
      export const machine = defineStateMachine({
        id: 'small',
        initial: 'idle',
        events: ['start'],
        states: {
          idle: { on: { start: 'running' } },
          running: {},
        },
      });
    `)).toEqual([{
      id: 'small',
      source: '<source>',
      initial: 'idle',
      events: ['start'],
      states: {
        idle: { on: { start: 'running' } },
        running: { on: {} },
      },
    }]);
  });

  it('rejects unknown targets, undeclared events, and unreachable states', () => {
    expect(() => validateStateMachine({
      id: 'unknown-target',
      source: '<source>',
      initial: 'idle',
      events: ['start'],
      states: { idle: { on: { start: 'missing' } } },
    })).toThrow('targets unknown state "missing"');
    expect(() => validateStateMachine({
      id: 'unknown-event',
      source: '<source>',
      initial: 'idle',
      events: [],
      states: { idle: { on: { start: 'idle' } } },
    })).toThrow('uses undeclared event "start"');
    expect(() => validateStateMachine({
      id: 'unreachable',
      source: '<source>',
      initial: 'idle',
      events: [],
      states: {
        idle: { on: {} },
        stranded: { on: {} },
      },
    })).toThrow('unreachable states: stranded');
  });
});
