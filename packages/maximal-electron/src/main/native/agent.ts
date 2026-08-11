import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

import {
  Agent,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type AgentTool,
  type AgentToolResult,
  type AgentToolUpdateCallback,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { stream } from '@earendil-works/pi-ai/compat';
import type { TSchema } from 'typebox';

import type {
  AgentApprovalRequest,
  AgentProvider,
  ApproveRequest,
  ProviderStatus,
} from '../../shared/ipc.js';

import { describeToolCall, needsApproval, riskOf, type ToolRisk } from './approval.js';
import { runEmbedded } from './embedded.js';
import { EMBEDDED_MODEL_LABEL, EMBEDDED_MODEL_MB, isModelPresent } from './llama.js';
import { getPreferences } from './preferences.js';
import {
  resolveEndpoints,
  type Endpoints,
} from './provider-endpoint.js';
import { buildToolsetTools, type RiskyTool } from './toolsets.js';

/**
 * The overlay agent, powered by the pi coding agent from `badlogic/pi-mono`:
 * `pi-ai` streams from the provider, `pi-agent-core` runs the tool loop.
 *
 * Discovery copies `stuffbucket/wiggle`, and the property worth keeping is that
 * there is **nothing to configure to start**. maximal, then Ollama, then say so
 * plainly. Never demand a key. See `docs/agent.md` for the ranking and why.
 */

/** Where the two HTTP backends listen when nothing moves them. */
const DEFAULT_ENDPOINTS = {
  maximal: 'http://localhost:4141',
  ollama: 'http://localhost:11434',
} as const;

type Backend = keyof typeof DEFAULT_ENDPOINTS | 'embedded';

const PINS: readonly Backend[] = ['maximal', 'ollama', 'embedded'];

/**
 * The pin and the endpoints for this process, read fresh on every call.
 *
 * `provider-endpoint.ts` holds the rules the two environment variables obey.
 * The names stay here, because this file owns the chain.
 */
function environment(): {
  pin: Backend | undefined;
  base: Endpoints<keyof typeof DEFAULT_ENDPOINTS>;
} {
  const pin = process.env['STUFFBUCKET_PROVIDER'] ?? '';
  const address = process.env['STUFFBUCKET_PROVIDER_URL'] ?? '';
  return {
    pin: PINS.find((name) => name === pin),
    base: resolveEndpoints(DEFAULT_ENDPOINTS, pin, address),
  };
}

/** Wiggle pins this model for maximal. Keep them in step. */
const MAXIMAL_MODEL = 'claude-haiku-4-5';

/**
 * Ollama models to prefer, best first.
 *
 * Only a model that is already pulled is used, so this is a preference order
 * rather than a requirement. It is ordered by tool-calling behaviour rather
 * than by size: `llama3.2` is deliberately absent, because it calls a tool on
 * every prompt including ones that need none, which is the one failure a
 * concierge cannot have.
 */
const OLLAMA_PREFERRED = [
  'qwen3:4b',
  'qwen3:1.7b',
  'qwen2.5:7b',
  'lfm2.5:1.2b',
  'qwen3:0.6b',
];

/** A probe must not hang the overlay, so every request is bounded. */
const PROBE_TIMEOUT_MS = 1500;

/**
 * maximal supplies the real credential, and Ollama wants none. pi-ai still
 * requires the field, so this is a placeholder rather than a secret.
 */
const PLACEHOLDER_KEY = 'supplied-by-local-backend';

const SYSTEM_PROMPT = [
  'You are a concierge embedded in the Stuffbucket desktop application.',
  'Answer in a few sentences unless asked for more.',
  'You can read and change this application through your tools. When asked',
  'about how the application is set up, call get_app_state rather than',
  'guessing. When asked to change the appearance, call set_theme.',
  'You also have read, write, edit, and bash tools for the working directory.',
  'Use a tool only when it is needed to answer or to act. Answer general',
  'questions directly, without calling anything.',
  'Never run a destructive command without being asked to.',
].join(' ');

/* ---------------------------------------------------------------- discovery */

async function reachable(url: string): Promise<boolean> {
  return (await fetchJson(url)) !== undefined;
}

/** GET with a bound timeout. Returns undefined for anything that is not 200. */
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    // Connection refused, DNS failure, bad JSON, or the timeout above. All
    // mean "not usable".
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Which Ollama model to use, out of what is actually pulled.
 *
 * The previous version named one model and hoped. `/api/tags` lists what is
 * installed, so the preferred order is applied against reality, and a machine
 * with none of them still gets whatever it does have.
 */
function chooseOllamaModel(tags: unknown): string | undefined {
  const models = (tags as { models?: { name?: unknown }[] } | undefined)?.models;
  if (!Array.isArray(models)) return undefined;

  const installed = models
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === 'string');
  if (installed.length === 0) return undefined;

  for (const wanted of OLLAMA_PREFERRED) {
    const match = installed.find(
      (name) => name === wanted || name.startsWith(`${wanted}-`),
    );
    if (match) return match;
  }
  return installed[0];
}

/**
 * Pick a backend, best first.
 *
 * The order is a quality order, not a convenience one. A proxy backed by a
 * real subscription beats a small local model on every axis that matters, so
 * the embedded model is the floor rather than the default: it is what makes
 * the application work offline and with nothing installed.
 */
export async function discoverProvider(): Promise<ProviderStatus> {
  // Pin a provider, for testing and for support. Without it the embedded path
  // is unreachable on any machine that has a proxy running, which is every
  // machine that develops this.
  const { pin, base } = environment();
  if (pin === 'embedded') {
    return isModelPresent()
      ? { state: 'ready', provider: 'embedded', model: EMBEDDED_MODEL_LABEL }
      : { state: 'needs-model', model: EMBEDDED_MODEL_LABEL, approxMb: EMBEDDED_MODEL_MB };
  }

  if (pin !== 'ollama' && (await reachable(`${base.maximal}/v1/models`))) {
    return { state: 'ready', provider: 'maximal', model: MAXIMAL_MODEL };
  }

  if (pin !== 'maximal') {
    const tags = await fetchJson(`${base.ollama}/api/tags`);
    if (tags !== undefined) {
      const model = chooseOllamaModel(tags);
      if (model) return { state: 'ready', provider: 'ollama', model };
      // Ollama is running but empty. Fall through: the embedded model is a
      // better answer than telling someone to go and pull one.
    }
  }

  // A pin that did not answer says so, rather than quietly becoming a
  // different backend. Someone who named one wants that one.
  if (pin !== undefined) {
    return { state: 'unavailable', reason: `No ${pin} backend answered.` };
  }

  if (isModelPresent()) {
    return { state: 'ready', provider: 'embedded', model: EMBEDDED_MODEL_LABEL };
  }

  return {
    state: 'needs-model',
    model: EMBEDDED_MODEL_LABEL,
    approxMb: EMBEDDED_MODEL_MB,
  };
}

/**
 * Build the model descriptor pi-ai streams from.
 *
 * maximal speaks the Anthropic messages API. Ollama exposes an
 * OpenAI-compatible endpoint under `/v1`. Costs are zeroed because both run
 * locally, and pi only uses them for reporting.
 */
function buildModel(
  provider: AgentProvider,
  id: string,
  base: Endpoints<keyof typeof DEFAULT_ENDPOINTS>,
) {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  return provider === 'maximal'
    ? {
        id,
        name: id,
        api: 'anthropic-messages' as const,
        provider: 'anthropic' as const,
        baseUrl: base.maximal,
        reasoning: false,
        input: ['text' as const],
        cost: zero,
        contextWindow: 200_000,
        maxTokens: 4096,
      }
    : {
        id,
        name: id,
        api: 'openai-completions' as const,
        provider: 'openai' as const,
        baseUrl: `${base.ollama}/v1`,
        reasoning: false,
        input: ['text' as const],
        cost: zero,
        contextWindow: 32_000,
        maxTokens: 4096,
      };
}

/* -------------------------------------------------------------------- tools */

/**
 * Bind the built-in tools to a Node execution context.
 *
 * The harness tools take their context as a fifth argument to `execute`, which
 * the plain `Agent` does not pass. This closes over it, and that closure is the
 * whole bridge between the two layers.
 *
 * The cast is deliberate and narrow. Each factory returns a tool with its own
 * parameter schema, so the four have no common generic instantiation; binding
 * one argument cannot be expressed without erasing that schema. The runtime
 * shape is unchanged, and the schema is still enforced by pi at call time.
 */
type BoundTool = AgentTool<TSchema, unknown>;

/** Tools for a run, plus what each one is allowed to do. */
interface ToolSet {
  tools: BoundTool[];
  risk: Map<string, ToolRisk>;
  /** The same tools paired with their risk, which the embedded engine needs. */
  entries: RiskyTool[];
}

function buildTools(options: {
  cwd: string;
  toolsetIds: readonly string[];
  /** Include the read, write, edit, and bash tools from pi. */
  coding: boolean;
}): ToolSet {
  const risk = new Map<string, ToolRisk>();
  const tools: BoundTool[] = [];
  const entries: RiskyTool[] = [];

  if (options.coding) {
    const context = { env: new NodeExecutionEnv({ cwd: options.cwd }) };
    const factories = [
      createReadTool(),
      createWriteTool(),
      createEditTool(),
      createBashTool(),
    ];

    for (const tool of factories) {
      const execute = tool.execute.bind(tool) as (
        toolCallId: string,
        params: unknown,
        signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<unknown> | undefined,
        context: { env: NodeExecutionEnv },
      ) => Promise<AgentToolResult<unknown>>;

      const bound = {
        ...tool,
        execute: (toolCallId, params, signal, onUpdate) =>
          execute(toolCallId, params, signal, onUpdate, context),
      } as BoundTool;

      tools.push(bound);
      risk.set(tool.name, riskOf(tool.name));
      entries.push({ tool: bound, risk: riskOf(tool.name) });
    }
  }

  // Toolsets are resolved here, at run start, which is what makes them
  // swappable. A change lands on the next summon rather than mid-run.
  for (const entry of buildToolsetTools(options.toolsetIds)) {
    tools.push(entry.tool);
    risk.set(entry.tool.name, entry.risk);
    entries.push(entry);
  }

  return { tools, risk, entries };
}

/** Turn a not-ready provider status into something a person can act on. */
function describeNotReady(status: ProviderStatus): string {
  switch (status.state) {
    case 'probing':
      return 'Still looking for a model backend.';
    case 'needs-model':
      return `The ${status.model} model has not been downloaded yet.`;
    case 'unavailable':
      return status.reason;
    default:
      return 'No model backend is available.';
  }
}

/* ------------------------------------------------------------------ running */

/** Callbacks the main process wires to IPC events. */
export interface AgentSink {
  onDelta: (text: string) => void;
  onTool: (name: string, phase: 'start' | 'end', isError?: boolean) => void;
  onApproval: (request: AgentApprovalRequest) => void;
  onEnd: (result: { ok: true } | { ok: false; error: string }) => void;
}

/**
 * How long a tool call waits for a decision before it denies itself.
 *
 * A gate that waits forever is worse than no gate. The card can be dismissed
 * with the scrim while a call is pending, and then nothing would ever answer.
 * The run would hold `active` until the process exits, and every later summon
 * would report that it is still busy.
 */
const APPROVAL_TIMEOUT_MS = 45_000;

/** Text fed back to the model when a call is refused. */
const DENIED = 'The user denied this tool call. Do not retry it.';

interface PendingApproval {
  tool: string;
  settle: (allow: boolean) => void;
  timer?: ReturnType<typeof setTimeout>;
}

interface ActiveRun {
  /** Absent on the embedded path, which has no pi agent to stop. */
  agent?: Agent;
  controller: AbortController;
  /** Tools the user allowed for the rest of this run. Never persisted. */
  allowed: Set<string>;
  pending: Map<string, PendingApproval>;
}

let active: ActiveRun | undefined;

/**
 * The current run's promise, so shutdown can wait for it.
 *
 * `abortAgent` clears `active` immediately, but the engine underneath may
 * still be finishing native work on a worker thread. Quitting while that is
 * outstanding tears down the Node environment underneath it, and the addon
 * then throws into an environment that no longer exists.
 */
let inFlight: Promise<void> | undefined;

export function isAgentBusy(): boolean {
  return active !== undefined;
}

/**
 * Stop any run and wait for it to actually finish.
 *
 * Call this before the application quits. Aborting alone is not enough: abort
 * asks the engine to stop, and this waits for it to have stopped. The timeout
 * exists so a wedged engine delays a quit rather than preventing one.
 */
export async function shutdownAgent(timeoutMs = 5_000): Promise<void> {
  abortAgent();

  const pending = inFlight;
  if (!pending) return;

  await Promise.race([
    pending,
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    }),
  ]);
}

/** Stop the current run. Safe to call when nothing is running. */
export function abortAgent(): void {
  const run = active;
  if (!run) return;

  // Deny anything waiting first. The agent loop is parked inside the gate, and
  // `abort` alone does not settle that promise.
  for (const entry of [...run.pending.values()]) entry.settle(false);

  run.agent?.abort();
  run.controller.abort();
  active = undefined;
}

/**
 * Answer a pending approval.
 *
 * An unknown id is ignored rather than treated as an error. It means the call
 * already timed out, or the run was aborted, and the renderer is answering a
 * prompt that no longer exists.
 */
export function resolveApproval(request: ApproveRequest): void {
  const run = active;
  const entry = run?.pending.get(request.id);
  if (!run || !entry) return;

  // Remember only applies to an allow. "Deny and remember" would silently
  // break the rest of the run with no way to see why.
  if (request.allow && request.remember) run.allowed.add(entry.tool);

  entry.settle(request.allow);
}

/** Ask the renderer, and wait. Resolves false on timeout or abort. */
function requestApproval(
  pending: Map<string, PendingApproval>,
  tool: string,
  summary: string,
  sink: AgentSink,
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = randomUUID();

    const entry: PendingApproval = {
      tool,
      settle: (allow) => {
        // `delete` returns false when this was already settled, which makes
        // the timeout and a late answer race harmlessly.
        if (!pending.delete(id)) return;
        clearTimeout(entry.timer);
        resolve(allow);
      },
    };

    pending.set(id, entry);
    entry.timer = setTimeout(() => entry.settle(false), APPROVAL_TIMEOUT_MS);
    // A pending prompt must not keep the process alive on its own.
    entry.timer.unref?.();

    sink.onApproval({ id, tool, summary });
  });
}

/**
 * Start a run. Returns once the run finishes; progress arrives through `sink`.
 *
 * One run at a time. A second prompt while the first is in flight would
 * interleave two transcripts in one overlay card.
 */
export async function runAgent(prompt: string, sink: AgentSink): Promise<void> {
  if (active) {
    sink.onEnd({ ok: false, error: 'Already working on the previous request.' });
    return;
  }

  const run = execute(prompt, sink);
  inFlight = run.finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function execute(prompt: string, sink: AgentSink): Promise<void> {
  const status = await discoverProvider();
  if (status.state !== 'ready') {
    sink.onEnd({ ok: false, error: describeNotReady(status) });
    return;
  }

  const prefs = getPreferences();
  const controller = new AbortController();
  const allowed = new Set<string>();
  const pending = new Map<string, PendingApproval>();

  // The `app` toolset stays on even when coding tools are off. It only reads
  // and changes this application, which is the concierge case, and it is what
  // makes the agent useful without giving it the machine.
  const built = buildTools({
    cwd: prefs.agentCwd || homedir(),
    toolsetIds: prefs.agentToolsets,
    coding: prefs.agentTools,
  });

  /** The gate, shared by both engines. Denies on every edge. */
  const gate = async (
    tool: string,
    risk: ToolRisk,
    summary: string,
  ): Promise<boolean> => {
    if (!needsApproval(prefs.agentApproval, risk)) return true;
    if (allowed.has(tool)) return true;
    return requestApproval(pending, tool, summary, sink);
  };

  if (status.provider === 'embedded') {
    active = { controller, allowed, pending };
    try {
      await runEmbedded({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        tools: built.entries,
        onDelta: sink.onDelta,
        onTool: sink.onTool,
        approve: gate,
        signal: controller.signal,
      });
      sink.onEnd({ ok: true });
    } catch (error) {
      sink.onEnd({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      for (const entry of [...pending.values()]) entry.settle(false);
      active = undefined;
    }
    return;
  }

  const agent = new Agent({
    streamFn: (model, context, options) =>
      stream(model, context, { ...options, apiKey: PLACEHOLDER_KEY }),

    /**
     * The gate. This is the only thing standing between a model and a shell
     * on the user's machine, so it denies rather than throws on every edge:
     * timeout, abort, and an unanswerable prompt all end as a refusal.
     */
    beforeToolCall: async ({ toolCall, args }) => {
      const tool = toolCall.name;
      const risk = riskOf(tool, built.risk.get(tool));
      const ok = await gate(tool, risk, describeToolCall(tool, args));
      return ok ? undefined : { block: true, reason: DENIED };
    },

    initialState: {
      model: buildModel(status.provider, status.model, environment().base),
      systemPrompt: SYSTEM_PROMPT,
      tools: built.tools,
    },
  });

  active = { agent, controller, allowed, pending };

  const unsubscribe = agent.subscribe((event) => {
    if (event.type === 'message_update') {
      const inner = event.assistantMessageEvent;
      // Only text deltas reach the card. Tool arguments stream too, and showing
      // those would put raw JSON in front of the user mid-sentence.
      if (inner.type === 'text_delta') sink.onDelta(inner.delta);
      return;
    }
    if (event.type === 'tool_execution_start') {
      sink.onTool(event.toolName, 'start');
      return;
    }
    if (event.type === 'tool_execution_end') {
      sink.onTool(event.toolName, 'end', event.isError);
    }
  });

  try {
    await agent.prompt(prompt);
    sink.onEnd({ ok: true });
  } catch (error) {
    sink.onEnd({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    unsubscribe();
    // A run that failed mid-gate can leave a prompt outstanding. Settle it, or
    // the timer holds a resolver for a run that is already gone.
    for (const entry of [...pending.values()]) entry.settle(false);
    active = undefined;
  }
}
