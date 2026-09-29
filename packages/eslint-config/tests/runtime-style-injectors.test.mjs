import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAdhocStyles,
  findStyleInjectors,
} from '../scripts/check-runtime-style-injectors.mjs'

test('finds direct and receiver-agnostic style element creation', () => {
  assert.deepEqual(
    findStyleInjectors(`
    document.createElement('style')
    target.createElement("style")
    document.createElement('div')
  `),
    [2, 3],
  )
})

test('parses TypeScript and JSX while scanning', () => {
  assert.deepEqual(
    findAdhocStyles(
      `
    const target: Document = document
    const view = <div style={{ width: size }}><style>{css}</style></div>
    const html = \`<html><style>body { margin: 0 }</style></html>\`
    target.createElement('style')
  `,
      'source.tsx',
    ),
    {
      injectors: [5],
      inlineAttributes: [3],
      literalTags: [3, 4],
    },
  )
})

test('counts every style tag in a template literal', () => {
  assert.deepEqual(
    findAdhocStyles(`
      const html = \`<style>one</style>
        <STYLE media="screen">two</STYLE>\`
    `).literalTags,
    [2, 3],
  )
})
