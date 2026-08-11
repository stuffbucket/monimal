/**
 * Types for `publish-decision.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program. This declaration exists so the unit tests keep their types without
 * dragging the script into a build step.
 */

export type Mode = 'publish' | 'rehearse';
export type RegistryState = 'present' | 'absent' | 'unreadable';
export type Action = 'publish' | 'already-published' | 'rehearse' | 'refuse';

export interface RegistryAnswer {
  code: number;
  stdout?: string;
  stderr?: string;
  version: string;
}

export interface Registry {
  state: string;
  detail?: string;
}

export interface Decision {
  action: Action;
  reason: string;
}

export interface Outcome {
  action: string;
  name: string;
  version: string;
  registry: string;
  reason?: string;
}

export declare const MODES: string[];
export declare const REGISTRY_STATES: string[];
export declare function isVersionConflict(text: unknown): boolean;
export declare function registryStateFrom(answer: RegistryAnswer): {
  state: RegistryState;
  detail: string;
};
export declare function decidePublish(facts: {
  mode: unknown;
  refType: unknown;
  registry: Registry;
}): Decision;
export declare function renderOutcome(outcome: Outcome): string;
export declare function isFailure(action: string): boolean;
export declare function publishArguments(call: {
  file: unknown;
  registry: string;
  dryRun: boolean;
}): string[];
