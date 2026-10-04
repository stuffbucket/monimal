import { describe, expect, it } from 'vitest'

import { assertGenericProviderBundle } from './sidecar-bundle-boundary'

const CORDIS_INPUT =
  '../../node_modules/.pnpm/@deepseek-ai+cordis@4.0.2/node_modules/' +
  '@deepseek-ai/cordis/lib/index.js'

describe('provider bundle boundary', () => {
  it('accepts Core, the contract, and the generic host', () => {
    expect(() =>
      assertGenericProviderBundle({
        inputs: {
          '../../packages/maximal-core/dist/cli.js': {},
          '../../packages/maximal-model-contract/dist/index.js': {},
          '../../packages/maximal-models/dist/index.js': {},
          [CORDIS_INPUT]: {},
          'sidecar/main.ts': {},
        },
      }),
    ).not.toThrow()
  })

  it.each([
    '../omlx/node_modules/@maximal/omlx/dist/index.js',
    '../anthropic/node_modules/@maximal/anthropic-provider/dist/index.js',
    '../../node_modules/.pnpm/@deepseek-ai+dsh-llm@0.1.0-rc.8/node_modules/@deepseek-ai/dsh-llm/lib/index.js',
    '../../node_modules/.pnpm/@deepseek-ai+schemastery@3.18.1/node_modules/@deepseek-ai/schemastery/lib/index.js',
    '../../packages/model-runtimes/omlx/dist/index.js',
    '../../packages/model-runtimes/anthropic/dist/index.js',
    '../omlx/dist/index.js',
    '../anthropic-provider/dist/index.js',
  ])('rejects external runtime input %s', (input) => {
    expect(() =>
      assertGenericProviderBundle({ inputs: { [input]: {} } }),
    ).toThrow('entered the Maximal bundle')
  })

  it('rejects malformed metafiles', () => {
    expect(() => assertGenericProviderBundle(null)).toThrow(
      'valid build metafile',
    )
    expect(() => assertGenericProviderBundle({ inputs: [] })).toThrow(
      'valid build metafile',
    )
  })
})
