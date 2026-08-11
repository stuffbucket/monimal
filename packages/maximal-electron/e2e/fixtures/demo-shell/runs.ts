/**
 * Demo fixtures: a fleet of coding agents working across a set of projects.
 *
 * This module exists for screenshots and screen recordings. Nothing here is
 * real, and nothing on the production path can import it: the product is
 * forbidden from importing out of `e2e/` by an ESLint rule, and this fixture
 * compiles into a renderer bundle that `forge.config.ts` keeps out of the
 * package.
 *
 * The rows are written out rather than generated. A screenshot needs the text
 * to read like a real work queue, and a loop over a name list does not.
 */


/**
 * What an agent run is doing right now.
 *
 * `blocked` is the interesting one: the run is alive and waiting for a human to
 * approve a tool call, which is the same gate the real overlay agent uses.
 */
export type RunStatus = 'running' | 'blocked' | 'done' | 'failed';

export interface ToolUse {
  name: string;
  calls: number;
}

export interface AgentRun {
  id: string;
  project: string;
  branch: string;
  task: string;
  status: RunStatus;
  model: string;
  /** Wall clock since the run started, already formatted. */
  elapsed: string;
  /** The step line the agent would be showing in its own transcript. */
  step: string;
  tools: ToolUse[];
  tokens: string;
  /** Lines added and removed so far. */
  diff: string;
  /** For a blocked run: the tool it is waiting on. */
  pendingTool?: string;
  /** For a blocked run: the command or path that call would act on. */
  pendingSummary?: string;
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  running: 'Running',
  blocked: 'Needs approval',
  done: 'Done',
  failed: 'Failed',
};

export const PROJECTS = [
  'maximal-core',
  'shell',
  'macos-builder',
  'wiggle',
] as const;

/* -------------------------------------------------------------- the fleet */

export const RUNS: AgentRun[] = [
  {
    id: 'run-101',
    project: 'maximal-core',
    branch: 'agent/refactor-auth',
    task: 'Refactor auth middleware onto the session store',
    status: 'running',
    model: 'claude-opus-5',
    elapsed: '12m 04s',
    step: 'Editing src/auth/session.ts (3 of 7 files)',
    tools: [
      { name: 'read', calls: 31 },
      { name: 'edit', calls: 9 },
      { name: 'bash', calls: 4 },
    ],
    tokens: '184.2k',
    diff: '+312 −188',
  },
  {
    id: 'run-102',
    project: 'maximal-core',
    branch: 'agent/flaky-triage',
    task: 'Triage the flaky provider retry test',
    status: 'blocked',
    model: 'claude-sonnet-4-6',
    elapsed: '4m 41s',
    step: 'Waiting for approval to run: npm run mutate',
    tools: [
      { name: 'read', calls: 18 },
      { name: 'grep', calls: 12 },
      { name: 'bash', calls: 2 },
    ],
    tokens: '61.8k',
    diff: '+24 −11',
    pendingTool: 'bash',
    pendingSummary: 'npm run mutate',
  },
  {
    id: 'run-103',
    project: 'maximal-core',
    branch: 'agent/bump-deps',
    task: 'Bump pi-agent-core and re-pin the lockfile',
    status: 'running',
    model: 'qwen3-coder-30b',
    elapsed: '2m 18s',
    step: 'Running: npm install --package-lock-only',
    tools: [
      { name: 'read', calls: 7 },
      { name: 'bash', calls: 3 },
    ],
    tokens: '22.4k',
    diff: '+1 −1',
  },
  {
    id: 'run-104',
    project: 'maximal-core',
    branch: 'agent/token-budget',
    task: 'Add a token budget to the streaming provider',
    status: 'done',
    model: 'claude-opus-5',
    elapsed: '31m 52s',
    step: 'Finished. 14 files changed, suite green.',
    tools: [
      { name: 'read', calls: 44 },
      { name: 'edit', calls: 21 },
      { name: 'bash', calls: 9 },
    ],
    tokens: '402.7k',
    diff: '+688 −241',
  },
  {
    id: 'run-105',
    project: 'maximal-core',
    branch: 'agent/prompt-cache',
    task: 'Cache the system prompt between turns',
    status: 'done',
    model: 'claude-sonnet-4-6',
    elapsed: '18m 09s',
    step: 'Finished. Cache hit rate 0.82 on the replay set.',
    tools: [
      { name: 'read', calls: 26 },
      { name: 'edit', calls: 8 },
    ],
    tokens: '141.0k',
    diff: '+204 −96',
  },
  {
    id: 'run-106',
    project: 'maximal-core',
    branch: 'agent/otel-spans',
    task: 'Emit a span per tool call',
    status: 'failed',
    model: 'qwen3-coder-30b',
    elapsed: '7m 27s',
    step: 'Stopped: typecheck failed after 3 repair attempts.',
    tools: [
      { name: 'read', calls: 15 },
      { name: 'edit', calls: 11 },
      { name: 'bash', calls: 6 },
    ],
    tokens: '88.3k',
    diff: '+97 −42',
  },
  {
    id: 'run-201',
    project: 'shell',
    branch: 'agent/inspector-density',
    task: 'Tighten the inspector to the maximal token scale',
    status: 'running',
    model: 'claude-opus-5',
    elapsed: '9m 33s',
    step: 'Reading src/renderer/styles/tokens.css',
    tools: [
      { name: 'read', calls: 22 },
      { name: 'edit', calls: 5 },
    ],
    tokens: '96.5k',
    diff: '+118 −77',
  },
  {
    id: 'run-202',
    project: 'shell',
    branch: 'agent/tab-overflow',
    task: 'Scroll the tab strip instead of shrinking tabs',
    status: 'blocked',
    model: 'claude-haiku-4-6',
    elapsed: '1m 56s',
    step: 'Waiting for approval to write: src/renderer/styles/shell.css',
    tools: [
      { name: 'read', calls: 9 },
      { name: 'grep', calls: 4 },
    ],
    tokens: '17.9k',
    diff: '+12 −4',
    pendingTool: 'write',
    pendingSummary: 'src/renderer/styles/shell.css',
  },
  {
    id: 'run-203',
    project: 'shell',
    branch: 'agent/pty-batching',
    task: 'Measure the pty flush window under a build log',
    status: 'done',
    model: 'claude-sonnet-4-6',
    elapsed: '22m 14s',
    step: 'Finished. 8ms holds at 40k lines per second.',
    tools: [
      { name: 'read', calls: 19 },
      { name: 'bash', calls: 14 },
    ],
    tokens: '133.6k',
    diff: '+63 −18',
  },
  {
    id: 'run-204',
    project: 'shell',
    branch: 'agent/splash-timing',
    task: 'Close the splash on first paint, not on a timer',
    status: 'done',
    model: 'qwen3-coder-30b',
    elapsed: '11m 47s',
    step: 'Finished. Splash now closes 240ms earlier.',
    tools: [
      { name: 'read', calls: 12 },
      { name: 'edit', calls: 4 },
    ],
    tokens: '54.1k',
    diff: '+38 −29',
  },
  {
    id: 'run-205',
    project: 'shell',
    branch: 'agent/e2e-shuffle',
    task: 'Print the shuffle seed in the failure summary',
    status: 'done',
    model: 'claude-haiku-4-6',
    elapsed: '6m 02s',
    step: 'Finished. Seed now replays from the report header.',
    tools: [
      { name: 'read', calls: 8 },
      { name: 'edit', calls: 3 },
    ],
    tokens: '29.8k',
    diff: '+21 −6',
  },
  {
    id: 'run-301',
    project: 'macos-builder',
    branch: 'agent/notarize-retry',
    task: 'Retry notarisation on a transient 5xx',
    status: 'running',
    model: 'claude-sonnet-4-6',
    elapsed: '16m 21s',
    step: 'Running: xcrun notarytool submit --wait',
    tools: [
      { name: 'read', calls: 11 },
      { name: 'bash', calls: 8 },
    ],
    tokens: '73.4k',
    diff: '+56 −13',
  },
  {
    id: 'run-302',
    project: 'macos-builder',
    branch: 'agent/universal-binary',
    task: 'Produce a universal binary in one pass',
    status: 'done',
    model: 'claude-opus-5',
    elapsed: '44m 38s',
    step: 'Finished. lipo output verified on both slices.',
    tools: [
      { name: 'read', calls: 33 },
      { name: 'edit', calls: 12 },
      { name: 'bash', calls: 27 },
    ],
    tokens: '318.9k',
    diff: '+241 −160',
  },
  {
    id: 'run-303',
    project: 'macos-builder',
    branch: 'agent/staple-check',
    task: 'Assert the stapled ticket before upload',
    status: 'done',
    model: 'devstral-24b',
    elapsed: '13m 55s',
    step: 'Finished. Upload now refuses an unstapled bundle.',
    tools: [
      { name: 'read', calls: 14 },
      { name: 'bash', calls: 10 },
    ],
    tokens: '67.2k',
    diff: '+44 −8',
  },
  {
    id: 'run-401',
    project: 'wiggle',
    branch: 'agent/double-tap',
    task: 'Detect a double tap of Ctrl without a global hook',
    status: 'running',
    model: 'claude-opus-5',
    elapsed: '5m 12s',
    step: 'Editing src/hotkey/tap.ts (1 of 2 files)',
    tools: [
      { name: 'read', calls: 16 },
      { name: 'edit', calls: 6 },
    ],
    tokens: '81.7k',
    diff: '+93 −27',
  },
  {
    id: 'run-402',
    project: 'wiggle',
    branch: 'agent/menu-bar-icon',
    task: 'Ship a template image for the menu bar',
    status: 'done',
    model: 'claude-haiku-4-6',
    elapsed: '8m 44s',
    step: 'Finished. Icon renders correctly in both appearances.',
    tools: [
      { name: 'read', calls: 10 },
      { name: 'edit', calls: 5 },
    ],
    tokens: '38.6k',
    diff: '+29 −14',
  },
  {
    id: 'run-403',
    project: 'wiggle',
    branch: 'agent/idle-wake',
    task: 'Wake the listener after a display sleep',
    status: 'done',
    model: 'qwen3-coder-30b',
    elapsed: '19m 30s',
    step: 'Finished. Listener re-arms on power-state change.',
    tools: [
      { name: 'read', calls: 21 },
      { name: 'edit', calls: 7 },
      { name: 'bash', calls: 5 },
    ],
    tokens: '112.3k',
    diff: '+147 −52',
  },
];
