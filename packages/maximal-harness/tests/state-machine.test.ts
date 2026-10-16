import { describe, expect, it } from 'vitest';

import { defineStateMachine } from '../src/renderer/state-machine.js';

describe('defineStateMachine', () => {
  it('escapes Graphviz identifiers and labels', () => {
    const machine = defineStateMachine({
      id: 'quoted "machine"',
      initial: 'idle\\waiting',
      events: ['say "go"'],
      states: {
        'idle\\waiting': { on: { 'say "go"': 'running' } },
        running: {},
      },
    });

    expect(machine.transition('idle\\waiting', 'say "go"')).toBe('running');
    expect(machine.transition('running', 'say "go"')).toBe('running');
    expect(machine.toDot()).toContain(
      'digraph "quoted \\"machine\\""',
    );
    expect(machine.toDot()).toContain(
      '"idle\\\\waiting" -> "running" [label="say \\"go\\""]',
    );
  });
});
