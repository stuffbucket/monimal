import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAdhocUiQueries,
  ratchetUiQueryFindings,
} from '../scripts/check-ui-query-primitives.mjs'

test('finds async capability reads mirrored into state from an effect', () => {
  const findings = findAdhocUiQueries(`
    function Control({ capabilities }) {
      const [value, setValue] = useState(null)
      useEffect(() => {
        void capabilities.settings.get().then(setValue)
      }, [capabilities])
      return value
    }
  `)

  assert.deepEqual(
    findings.map(({ identity, kind }) => ({ identity, kind })),
    [{
      identity:
        'effect-fetch:Control:capabilities.settings.get',
      kind: 'effect-fetch',
    }],
  )
})

test('follows useCallback helpers used by effects', () => {
  const findings = findAdhocUiQueries(`
    function Control({ capabilities }) {
      const [value, setValue] = useState(null)
      const load = useCallback(async () => {
        setValue(await capabilities.settings.get())
      }, [capabilities])
      useEffect(() => {
        void load()
      }, [load])
      return value
    }
  `)

  assert.equal(
    findings[0]?.identity,
    'effect-fetch:Control:capabilities.settings.get',
  )
})

test('finds module caches and direct browser storage', () => {
  const findings = findAdhocUiQueries(`
    const inventoryCache = new WeakMap()
    function read() {
      return localStorage.getItem('inventory')
    }
  `)

  assert.deepEqual(
    findings.map(({ identity }) => identity),
    ['module-cache:inventoryCache', 'browser-storage:localStorage'],
  )
})

test('does not report query invalidation subscriptions or local UI effects', () => {
  const findings = findAdhocUiQueries(`
    function Control({ capabilities, queryClient }) {
      const [open, setOpen] = useState(false)
      useEffect(
        () => capabilities.subscribe(
          () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
        ),
        [capabilities, queryClient],
      )
      useEffect(() => {
        if (open) focusDialog()
      }, [open])
      return open
    }
  `)

  assert.deepEqual(findings, [])
})

test('ratchet rejects new findings and resolved baseline entries', () => {
  const current = new Map([
    ['new.tsx', [{
      identity: 'effect-fetch:New:capabilities.new.get',
      kind: 'effect-fetch',
      line: 3,
      column: 5,
      detail: 'new query',
    }]],
  ])
  const baseline = new Map([
    ['resolved.tsx', ['effect-fetch:Old:capabilities.old.get']],
  ])

  assert.deepEqual(
    ratchetUiQueryFindings(current, baseline).map(
      ({ file, kind, stale }) => ({ file, kind, stale }),
    ),
    [
      { file: 'new.tsx', kind: 'effect-fetch', stale: false },
      { file: 'resolved.tsx', kind: 'stale-baseline', stale: true },
    ],
  )
})
