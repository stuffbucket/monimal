import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureModel } from '@maximal/maximal-llama-cpp';

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }));

import {
  configureAgent,
  discoverProvider,
  isAgentBusy,
  runAgent,
  shutdownAgent,
  type AgentSink,
} from '../src/host/agent.js';
import { registerToolset } from '../src/host/toolsets.js';

const originalProvider = process.env['STUFFBUCKET_PROVIDER'];
const originalProviderUrl = process.env['STUFFBUCKET_PROVIDER_URL'];
const directories: string[] = [];

const agentOptions = {
  systemPrompt: 'Test prompt',
  codingTools: false,
  approval: 'writes' as const,
  cwd: os.tmpdir(),
};

async function modelDirectory(files: readonly string[] = []): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'maximal-harness-models-'));
  directories.push(directory);
  await Promise.all(files.map((file) => writeFile(path.join(directory, file), 'gguf')));
  configureModel({ directory });
  return directory;
}

function sink(results: Array<{ ok: true } | { ok: false; error: string }>): AgentSink {
  return {
    onDelta: () => undefined,
    onTool: () => undefined,
    onApproval: () => undefined,
    onEnd: (result) => results.push(result),
  };
}

afterEach(async () => {
  if (originalProvider === undefined) delete process.env['STUFFBUCKET_PROVIDER'];
  else process.env['STUFFBUCKET_PROVIDER'] = originalProvider;
  if (originalProviderUrl === undefined) delete process.env['STUFFBUCKET_PROVIDER_URL'];
  else process.env['STUFFBUCKET_PROVIDER_URL'] = originalProviderUrl;
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('discoverProvider', () => {
  it.each([
    ['maximal:cloud-model', 'maximal', 'cloud-model'],
    ['ollama:qwen3:4b', 'ollama', 'qwen3:4b'],
  ] as const)(
    'selects the available preferred model %s',
    async (preferredModel, provider, model) => {
      delete process.env['STUFFBUCKET_PROVIDER'];
      await modelDirectory(['local.gguf']);
      configureAgent({ ...agentOptions, preferredModel });
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string | URL | Request) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          return Promise.resolve(
            url.endsWith('/v1/models')
              ? Response.json({ data: [{ id: 'cloud-model' }] })
              : Response.json({ models: [{ name: 'qwen3:4b' }] }),
          );
        }),
      );

      await expect(discoverProvider()).resolves.toMatchObject({
        state: 'ready',
        provider,
        model,
        modelKey: preferredModel,
      });
    },
  );

  it('selects a preferred GGUF from the shared embedded inventory', async () => {
    delete process.env['STUFFBUCKET_PROVIDER'];
    await modelDirectory(['first.gguf', 'preferred.gguf']);
    configureAgent({
      ...agentOptions,
      preferredModel: 'embedded:preferred.gguf',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    );

    await expect(discoverProvider()).resolves.toMatchObject({
      state: 'ready',
      provider: 'embedded',
      model: 'preferred.gguf',
      modelKey: 'embedded:preferred.gguf',
    });
  });

  it('requires selection when a stale preference has alternatives', async () => {
    delete process.env['STUFFBUCKET_PROVIDER'];
    await modelDirectory(['available.gguf']);
    configureAgent({
      ...agentOptions,
      preferredModel: 'embedded:missing.gguf',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    );

    await expect(discoverProvider()).resolves.toEqual({
      state: 'select-model',
      preferredModel: 'embedded:missing.gguf',
      models: [{
        key: 'embedded:available.gguf',
        label: 'available',
        model: 'available.gguf',
        provider: 'embedded',
      }],
    });
  });

  it('offers the fallback download only when no models are available', async () => {
    delete process.env['STUFFBUCKET_PROVIDER'];
    await modelDirectory();
    configureAgent(agentOptions);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    );

    await expect(discoverProvider()).resolves.toMatchObject({
      state: 'needs-model',
      model: 'Qwen3 0.6B',
    });
  });

  it('preserves provider pin auto-selection for support workflows', async () => {
    process.env['STUFFBUCKET_PROVIDER'] = 'embedded';
    await modelDirectory(['second.gguf', 'first.gguf']);
    configureAgent(agentOptions);

    await expect(discoverProvider()).resolves.toMatchObject({
      state: 'ready',
      provider: 'embedded',
      model: 'first.gguf',
    });
  });
});

describe('runAgent', () => {
  it('reserves the run before asynchronous provider discovery completes', async () => {
    process.env['STUFFBUCKET_PROVIDER'] = 'embedded';
    configureModel({ directory: path.join(os.tmpdir(), 'maximal-harness-missing-model') });

    const firstResults: Array<{ ok: true } | { ok: false; error: string }> = [];
    const secondResults: Array<{ ok: true } | { ok: false; error: string }> = [];

    const first = runAgent('first', sink(firstResults));
    expect(isAgentBusy()).toBe(true);

    await runAgent('second', sink(secondResults));

    expect(secondResults).toEqual([
      { ok: false, error: 'Already working on the previous request.' },
    ]);
    expect(isAgentBusy()).toBe(true);

    await first;

    expect(firstResults).toEqual([
      { ok: false, error: 'The Qwen3 0.6B model has not been downloaded yet.' },
    ]);
    expect(isAgentBusy()).toBe(false);
  });

  it('reports setup failures through the end event without rejecting', async () => {
    process.env['STUFFBUCKET_PROVIDER'] = 'maximal';
    process.env['STUFFBUCKET_PROVIDER_URL'] = 'http://127.0.0.1:4141';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(Response.json({ data: [{ id: 'test-model' }] })),
      ),
    );
    configureAgent({
      systemPrompt: 'Test prompt',
      codingTools: false,
      approval: 'writes',
      cwd: os.tmpdir(),
      toolsetIds: ['broken'],
    });
    const unregister = registerToolset({
      id: 'broken',
      build: () => {
        throw new Error('Toolset setup failed.');
      },
    });
    const results: Array<{ ok: true } | { ok: false; error: string }> = [];

    try {
      await expect(runAgent('test', sink(results))).resolves.toBeUndefined();
    } finally {
      unregister();
    }

    expect(results).toEqual([{ ok: false, error: 'Toolset setup failed.' }]);
    expect(isAgentBusy()).toBe(false);
  });

  it('waits for the in-flight run to settle during shutdown', async () => {
    process.env['STUFFBUCKET_PROVIDER'] = 'maximal';
    process.env['STUFFBUCKET_PROVIDER_URL'] = 'http://127.0.0.1:4141';
    let finishProbe: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => {
        finishProbe = resolve;
      })),
    );
    const results: Array<{ ok: true } | { ok: false; error: string }> = [];
    const run = runAgent('test', sink(results));
    let shutdownSettled = false;
    const shutdown = shutdownAgent().then(() => {
      shutdownSettled = true;
    });

    await Promise.resolve();
    expect(isAgentBusy()).toBe(true);
    expect(shutdownSettled).toBe(false);

    finishProbe(new Response('{}', { status: 503 }));
    await shutdown;
    await run;

    expect(shutdownSettled).toBe(true);
    expect(isAgentBusy()).toBe(false);
    expect(results).toEqual([{ ok: false, error: 'No maximal backend answered.' }]);
  });
});
