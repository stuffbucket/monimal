import { describe, expect, it } from 'vitest';

import {
  INITIAL_OVERLAY_OPERATION_STATE,
  overlayOperationCanSubmit,
  overlayOperationCanSwitchChat,
  overlayOperationIsBusy,
  overlayOperationMachine,
  overlayOperationTransition,
  type OverlayOperationState,
} from '../src/renderer/overlay-operation.js';

const STATES = Object.keys(
  overlayOperationMachine.definition.states,
) as OverlayOperationState[];
const EVENTS = overlayOperationMachine.definition.events;

describe('overlay operation state machine', () => {
  it('enumerates the complete reachable transition graph', () => {
    expect(overlayOperationMachine.edges()).toEqual([
      { from: 'idle', event: 'submit', to: 'starting' },
      { from: 'starting', event: 'request-accepted', to: 'running' },
      { from: 'starting', event: 'request-rejected', to: 'idle' },
      { from: 'starting', event: 'abort', to: 'aborting:starting' },
      { from: 'starting', event: 'end', to: 'idle' },
      { from: 'running', event: 'abort', to: 'aborting:running' },
      { from: 'running', event: 'end', to: 'idle' },
      { from: 'aborting:starting', event: 'request-accepted', to: 'aborting:running' },
      { from: 'aborting:starting', event: 'request-rejected', to: 'idle' },
      { from: 'aborting:starting', event: 'abort-failed', to: 'starting' },
      { from: 'aborting:starting', event: 'end', to: 'idle' },
      { from: 'aborting:running', event: 'abort-failed', to: 'running' },
      { from: 'aborting:running', event: 'end', to: 'idle' },
    ]);
  });

  it('keeps every event inside the finite graph', () => {
    const states = new Set(STATES);
    for (const state of STATES) {
      for (const type of EVENTS) {
        expect(states.has(overlayOperationTransition(state, { type }))).toBe(true);
      }
    }
  });

  it('ignores events absent from the current state definition', () => {
    for (const state of STATES) {
      for (const type of EVENTS) {
        if (overlayOperationMachine.definition.states[state].on?.[type] === undefined) {
          expect(overlayOperationTransition(state, { type })).toBe(state);
        }
      }
    }
  });

  it('permits chat changes only while no operation can emit conversation events', () => {
    for (const state of STATES) {
      expect(overlayOperationCanSwitchChat(state)).toBe(state === 'idle');
    }
  });

  it('does not accept new work while a request starts or aborts', () => {
    for (const state of STATES) {
      expect(overlayOperationCanSubmit(state)).toBe(
        state === 'idle' || state === 'running',
      );
    }
  });

  it('remains busy until the operation ends or its start is rejected', () => {
    expect(overlayOperationIsBusy(INITIAL_OVERLAY_OPERATION_STATE)).toBe(false);
    for (const state of STATES.slice(1)) {
      expect(overlayOperationIsBusy(state)).toBe(true);
    }
  });

  it('renders a Graphviz map from the same transition authority', () => {
    expect(overlayOperationMachine.toDot()).toBe(`digraph "overlay-operation" {
  rankdir=LR;
  "idle" [shape=doublecircle];
  "idle" -> "starting" [label="submit"];
  "starting" -> "running" [label="request-accepted"];
  "starting" -> "idle" [label="request-rejected"];
  "starting" -> "aborting:starting" [label="abort"];
  "starting" -> "idle" [label="end"];
  "running" -> "aborting:running" [label="abort"];
  "running" -> "idle" [label="end"];
  "aborting:starting" -> "aborting:running" [label="request-accepted"];
  "aborting:starting" -> "idle" [label="request-rejected"];
  "aborting:starting" -> "starting" [label="abort-failed"];
  "aborting:starting" -> "idle" [label="end"];
  "aborting:running" -> "running" [label="abort-failed"];
  "aborting:running" -> "idle" [label="end"];
}
`);
  });
});
