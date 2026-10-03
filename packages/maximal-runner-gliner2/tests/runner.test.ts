import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { runSystemOneDecision } from '@maximal/maximal-provider-decision-model'

import {
  GLINER2_MODELS,
  Gliner2ModelRunner,
  resolveGliner2Model,
} from '../src/index.js'

const workerPath = fileURLToPath(
  new URL('./fixtures/fake-worker.mjs', import.meta.url),
)
const runners: Gliner2ModelRunner[] = []

function runner(
  workerEnvironment: Readonly<Record<string, string>> = {},
): Gliner2ModelRunner {
  const created = new Gliner2ModelRunner({
    cacheDirectory: '/tmp/maximal-gliner2-test-cache',
    pythonExecutable: process.execPath,
    workerEnvironment,
    workerPath,
  })
  runners.push(created)
  return created
}

afterEach(async () => {
  await Promise.all(runners.splice(0).map(async (item) => await item.dispose()))
})

describe('GLiNER2 model registry', () => {
  it('pins every supported model to an immutable revision and weight digest', () => {
    expect(GLINER2_MODELS).toHaveLength(3)
    for (const model of GLINER2_MODELS) {
      expect(model.revision).toMatch(/^[\da-f]{40}$/u)
      expect(model.weightSha256).toMatch(/^[\da-f]{64}$/u)
      expect(model.weightBytes).toBeGreaterThan(1_000_000_000)
    }
  })

  it('resolves provider aliases to the canonical model', () => {
    expect(resolveGliner2Model('gliner25:340m').model).toBe(
      'fastino/GLiNER2.5-Decide',
    )
    expect(resolveGliner2Model('fastino/GLiNER2.5-multi-Decide').model).toBe(
      'fastino/GLiNER2.5-multi-Decide',
    )
    expect(() => resolveGliner2Model('nimble:latest')).toThrow(
      'Unsupported GLiNER2 model',
    )
  })

  it('ships notices for every pinned external runtime and model', () => {
    const packageManifest = readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    )
    expect(packageManifest).toContain('"THIRD_PARTY_NOTICES.md"')

    const notices = readFileSync(
      new URL('../THIRD_PARTY_NOTICES.md', import.meta.url),
      'utf8',
    )
    expect(notices).toContain('gliner2[local]==2.0.0')
    expect(notices).toContain('torch==2.7.0')
    expect(notices).toContain('transformers==4.57.6')
    for (const model of GLINER2_MODELS) {
      expect(notices).toContain(model.model)
      expect(notices).toContain(model.revision)
    }
  })
})

describe('Gliner2ModelRunner', () => {
  it('advertises and executes label classification', async () => {
    const modelRunner = runner()
    const result = await modelRunner.execute(
      {
        kind: 'classify-labels',
        model: 'gliner25:340m',
        text: 'Please refund the duplicate charge.',
        tasks: [
          {
            name: 'intent',
            labels: [
              { value: 'refund', description: 'asks for money back' },
              { value: 'other' },
            ],
          },
        ],
      },
      { signal: new AbortController().signal },
    )

    expect(modelRunner.operations).toEqual(['classify-labels'])
    expect(result).toEqual({
      kind: 'classify-labels',
      model: 'gliner25:340m',
      tasks: [
        {
          name: 'intent',
          probabilities: { refund: 0.75, other: 0.25 },
        },
      ],
      usage: { inputTokens: 12, outputTokens: 0 },
    })
  })

  it('executes requests compiled by the decision-model provider', async () => {
    const response = await runSystemOneDecision(
      {
        model: 'gliner25:340m',
        state: { message: 'Please refund the duplicate charge.' },
        questions: {
          route: {
            type: 'choice',
            instructions: 'Where should this message go?',
            criteria: {
              refunds: 'Requests for money back',
              other: 'Everything else',
            },
          },
        },
      },
      runner(),
      new AbortController().signal,
    )

    expect(response.model).toBe('gliner25:340m')
    expect(response.answers.route).toMatchObject({
      type: 'choice',
      choice: 'refunds',
    })
    expect(response.usage).toEqual({ input_tokens: 12, output_tokens: 0 })
  })

  it('rejects unsupported operations before starting the worker', async () => {
    await expect(
      runner().execute(
        {
          kind: 'generate',
          model: 'gliner25:340m',
          messages: [],
          maxOutputTokens: 1,
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('does not support generate')
  })

  it('rejects a worker protocol mismatch', async () => {
    await expect(
      runner({ FAKE_GLINER_PROTOCOL: '2' }).execute(
        {
          kind: 'classify-labels',
          model: 'gliner25:340m',
          text: 'text',
          tasks: [{ name: 'answer', labels: [{ value: 'yes' }] }],
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('worker protocol is 2; expected 1')
  })

  it('terminates an in-flight worker when the request is cancelled', async () => {
    const controller = new AbortController()
    const execution = runner({ FAKE_GLINER_HANG: '1' }).execute(
      {
        kind: 'classify-labels',
        model: 'gliner25:340m',
        text: 'text',
        tasks: [{ name: 'answer', labels: [{ value: 'yes' }] }],
      },
      { signal: controller.signal },
    )
    await new Promise((resolve) => setTimeout(resolve, 25))
    controller.abort(new Error('cancelled'))

    await expect(execution).rejects.toThrow('cancelled')
  })

  it('rejects concurrent work before either request reaches the worker', async () => {
    const modelRunner = runner({ FAKE_GLINER_HANG: '1' })
    const controller = new AbortController()
    const first = modelRunner.execute(
      {
        kind: 'classify-labels',
        model: 'gliner25:340m',
        text: 'first',
        tasks: [{ name: 'answer', labels: [{ value: 'yes' }] }],
      },
      { signal: controller.signal },
    )
    await expect(
      modelRunner.execute(
        {
          kind: 'classify-labels',
          model: 'gliner25:340m',
          text: 'second',
          tasks: [{ name: 'answer', labels: [{ value: 'yes' }] }],
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('runner is busy')
    controller.abort(new Error('cancelled'))
    await expect(first).rejects.toThrow('cancelled')
  })
})
