import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  analyzeReactImplementationFile,
  analyzeStateMachineFile,
  implementationAnalysisToMarkdown,
} from '../src/react-state-analysis.ts';
import { analysisRisks } from '../src/state-machine-cross-products.ts';

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) =>
    rm(fixture, { force: true, recursive: true })));
});

async function implementation(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'maximal-react-state-'));
  fixtures.push(root);
  const file = join(root, 'Component.tsx');
  await writeFile(file, source);
  return file;
}

describe('React implementation analysis', () => {
  it('analyzes an exported stateless component and its event bindings', async () => {
    const file = await implementation(`
      export function TextInput(props: { onChange(value: string): void }) {
        return (
          <input
            onChange={(event) => props.onChange(event.currentTarget.value)}
          />
        );
      }
    `);

    const analysis = analyzeReactImplementationFile(file);

    expect(analysis.states).toEqual([]);
    expect(analysis.eventMatrix.bindings).toEqual([
      expect.objectContaining({
        event: 'change',
        target: 'input',
      }),
    ]);
    expect(analysis.eventMatrix.opaqueBindings).toEqual([
      expect.objectContaining({
        event: 'change',
        target: 'input',
      }),
    ]);
  });

  it('prefers the stateful component when a file also declares JSX helpers', async () => {
    const file = await implementation(`
      import { useState } from 'react';

      function Label() {
        return <span>Count</span>;
      }

      export const Counter = () => {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(count + 1)}><Label />{count}</button>;
      };
    `);

    const analysis = analyzeReactImplementationFile(file);

    expect(analysis.states).toEqual([
      expect.objectContaining({ name: 'count' }),
    ]);
  });

  it('supports function expressions and rejects lowercase JSX helpers', async () => {
    const componentFile = await implementation(`
      export const TextInput = function () {
        return <input />;
      };
    `);
    const helperFile = await implementation(`
      const notAComponent = () => {
        return <span>Label</span>;
      };
      export function Value() {
        return notAComponent();
      }
    `);
    const anonymousFile = await implementation(`
      export default function () {
        return <input />;
      }
    `);

    expect(analyzeReactImplementationFile(componentFile).states).toEqual([]);
    expect(() => analyzeReactImplementationFile(helperFile)).toThrow(
      'No React component found',
    );
    expect(() => analyzeReactImplementationFile(anonymousFile)).toThrow(
      'No React component found',
    );
  });

  it('recognizes useReducer when preferring a stateful component', async () => {
    const file = await implementation(`
      import { useReducer } from 'react';

      function Label() {
        return <span>Count</span>;
      }

      export function Counter() {
        const [count, dispatch] = useReducer((value: number) => value + 1, 0);
        return <button onClick={() => dispatch()}><Label />{count}</button>;
      }
    `);

    expect(analyzeReactImplementationFile(file).states).toEqual([
      expect.objectContaining({ hook: 'useReducer', name: 'count' }),
    ]);
  });

  it('does not classify ownership-guarded control calls as operation blind', () => {
    const handler = {
      name: 'decide',
      line: 1,
      reads: [],
      writes: [],
      dispatches: [],
      transportCalls: ['transport.approve'],
      calls: [],
      guards: ['!matchesOwnership(active.current, request.runId)'],
      ownershipGuards: ['!matchesOwnership(active.current, request.runId)'],
      asynchronous: true,
    };
    const states = [{
      name: 'operation',
      setter: 'dispatchOperation',
      hook: 'useReducer' as const,
      initial: 'idle',
      domain: ['idle', 'running'],
      line: 1,
    }];

    expect(analysisRisks(states, [handler], [handler])).toEqual([]);
  });

  it('recognizes ref-based ownership guards on external event writers', async () => {
    const file = await implementation(`
      import { useRef, useState } from 'react';

      export function Stream() {
        const [answer, setAnswer] = useState('');
        const [tools, setTools] = useState<string[]>([]);
        const [operation] = useState<'idle' | 'running'>('idle');
        const activeRunId = useRef<string>();
        const decide = (event) => {
          if (!matchesOwnership(activeRunId.current, event.runId)) return;
          transport.approve(event);
        };
        const dismiss = () => {
          transport.hide();
        };
        useTransportEvent(transport.onDelta, (event) => {
          if (!matchesOwnership(activeRunId.current, event.runId)) return;
          setAnswer((current) => current + event.text);
        });
        useTransportEvent(transport.onTool, (event) => {
          setTools((current) => [...current, event.name]);
        });
        useTransportEvent(transport.onApproval, (event) => {
          if (activeRunId.current !== event.runId) return;
          transport.approve(event);
          setTools((current) => [...current, event.tool]);
        });
        useTransportEvent(transport.onEnd, (event) => {
          if (activeRunId.current && event.ok === true) {
            setAnswer('not ownership guarded');
          }
        });
        useTransportEvent(transport.onStatus, (event) => {
          if (!matchesOwnership(event.owner.value, event.runId)) return;
          setAnswer(event.text);
        });
        return (
          <output onClick={decide} onDoubleClick={dismiss}>
            {answer}{tools.join(',')}{operation}
          </output>
        );
      }
    `);

    const analysis = analyzeReactImplementationFile(file);
    const guarded = analysis.handlers.find(
      (handler) => handler.name === 'transport.onDelta',
    );

    expect(guarded?.ownershipGuards).toEqual([
      '!matchesOwnership(activeRunId.current, event.runId)',
    ]);
    expect(analysis.handlers.find(
      (handler) => handler.name === 'transport.onApproval',
    )?.ownershipGuards).toEqual([
      'activeRunId.current !== event.runId',
    ]);
    expect(analysis.handlers.find(
      (handler) => handler.name === 'transport.onEnd',
    )?.ownershipGuards).toEqual([]);
    expect(analysis.handlers.find(
      (handler) => handler.name === 'transport.onStatus',
    )?.ownershipGuards).toEqual([]);
    expect(analysis.risks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'external-event-without-operation-guard',
        handlers: ['transport.onDelta'],
      }),
    ]));
    expect(analysis.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'external-event-without-operation-guard',
        handlers: ['transport.onTool'],
      }),
    ]));
    expect(analysis.risks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'operation-blind-transport',
        handlers: ['decide'],
      }),
      expect.objectContaining({
        kind: 'operation-blind-transport',
        handlers: ['transport.onApproval'],
      }),
    ]));
    expect(implementationAnalysisToMarkdown(analysis)).toContain(
      'Ownership-guarded handlers: 3',
    );
  });

  it('analyzes an arbitrary stateful component without an explicit machine', async () => {
    const file = await implementation(`
      import { useState } from 'react';

      export function Toggle() {
        const [open, setOpen] = useState(false);
        const toggle = () => setOpen((current) => !current);
        return <button aria-expanded={open} onClick={toggle}>Toggle</button>;
      }
    `);

    const analysis = analyzeReactImplementationFile(file);

    expect(analysis.machines).toEqual([]);
    expect(analysis.states).toEqual([
      expect.objectContaining({
        name: 'open',
        domain: ['false', 'true'],
      }),
    ]);
    expect(analysis.handlers).toEqual([
      expect.objectContaining({
        name: 'toggle',
        writes: [{ state: 'open', value: '<derived>', updater: 'toggle' }],
      }),
    ]);
    expect(analysis.eventMatrix.bindings).toEqual([
      expect.objectContaining({
        event: 'click',
        reactProp: 'onClick',
        target: 'button',
        handler: 'toggle',
      }),
    ]);
    expect(analysis.eventMatrix.cells).toEqual([
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
    ]);
    expect(() => analyzeStateMachineFile(file)).toThrow(
      'No defineStateMachine declaration is reachable',
    );
  });

  it('maps named and inline JSX browser events to state responses', async () => {
    const file = await implementation(`
      import { useState } from 'react';

      export function Controls(props: { onEscape(): void }) {
        const [mode, setMode] = useState<'idle' | 'busy'>('idle');
        const commit = () => setMode('busy');
        const start = async (event: React.MouseEvent) => {
          if (mode === 'idle' && event.type === 'click') {
            commit();
            await transport.ask();
          }
        };
        return (
          <section>
            <button aria-label="Start" onClick={start}>Start</button>
            <input
              name="command"
              onKeyDownCapture={(event) => {
                if (event.key === 'Escape') props.onEscape();
              }}
            />
          </section>
        );
      }
    `);

    const analysis = analyzeReactImplementationFile(file);

    expect(analysis.eventMatrix.bindings).toEqual([
      expect.objectContaining({
        event: 'click',
        target: 'button[aria-label="Start"]',
        handler: 'start',
      }),
      expect.objectContaining({
        event: 'keydown',
        reactProp: 'onKeyDownCapture',
        target: 'input[name="command"]',
      }),
    ]);
    expect(analysis.eventMatrix.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'click',
        start: { mode: 'idle' },
        transitions: [{
          state: 'mode',
          from: 'idle',
          to: 'busy',
          resolution: 'exact',
          guards: ["mode === 'idle' && event.type === 'click'"],
          applicability: 'conditional',
        }],
        transportCalls: ['transport.ask'],
        asynchronous: true,
      }),
    ]));
    expect(analysis.eventMatrix.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'click',
        start: { mode: 'busy' },
        transitions: [
          expect.objectContaining({
            state: 'mode',
            applicability: 'blocked',
          }),
        ],
      }),
    ]));
    expect(analysis.eventMatrix.unresolvedBindings).toEqual([]);
    expect(analysis.eventMatrix.opaqueBindings).toEqual([
      expect.objectContaining({
        event: 'keydown',
        reactProp: 'onKeyDownCapture',
      }),
    ]);
    expect(implementationAnalysisToMarkdown(analysis)).toContain(
      '## Browser event-response matrix',
    );
  });

  it('reports event bindings that cannot be resolved to local handlers', async () => {
    const file = await implementation(`
      import { useState } from 'react';

      export function Delegated(props: { onActivate(): void }) {
        const [ready] = useState(false);
        return <button onClick={props.onActivate}>{String(ready)}</button>;
      }
    `);

    const analysis = analyzeReactImplementationFile(file);

    expect(analysis.eventMatrix.cells).toEqual([]);
    expect(analysis.eventMatrix.unresolvedBindings).toEqual([
      expect.objectContaining({
        event: 'click',
        handler: 'props.onActivate',
      }),
    ]);
    expect(analysis.eventMatrix.opaqueBindings).toEqual([]);
  });

  it('bounds event vectors and reports every omitted response cell', async () => {
    const file = await implementation(`
      import { useState } from 'react';

      export function ManyStates() {
        const [a, setA] = useState(false);
        const [b, setB] = useState(false);
        const [c, setC] = useState(false);
        const [d, setD] = useState(false);
        const [e, setE] = useState(false);
        const respond = () => {
          if (a && b && c && d && e) setA(false);
        };
        return (
          <button
            onClick={respond}
            data-setters={String([setB, setC, setD, setE])}
          >
            Respond
          </button>
        );
      }
    `);

    const matrix = analyzeReactImplementationFile(file).eventMatrix;

    expect(matrix.theoreticalCellCount).toBe(32);
    expect(matrix.cells).toHaveLength(16);
    expect(matrix.omittedCellCount).toBe(16);
    for (const state of ['a', 'b', 'c', 'd', 'e']) {
      expect(new Set(matrix.cells.map((cell) => cell.start[state]))).toEqual(
        new Set(['false', 'true']),
      );
    }
  });
});
