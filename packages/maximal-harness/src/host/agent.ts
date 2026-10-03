import { randomUUID } from 'node:crypto';
import {
  Agent,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type AgentTool,
  type AgentMessage,
  type AgentToolResult,
  type AgentToolUpdateCallback,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { streamSimple } from '@earendil-works/pi-ai/compat';
import type { ImageContent } from '@earendil-works/pi-ai';
import type { TSchema } from 'typebox';

import type {
  AgentApproval,
  AgentApprovalRequest,
  AgentEffort,
  AgentModelOption,
  AgentProvider,
  ApproveRequest,
  ProviderStatus,
} from '../contracts.js';
import { HARNESS_CONFIG, HARNESS_COPY } from '../constants.js';

import {
  describeToolCall,
  needsApproval,
  permitsTool,
  riskOf,
  type ToolRisk,
} from './approval.js';
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

type Backend = keyof typeof HARNESS_CONFIG.discovery.defaultEndpoints | 'embedded';
const AGENT_EFFORTS = new Set<AgentEffort>(['low', 'medium', 'high', 'xhigh', 'max']);

const PINS: readonly Backend[] = HARNESS_CONFIG.discovery.providerPins;

/**
 * The pin and the endpoints for this process, read fresh on every call.
 *
 * `provider-endpoint.ts` holds the rules the two environment variables obey.
 * The names stay here, because this file owns the chain.
 */
function environment(): {
  pin: Backend | undefined;
  base: Endpoints<keyof typeof HARNESS_CONFIG.discovery.defaultEndpoints>;
  maximalApiKey: string;
} {
  const pin = process.env['STUFFBUCKET_PROVIDER'] ?? '';
  const address = process.env['STUFFBUCKET_PROVIDER_URL'] ?? '';
  return {
    pin: PINS.find((name) => name === pin),
    base: resolveEndpoints(HARNESS_CONFIG.discovery.defaultEndpoints, pin, address),
    maximalApiKey: process.env['STUFFBUCKET_PROVIDER_API_KEY']?.trim()
      || HARNESS_CONFIG.discovery.placeholderApiKey,
  };
}

export function resolveProviderApiKey(provider: AgentProvider): string {
  return provider === 'maximal'
    ? environment().maximalApiKey
    : HARNESS_CONFIG.discovery.placeholderApiKey;
}

/**
 * Ollama models to prefer, best first.
 *
 * Only a model that is already pulled is used, so this is a preference order
 * rather than a requirement. It is ordered by tool-calling behaviour rather
 * than by size: `llama3.2` is deliberately absent, because it calls a tool on
 * every prompt including ones that need none, which is the one failure a
 * concierge cannot have.
 */
export interface AgentOptions {
  systemPrompt: string;
  codingTools: boolean;
  approval: AgentApproval;
  cwd: string;
  preferredModel?: string;
  preferredEffort?: AgentEffort;
  toolsetIds?: readonly string[];
  providers?: readonly AgentProvider[];
  autoSelectModel?: boolean;
}

let configured: AgentOptions | undefined;

export function configureAgent(options: AgentOptions): void {
  configured = options;
}

export function setAgentEffortPreference(effort: AgentEffort): void {
  if (!configured) throw new Error(HARNESS_COPY.agent.notConfigured);
  configured = { ...configured, preferredEffort: effort };
}

/* ---------------------------------------------------------------- discovery */

/** GET with a bound timeout. Returns undefined for anything that is not 200. */
async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    HARNESS_CONFIG.discovery.probeTimeoutMs,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...(headers === undefined ? {} : { headers }),
    });
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
function option(
  provider: AgentProvider,
  model: string,
  label = model,
  description = provider === 'embedded'
    ? 'Runs privately on this Mac'
    : provider === 'ollama'
      ? 'Local model via Ollama'
      : 'Available through Maximal',
  efforts: AgentEffort[] = [],
): AgentModelOption {
  return {
    key: `${provider}:${model}`,
    label,
    model,
    provider,
    description,
    efforts,
  };
}

function maximalModels(payload: unknown): AgentModelOption[] {
  const data = (payload as {
    data?: Array<{
      id?: unknown;
      display_name?: unknown;
      max_input_tokens?: unknown;
      capabilities?: {
        thinking?: {
          supported?: unknown;
          efforts?: unknown;
        };
      };
    }>;
  } | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    if (typeof entry.id !== 'string' || entry.id.length === 0) return [];
    const reasoning = entry.capabilities?.thinking?.supported === true;
    const efforts = entry.capabilities?.thinking?.efforts;
    const supportedEfforts = Array.isArray(efforts)
      ? efforts.filter((effort): effort is AgentEffort =>
          typeof effort === 'string' && AGENT_EFFORTS.has(effort as AgentEffort))
      : [];
    const context =
      typeof entry.max_input_tokens === 'number' && entry.max_input_tokens > 0
        ? `${Math.round(entry.max_input_tokens / 1000)}K context`
        : undefined;
    return [option(
      'maximal',
      entry.id,
      typeof entry.display_name === 'string' && entry.display_name.length > 0
        ? entry.display_name
        : entry.id,
      [reasoning ? 'Extended reasoning' : undefined, context]
        .filter((part): part is string => part !== undefined)
        .join(' · ') || 'Available through Maximal',
      reasoning ? supportedEfforts : [],
    )];
  });
}

function ollamaModels(payload: unknown): AgentModelOption[] {
  const models = (payload as { models?: Array<{ name?: unknown }> } | undefined)?.models;
  if (!Array.isArray(models)) return [];
  return models.flatMap((entry) =>
    typeof entry.name === 'string' && entry.name.length > 0
      ? [option('ollama', entry.name)]
      : [],
  );
}

async function modelCatalogue(
  pin: Backend | undefined,
  base: Endpoints<keyof typeof HARNESS_CONFIG.discovery.defaultEndpoints>,
  maximalApiKey: string,
): Promise<AgentModelOption[]> {
  const permits = (provider: AgentProvider): boolean =>
    configured?.providers === undefined || configured.providers.includes(provider);
  const [maximal, ollama] = await Promise.all([
    permits('maximal') && (pin === undefined || pin === 'maximal')
      ? fetchJson(`${base.maximal}/v1/models`, {
          'anthropic-version': '2023-06-01',
          authorization: `Bearer ${maximalApiKey}`,
        }).then(maximalModels)
      : [],
    permits('ollama') && (pin === undefined || pin === 'ollama')
      ? fetchJson(`${base.ollama}/api/tags`).then(ollamaModels)
      : [],
  ]);
  const embedded =
    permits('embedded') && (pin === undefined || pin === 'embedded')
      ? (await import('@maximal/maximal-runner-llama-cpp')).listEmbeddedModels().map(
          (model) => option('embedded', model.fileName, model.label),
        )
      : [];
  return [...maximal, ...ollama, ...embedded];
}

async function ready(
  selected: AgentModelOption,
  models: AgentModelOption[],
): Promise<ProviderStatus> {
  if (selected.provider === 'embedded') {
    const { selectEmbeddedModel } = await import('@maximal/maximal-runner-llama-cpp');
    selectEmbeddedModel(selected.model);
  }
  const preferredEffort = configured?.preferredEffort;
  const effort =
    preferredEffort !== undefined && selected.efforts.includes(preferredEffort)
      ? preferredEffort
      : selected.efforts.at(-1);
  return {
    state: 'ready',
    provider: selected.provider,
    model: selected.model,
    modelKey: selected.key,
    models,
    ...(effort === undefined ? {} : { effort }),
  };
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
  const { pin, base, maximalApiKey } = environment();
  const embeddedAllowed =
    configured?.providers === undefined || configured.providers.includes('embedded');
  const models = await modelCatalogue(pin, base, maximalApiKey);
  if (pin !== undefined) {
    if (models.length > 0) {
      const preferred = models.find(
        (model) => model.key === configured?.preferredModel,
      );
      return ready(preferred ?? models[0]!, models);
    }
    return pin === 'embedded' && embeddedAllowed
      ? await import('@maximal/maximal-runner-llama-cpp').then((embedded) => ({
          state: 'needs-model',
          model: embedded.EMBEDDED_MODEL_LABEL,
          approxMb: embedded.EMBEDDED_MODEL_MB,
        } as const))
      : {
          state: 'unavailable',
          reason: HARNESS_COPY.agent.noProviderAnswer(pin),
        };
  }

  if (models.length === 0) {
    if (!embeddedAllowed) {
      return { state: 'unavailable', reason: HARNESS_COPY.agent.noBackend };
    }
    return import('@maximal/maximal-runner-llama-cpp').then((embedded) => ({
        state: 'needs-model' as const,
        model: embedded.EMBEDDED_MODEL_LABEL,
        approxMb: embedded.EMBEDDED_MODEL_MB,
    }));
  }

  const preferred = models.find(
    (model) => model.key === configured?.preferredModel,
  );
  if (preferred) return ready(preferred, models);
  if (configured?.autoSelectModel) return ready(models[0]!, models);
  return {
    state: 'select-model',
    ...(configured?.preferredModel === undefined
      ? {}
      : { preferredModel: configured.preferredModel }),
    models,
  };
}

export async function selectAgentModel(modelKey: string): Promise<ProviderStatus> {
  const options = configured;
  if (!options) throw new Error(HARNESS_COPY.agent.notConfigured);
  const { pin, base, maximalApiKey } = environment();
  const models = await modelCatalogue(pin, base, maximalApiKey);
  const selected = models.find((model) => model.key === modelKey);
  if (!selected) throw new Error(HARNESS_COPY.agent.modelUnavailable(modelKey));
  configured = { ...options, preferredModel: selected.key };
  return ready(selected, models);
}

export async function selectAgentEffort(effort: AgentEffort): Promise<ProviderStatus> {
  const options = configured;
  if (!options) throw new Error(HARNESS_COPY.agent.notConfigured);
  const { pin, base, maximalApiKey } = environment();
  const models = await modelCatalogue(pin, base, maximalApiKey);
  const selected =
    models.find((model) => model.key === options.preferredModel)
    ?? (pin === undefined ? undefined : models[0]);
  if (!selected || !selected.efforts.includes(effort)) {
    throw new Error(`The selected model does not support ${effort} effort.`);
  }
  configured = { ...options, preferredEffort: effort };
  return ready(selected, models);
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
  reasoning: boolean,
  base: Endpoints<keyof typeof HARNESS_CONFIG.discovery.defaultEndpoints>,
) {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  return provider === 'maximal'
    ? {
        id,
        name: id,
        api: 'anthropic-messages' as const,
        provider: 'anthropic' as const,
        baseUrl: base.maximal,
        reasoning,
        ...(reasoning ? { compat: { forceAdaptiveThinking: true } } : {}),
        input: ['text' as const],
        cost: zero,
        contextWindow: HARNESS_CONFIG.models.maximal.contextWindow,
        maxTokens: HARNESS_CONFIG.models.maximal.maxTokens,
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
        contextWindow: HARNESS_CONFIG.models.ollama.contextWindow,
        maxTokens: HARNESS_CONFIG.models.ollama.maxTokens,
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
      return HARNESS_COPY.agent.probing;
    case 'needs-model':
      return HARNESS_COPY.agent.modelNotDownloaded(status.model);
    case 'unavailable':
      return status.reason;
    default:
      return HARNESS_COPY.agent.noBackend;
  }
}

/* ------------------------------------------------------------------ running */

/** Callbacks the main process wires to IPC events. */
export interface AgentSink {
  onDelta: (text: string) => void;
  onTool: (
    id: string,
    name: string,
    phase: 'start' | 'end',
    isError?: boolean,
  ) => void;
  onApproval: (request: AgentApprovalRequest) => void;
  onEnd: (result: { ok: true } | { ok: false; error: string }) => void;
}

export interface AgentRunOptions {
  initialMessages?: AgentMessage[];
  images?: ImageContent[];
}

export function steerAgent(prompt: string): boolean {
  if (!active?.agent) return false;
  active.agent.steer({
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
  });
  return true;
}

/**
 * How long a tool call waits for a decision before it denies itself.
 *
 * A gate that waits forever is worse than no gate. The card can be dismissed
 * with the scrim while a call is pending, and then nothing would ever answer.
 * The run would hold `active` until the process exits, and every later summon
 * would report that it is still busy.
 */
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
  return inFlight !== undefined;
}

/**
 * Stop any run and wait for it to actually finish.
 *
 * Call this before the application quits. Aborting alone is not enough: abort
 * asks the engine to stop, and this waits for it to have stopped.
 */
export async function shutdownAgent(): Promise<void> {
  abortAgent();

  const pending = inFlight;
  if (!pending) return;
  await pending;
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
    entry.timer = setTimeout(
      () => entry.settle(false),
      HARNESS_CONFIG.approval.timeoutMs,
    );
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
export async function runAgent(
  prompt: string,
  sink: AgentSink,
  options: AgentRunOptions = {},
): Promise<AgentMessage[] | undefined> {
  if (inFlight) {
    sink.onEnd({ ok: false, error: HARNESS_COPY.agent.alreadyWorking });
    return undefined;
  }

  const run = execute(prompt, sink, options).catch((error: unknown) => {
    sink.onEnd({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  const settled = run.finally(() => {
    inFlight = undefined;
  });
  inFlight = settled.then(() => undefined);
  return settled;
}

async function execute(
  prompt: string,
  sink: AgentSink,
  runOptions: AgentRunOptions,
): Promise<AgentMessage[] | undefined> {
  const status = await discoverProvider();
  if (status.state !== 'ready') {
    sink.onEnd({ ok: false, error: describeNotReady(status) });
    return undefined;
  }

  const options = configured;
  if (!options) {
    sink.onEnd({ ok: false, error: HARNESS_COPY.agent.notConfigured });
    return undefined;
  }

  const controller = new AbortController();
  const allowed = new Set<string>();
  const pending = new Map<string, PendingApproval>();

  const built = buildTools({
    cwd: options.cwd,
    toolsetIds: options.toolsetIds ?? [],
    coding: options.codingTools,
  });

  /** The gate, shared by both engines. Denies on every edge. */
  const gate = async (
    tool: string,
    risk: ToolRisk,
    summary: string,
  ): Promise<boolean> => {
    if (!permitsTool(options.approval, risk)) return false;
    if (!needsApproval(options.approval, risk)) return true;
    if (allowed.has(tool)) return true;
    return requestApproval(pending, tool, summary, sink);
  };

  if (status.provider === 'embedded') {
    const { runEmbedded } = await import('./embedded.js');
    active = { controller, allowed, pending };
    try {
      await runEmbedded({
        prompt,
        systemPrompt: options.systemPrompt,
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
    return undefined;
  }

  const agent = new Agent({
    streamFn: (model, context, options) =>
      streamSimple(model, context, {
        ...options,
        apiKey: resolveProviderApiKey(status.provider),
      }),

    /**
     * The gate. This is the only thing standing between a model and a shell
     * on the user's machine, so it denies rather than throws on every edge:
     * timeout, abort, and an unanswerable prompt all end as a refusal.
     */
    beforeToolCall: async ({ toolCall, args }) => {
      const tool = toolCall.name;
      const risk = riskOf(tool, built.risk.get(tool));
      const ok = await gate(tool, risk, describeToolCall(tool, args));
      return ok ? undefined : {
        block: true,
        reason: options.approval === 'read-only'
          ? HARNESS_COPY.agent.readOnlyDenied
          : HARNESS_COPY.common.denied,
      };
    },

    initialState: {
      model: buildModel(
        status.provider,
        status.model,
        status.effort !== undefined,
        environment().base,
      ),
      systemPrompt: options.systemPrompt,
      tools: built.tools,
      thinkingLevel: status.effort ?? 'off',
      messages: runOptions.initialMessages ?? [],
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
      sink.onTool(event.toolCallId, event.toolName, 'start');
      return;
    }
    if (event.type === 'tool_execution_end') {
      sink.onTool(event.toolCallId, event.toolName, 'end', event.isError);
    }
  });

  try {
    await agent.prompt(prompt, runOptions.images);
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
  return agent.state.messages;
}
