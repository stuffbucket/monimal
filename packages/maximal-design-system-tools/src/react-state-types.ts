export interface AnalyzedStateMachine {
  id: string;
  source: string;
  initial: string;
  events: string[];
  states: Record<string, { on: Record<string, string> }>;
}

export interface AnalyzedReactState {
  name: string;
  setter: string;
  hook: 'useState' | 'useReducer';
  initial: string;
  domain?: string[];
  line: number;
}

export interface AnalyzedStateWrite {
  state: string;
  value: string;
  updater?: 'toggle' | 'derived';
  guards?: string[];
}

export interface AnalyzedHandlerCall {
  handler: string;
  guards: string[];
}

export interface AnalyzedHandler {
  name: string;
  line: number;
  reads: string[];
  writes: AnalyzedStateWrite[];
  dispatches: string[];
  transportCalls: string[];
  calls: AnalyzedHandlerCall[];
  guards: string[];
  ownershipGuards: string[];
  asynchronous: boolean;
}

export interface PulseEventBinding {
  event: string;
  reactProp: string;
  target: string;
  line: number;
  handler: string;
}

export interface PulseStateTransition {
  state: string;
  from: string;
  to: string;
  resolution: 'exact' | 'toggle' | 'derived' | 'open';
  guards: string[];
  applicability: 'reachable' | 'blocked' | 'conditional';
}

export interface PulseResponseCell {
  event: string;
  reactProp: string;
  target: string;
  line: number;
  handler: string;
  start: Record<string, string>;
  transitions: PulseStateTransition[];
  dispatches: string[];
  transportCalls: string[];
  guards: string[];
  asynchronous: boolean;
}

export interface PulseEventMatrix {
  bindings: PulseEventBinding[];
  cells: PulseResponseCell[];
  theoreticalCellCount: number;
  omittedCellCount: number;
  unresolvedBindings: PulseEventBinding[];
  opaqueBindings: PulseEventBinding[];
}

export interface CrossProductComponent {
  states: string[];
  finiteCardinality?: number;
  finiteLowerBound: number;
  openDomains: string[];
}

export interface AnalysisRisk {
  kind:
    | 'async-write-collision'
    | 'external-event-without-operation-guard'
    | 'operation-blind-transport'
    | 'independently-writable-coupling';
  handlers: string[];
  states: string[];
  detail: string;
}

export interface ReactImplementationAnalysis {
  entry: string;
  machines: AnalyzedStateMachine[];
  states: AnalyzedReactState[];
  handlers: AnalyzedHandler[];
  eventMatrix: PulseEventMatrix;
  crossProducts: CrossProductComponent[];
  risks: AnalysisRisk[];
}
