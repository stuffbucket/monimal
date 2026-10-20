import { defineStateMachine } from './state-machine.js';

export const overlayOperationMachine = defineStateMachine({
  id: 'overlay-operation',
  initial: 'idle',
  events: [
    'submit',
    'request-accepted',
    'request-rejected',
    'abort',
    'abort-failed',
    'end',
  ],
  states: {
    idle: {
      on: { submit: 'starting' },
    },
    starting: {
      on: {
        'request-accepted': 'running',
        'request-rejected': 'idle',
        abort: 'aborting:starting',
        end: 'idle',
      },
    },
    running: {
      on: {
        abort: 'aborting:running',
        end: 'idle',
      },
    },
    'aborting:starting': {
      on: {
        'request-accepted': 'aborting:running',
        'request-rejected': 'idle',
        'abort-failed': 'starting',
        end: 'idle',
      },
    },
    'aborting:running': {
      on: {
        'abort-failed': 'running',
        end: 'idle',
      },
    },
  },
});

export type OverlayOperationState =
  keyof typeof overlayOperationMachine.definition.states;
export type OverlayOperationEvent =
  (typeof overlayOperationMachine.definition.events)[number];

export const INITIAL_OVERLAY_OPERATION_STATE = overlayOperationMachine.definition.initial;

export function overlayOperationTransition(
  state: OverlayOperationState,
  event: { type: OverlayOperationEvent },
): OverlayOperationState {
  return overlayOperationMachine.transition(state, event.type);
}

export function overlayOperationIsBusy(state: OverlayOperationState): boolean {
  return state !== 'idle';
}

export function overlayOperationCanSubmit(state: OverlayOperationState): boolean {
  return state === 'idle' || state === 'running';
}

export function overlayOperationCanSwitchChat(state: OverlayOperationState): boolean {
  return state === 'idle';
}
