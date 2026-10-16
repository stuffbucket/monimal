export {
  analyzeReactImplementationFile,
  analyzeStateMachineFile,
  analyzeStateMachineSource,
  implementationAnalysisToMarkdown,
  stateMachinesToDot,
  validateStateMachine,
} from './react-state-analysis.ts';
export {
  browserEventForReactProp,
  buildPulseEventMatrix,
} from './pulse-event-matrix.ts';

export type {
  AnalysisRisk,
  AnalyzedHandler,
  AnalyzedReactState,
  AnalyzedStateMachine,
  CrossProductComponent,
  ReactImplementationAnalysis,
} from './react-state-analysis.ts';
