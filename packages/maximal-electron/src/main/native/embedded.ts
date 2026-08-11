import { randomUUID } from 'node:crypto';

import { riskOf, type ToolRisk } from './approval.js';
import { listen, send } from './llama-host.js';
import { modelPath } from './llama.js';
import type { ToolOffer } from './llama-protocol.js';
import type { RiskyTool } from './toolsets.js';

/**
 * Running a turn on the embedded model, from the main process side.
 *
 * This is a second engine behind the same sink, not a second agent. The pi
 * path speaks HTTP to a proxy and owns its own loop. llama.cpp owns the loop
 * itself: it constrains sampling to the tool grammar and calls the handler.
 * Bending either one into the other's shape would cost more than sharing the
 * two things that actually matter.
 *
 * What is shared, and must stay shared:
 *
 * - **The gate.** A tool call goes through the same `approve` callback, with
 *   the same risk classification, as the pi path. Two ways to reach a shell
 *   with one way to permit it.
 * - **The sink.** The overlay does not know or care which engine ran.
 *
 * Both survive the process boundary, and this file is what makes them. The
 * engine is in a `utilityProcess` (issue #133), so it cannot hold a callback or
 * a `pi` tool: it asks, and this side answers. A token is forwarded as it
 * arrives, so nothing here accumulates a response.
 */

/** Everything the run needs from the caller. */
export interface EmbeddedRun {
  prompt: string;
  systemPrompt: string;
  tools: RiskyTool[];
  onDelta: (text: string) => void;
  onTool: (name: string, phase: 'start' | 'end', isError?: boolean) => void;
  /** Resolve true to allow the call. The same gate the pi path uses. */
  approve: (tool: string, risk: ToolRisk, summary: string) => Promise<boolean>;
  signal: AbortSignal;
}

/** Text fed back to the model when a call is refused. */
const DENIED = 'The user denied this tool call. Do not retry it.';

/** Cap a turn so a runaway loop cannot hold the overlay open. */
const MAX_TOKENS = 800;

/**
 * A fresh context per run, sized here rather than in the engine.
 *
 * Conversation history is not carried between summons yet, so there is nothing
 * to keep alive, and holding a sequence open costs memory for no benefit.
 */
const CONTEXT_SIZE = 4096;

/** The part of a tool call worth showing in an approval prompt. */
export function summarise(args: unknown): string {
  const record =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};
  const command = record.command;
  if (typeof command === 'string') return command;
  const file = record.path;
  if (typeof file === 'string') return file;
  try {
    return JSON.stringify(args ?? null);
  } catch {
    return String(args);
  }
}

/** Flatten a pi tool result into the string the model reads. */
export function textOf(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return 'Done.';
  const text = content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        (part as { type?: unknown }).type === 'text',
    )
    .map((part) => part.text)
    .join('\n');
  return text.length > 0 ? text : 'Done.';
}

/** What the engine is allowed to know about a tool: no functions cross. */
function offer(entry: RiskyTool): ToolOffer {
  return {
    name: entry.tool.name,
    description: entry.tool.description,
    parameters: entry.tool.parameters,
  };
}

/**
 * Gate one call, run it, and answer the engine.
 *
 * Every path answers. The engine is parked inside its own handler waiting for
 * this, and a call that never returns would hold the turn open for the length
 * of the run.
 */
async function serveToolCall(
  run: EmbeddedRun,
  entry: RiskyTool | undefined,
  name: string,
  args: unknown,
): Promise<string> {
  if (!entry) return `Tool failed: ${name} is not available.`;
  if (run.signal.aborted) return 'Cancelled.';

  const allowed = await run.approve(name, riskOf(name, entry.risk), summarise(args));
  if (!allowed) return DENIED;

  run.onTool(name, 'start');
  try {
    const result = await entry.tool.execute(
      `${name}-${String(Date.now())}`,
      args as never,
      run.signal,
    );
    run.onTool(name, 'end');
    return textOf(result);
  } catch (error) {
    run.onTool(name, 'end', true);
    // Returned, not thrown. The model can recover from a tool that failed; it
    // cannot recover from the turn ending.
    return `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Run one turn. Resolves when the engine says the turn is over. */
export function runEmbedded(run: EmbeddedRun): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const byName = new Map(run.tools.map((entry) => [entry.tool.name, entry]));

    const stop = listen(id, (event) => {
      switch (event.kind) {
        case 'delta':
          run.onDelta(event.text);
          return;
        case 'dropped':
          // A dropped tool is the difference between "the model chose not to"
          // and "the model was never offered it", and only one of those is
          // worth debugging the prompt over.
          console.warn(
            `Embedded run: no grammar for ${event.names.join(', ')}. Those tools were not offered.`,
          );
          return;
        case 'tool-call':
          void serveToolCall(run, byName.get(event.name), event.name, event.args).then(
            (text) => {
              send({ kind: 'tool-result', callId: event.callId, text });
            },
          );
          return;
        case 'done':
          stop();
          run.signal.removeEventListener('abort', onAbort);
          resolve();
          return;
        case 'failed':
          stop();
          run.signal.removeEventListener('abort', onAbort);
          reject(new Error(event.reason));
          return;
        default:
          return;
      }
    });

    const onAbort = (): void => {
      send({ kind: 'abort' });
    };
    run.signal.addEventListener('abort', onAbort, { once: true });

    try {
      send({
        kind: 'run',
        id,
        modelPath: modelPath(),
        prompt: run.prompt,
        systemPrompt: run.systemPrompt,
        maxTokens: MAX_TOKENS,
        contextSize: CONTEXT_SIZE,
        tools: run.tools.map(offer),
      });
    } catch (error) {
      // The engine has crashed too often to be started again.
      stop();
      run.signal.removeEventListener('abort', onAbort);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
