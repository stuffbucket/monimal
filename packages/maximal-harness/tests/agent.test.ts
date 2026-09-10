import path from 'node:path';
import os from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }));

import {
  configureAgent,
  isAgentBusy,
  runAgent,
  type AgentSink,
} from '../src/host/agent.js';
import { configureModel } from '../src/host/llama.js';
import { registerToolset } from '../src/host/toolsets.js';

const originalProvider = process.env['STUFFBUCKET_PROVIDER'];
const originalProviderUrl = process.env['STUFFBUCKET_PROVIDER_URL'];

function sink(results: Array<{ ok: true } | { ok: false; error: string }>): AgentSink {
  return {
    onDelta: () => undefined,
    onTool: () => undefined,
    onApproval: () => undefined,
    onEnd: (result) => results.push(result),
  };
}

afterEach(() => {
  if (originalProvider === undefined) delete process.env['STUFFBUCKET_PROVIDER'];
  else process.env['STUFFBUCKET_PROVIDER'] = originalProvider;
  if (originalProviderUrl === undefined) delete process.env['STUFFBUCKET_PROVIDER_URL'];
  else process.env['STUFFBUCKET_PROVIDER_URL'] = originalProviderUrl;
  vi.unstubAllGlobals();
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
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
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
});
