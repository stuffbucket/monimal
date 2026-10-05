import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const SETS = [
  { source: '../src/icons/compact/icons.sheet.svg', width: 5312, height: 3296, count: 133, namespaces: ['icon.16.'] },
  { source: '../src/icons/prominent/icons.sheet.svg', width: 8000, height: 6944, count: 634, namespaces: ['icon.24.', 'icon.16.'] },
  { source: '../src/icons/stroke-endpoints/icons.sheet.svg', width: 3968, height: 1632, count: 34, namespaces: ['icon.16.stroke.'] },
]

test('icon sheets preserve dimensions, unique IDs, and hierarchy namespaces', () => {
  for (const set of SETS) {
    const svg = readFileSync(new URL(set.source, import.meta.url), 'utf8')
    assert.match(svg, new RegExp(`<svg width="${String(set.width)}" height="${String(set.height)}"`))

    const ids = [...svg.matchAll(/id="(icon\.[^"]+)"/g)].map((match) => match[1])
    assert.equal(ids.length, set.count, set.source)
    assert.equal(new Set(ids).size, set.count, `${set.source} contains duplicate icon IDs`)
    assert.ok(
      ids.every((id) => set.namespaces.some((namespace) => id?.startsWith(namespace))),
      set.source,
    )
  }
})
