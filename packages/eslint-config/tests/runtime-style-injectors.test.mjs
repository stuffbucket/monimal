import assert from 'node:assert/strict'
import test from 'node:test'

import { findStyleInjectors } from '../scripts/check-runtime-style-injectors.mjs'

test('finds direct and receiver-agnostic style element creation', () => {
  assert.deepEqual(findStyleInjectors(`
    document.createElement('style')
    target.createElement("style")
    document.createElement('div')
  `), [2, 3])
})

test('parses TypeScript and JSX while scanning', () => {
  assert.deepEqual(findStyleInjectors(`
    const target: Document = document
    const view = <div />
    target.createElement('style')
  `, 'source.tsx'), [4])
})