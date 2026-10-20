import type { Page } from '@playwright/test';

import type {
  PulseEventBinding,
  ReactImplementationAnalysis,
} from './react-state-types.ts';

export interface PulseBrowserObservation {
  state: string;
  story?: string;
  reason?: string;
  comparison?: string;
  changed?: boolean;
}

export interface PulseBrowserAnalysis {
  state: 'complete' | 'unavailable';
  reason?: string;
  catalog?: string;
  storyFiles: string[];
  stories: string[];
  probes: Array<{
    binding: PulseEventBinding;
    prediction: {
      kind: 'opaque' | 'response' | 'none';
      possibleTransitions: number;
      effects: string[];
    };
    observations: PulseBrowserObservation[];
  }>;
}

export function discoverPulseStoryFiles(entry: string): Promise<string[]>;
export function discoverPulseCatalogRoots(entry: string): Promise<string[]>;
export function comparePulseObservation(
  prediction: 'opaque' | 'response' | 'none',
  changed: boolean,
  errors?: string[],
): string;
export function confirmPulseCandidate(comparisons: string[]): string | undefined;
export function probePulseBindingOnPage(
  page: Page,
  binding: PulseEventBinding,
  payload: Record<string, unknown>,
  prediction: { kind: 'opaque' | 'response' | 'none' },
): Promise<PulseBrowserObservation>;
export function runPulseBrowserAnalysis(
  entry: string,
  analysis: ReactImplementationAnalysis,
): Promise<PulseBrowserAnalysis>;
export function pulseCorrectnessCandidates(
  runtime: PulseBrowserAnalysis,
): Array<{
  binding: PulseEventBinding;
  observation: PulseBrowserObservation;
}>;
export function pulseBrowserAnalysisToMarkdown(
  runtime: PulseBrowserAnalysis,
): string;
