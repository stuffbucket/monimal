import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getOllamaRuntimeStatus,
  launchOllama,
  updateOllamaContextLength,
} from '@maximal/maximal-ollama'

test('compiled Ollama runtime loads under Node', () => {
  for (const method of [
    getOllamaRuntimeStatus,
    launchOllama,
    updateOllamaContextLength,
  ]) {
    assert.equal(typeof method, 'function')
  }
})
