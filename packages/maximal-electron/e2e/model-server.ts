import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A scripted model backend, so the overlay's agent scenarios need no model.
 *
 * ## What this is
 *
 * An HTTP server that speaks the two endpoints discovery uses for Ollama:
 * `/api/tags` to say what is installed, and `/v1/chat/completions` to answer.
 * The application reaches it through `STUFFBUCKET_PROVIDER=ollama` and
 * `STUFFBUCKET_PROVIDER_URL`, which `src/main/native/provider-endpoint.ts`
 * restricts to a loopback address.
 *
 * Everything downstream of the token stream is real: pi-ai's HTTP client and
 * SSE parser, pi-agent-core's tool loop, `beforeToolCall`, the risk
 * classification, the IPC events, and the card. Only the generator is faked.
 *
 * ## What it does not prove
 *
 * The rules below match the prompt with a regular expression. That covers the
 * plumbing and the approval gate; it says nothing about whether a real model
 * picks the right tool out of a natural request. Nothing automated covers that
 * on a runner with no model, and the scenarios say so where it matters.
 *
 * A scripted reply also cannot prove a tool ran: this server chooses what comes
 * back, so an assertion on the answer text would pass with the shell never
 * touched. The scenarios assert against the filesystem for that.
 */

/** Named in `/api/tags`, and distinctive so a real Ollama cannot be mistaken for it. */
export const SCRIPTED_MODEL = 'scripted-e2e';

/** What the fallback rule streams. Loud, so a prompt nothing matched is visible. */
export const NO_RULE = 'SCRIPT_NO_RULE';

/** One turn from the scripted model. */
type ScriptedReply =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; arguments: Record<string, unknown> };

export interface ScriptedRule {
  /** Matched against the newest user prompt. */
  when: RegExp;
  reply: (match: RegExpMatchArray) => ScriptedReply;
}

/**
 * The script.
 *
 * Ordered: the first rule that matches wins. The patterns are written against
 * the prompts the scenarios send, and a prompt that matches none of them gets
 * `NO_RULE` rather than a plausible answer.
 */
export const RULES: ScriptedRule[] = [
  {
    // "Use your bash tool to run: <command>" with an optional trailing clause
    // after an em dash, which is how the scenario phrases it.
    when: /bash tool to run:\s*(.+?)\s*(?:—.*)?$/,
    reply: (match) => ({
      kind: 'tool',
      name: 'bash',
      arguments: { command: match[1] ?? '' },
    }),
  },
  {
    when: /\b(light|dark|system) theme\b/,
    reply: (match) => ({
      kind: 'tool',
      name: 'set_theme',
      arguments: { theme: match[1] ?? '' },
    }),
  },
  {
    when: /Reply with (?:exactly|the single word):\s*(\S+)/,
    reply: (match) => ({ kind: 'text', text: match[1] ?? '' }),
  },
];

/** One completion the server answered, for a scope assertion. */
export interface ScriptedCall {
  /** The newest user prompt in the request. */
  prompt: string;
  /** Tool output the agent sent back, newest last. */
  toolResults: string[];
  reply: ScriptedReply;
}

export interface ScriptedModel {
  /** Pass to `STUFFBUCKET_PROVIDER_URL`. */
  baseUrl: string;
  /** Every completion this server answered. A scenario that reached no model has none. */
  calls: ScriptedCall[];
  stop: () => Promise<void>;
}

/* ------------------------------------------------------------------ parsing */

interface RequestMessage {
  role?: unknown;
  content?: unknown;
}

/** Message content as text, whether the client sent a string or blocks. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (block as { text?: unknown }).text)
    .filter((text): text is string => typeof text === 'string')
    .join('\n');
}

function messagesOf(body: string): RequestMessage[] {
  const parsed: unknown = JSON.parse(body);
  const messages = (parsed as { messages?: unknown }).messages;
  return Array.isArray(messages) ? (messages as RequestMessage[]) : [];
}

/** What the script answers, given the conversation so far. */
function decide(messages: RequestMessage[], rules: ScriptedRule[]): ScriptedCall {
  const prompts = messages.filter((message) => message.role === 'user');
  const prompt = textOf(prompts[prompts.length - 1]?.content);
  const toolResults = messages
    .filter((message) => message.role === 'tool')
    .map((message) => textOf(message.content));

  // A tool has answered, so the turn is to report it. Echoing the output is
  // what lets a scenario see that the result travelled back to the model.
  const newest = messages[messages.length - 1];
  if (newest?.role === 'tool') {
    return {
      prompt,
      toolResults,
      reply: { kind: 'text', text: `Done. ${textOf(newest.content)}` },
    };
  }

  for (const rule of rules) {
    const match = prompt.match(rule.when);
    if (match) return { prompt, toolResults, reply: rule.reply(match) };
  }

  return { prompt, toolResults, reply: { kind: 'text', text: NO_RULE } };
}

/* ------------------------------------------------------------------ writing */

function chunk(delta: unknown, finish: string | null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-scripted',
    object: 'chat.completion.chunk',
    created: 0,
    model: SCRIPTED_MODEL,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

/**
 * Write one turn as OpenAI-compatible server-sent events.
 *
 * Text goes out in several deltas rather than one. The card renders
 * incrementally, and a single delta would not exercise that.
 */
function writeReply(response: ServerResponse, reply: ScriptedReply): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  response.write(chunk({ role: 'assistant', content: '' }, null));

  if (reply.kind === 'text') {
    for (const piece of reply.text.match(/.{1,4}/gs) ?? []) {
      response.write(chunk({ content: piece }, null));
    }
    response.write(chunk({}, 'stop'));
  } else {
    response.write(
      chunk(
        {
          tool_calls: [
            {
              index: 0,
              id: 'call-scripted-1',
              type: 'function',
              function: { name: reply.name, arguments: '' },
            },
          ],
        },
        null,
      ),
    );
    response.write(
      chunk(
        {
          tool_calls: [
            {
              index: 0,
              function: { arguments: JSON.stringify(reply.arguments) },
            },
          ],
        },
        null,
      ),
    );
    response.write(chunk({}, 'tool_calls'));
  }

  response.write('data: [DONE]\n\n');
  response.end();
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (piece: string) => {
      body += piece;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

/* ------------------------------------------------------------------ serving */

/**
 * Start the scripted backend on a loopback port the operating system picks.
 *
 * A fixed port would collide with a real Ollama on a developer's machine, and
 * the point of this is that the scenarios stop depending on what is installed.
 */
export async function startScriptedModel(
  rules: ScriptedRule[] = RULES,
): Promise<ScriptedModel> {
  const calls: ScriptedCall[] = [];

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = request.url ?? '';

      if (request.method === 'GET' && url.startsWith('/api/tags')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ models: [{ name: SCRIPTED_MODEL }] }));
        return;
      }

      if (request.method === 'POST' && url.startsWith('/v1/chat/completions')) {
        const call = decide(messagesOf(await readBody(request)), rules);
        calls.push(call);
        writeReply(response, call.reply);
        return;
      }

      response.writeHead(404).end();
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    calls,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
