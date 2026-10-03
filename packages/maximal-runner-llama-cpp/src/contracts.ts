export type ModelProgress =
  | { state: 'absent' }
  | { state: 'downloading'; received: number; total: number }
  | { state: 'ready' }
  | { state: 'error'; reason: string }
