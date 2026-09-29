import { describe, expect, it } from 'vitest'

import type { ControlResult } from '@maximal/maximal-client/shared/host'

import {
  createCoreControlOperations,
  type ControlMethod,
} from './core-control-operations'

describe('Core control response compatibility', () => {
  it('accepts Ollama account results from a Core without error codes', async () => {
    const legacyResult = {
      accounts: [
        {
          type: 'ollama',
          provider: 'ollama',
          endpoint: 'local-endpoint',
          scope: 'remote',
          account_state: 'unauthenticated',
          availability: 'unavailable',
          model_count: null,
        },
        {
          type: 'ollama',
          provider: 'ollama-cloud',
          endpoint: 'cloud-endpoint',
          scope: 'remote',
          account_state: 'authenticated',
          availability: 'unavailable',
          model_count: null,
        },
      ],
    }
    function call<T>(
      _method: ControlMethod,
      parse: (input: unknown) => T,
    ): Promise<ControlResult<T>> {
      return Promise.resolve({
        ok: true,
        value: parse(legacyResult),
      })
    }

    const result = await createCoreControlOperations(call).ollamaAccountsList()

    expect(result).toEqual({
      ok: true,
      value: {
        accounts: [
          { ...legacyResult.accounts[0], error_code: null },
          { ...legacyResult.accounts[1], error_code: null },
        ],
      },
    })
  })
})
