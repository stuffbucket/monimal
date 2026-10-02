import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TabBar } from '../src/renderer/components/TabBar.js'
import { decodeTabTransfer, encodeTabTransfer } from '../src/renderer/lib/tab-transfer.js'

it('preserves a renderer-owned document snapshot in the shared drag protocol', () => {
  const transfer = {
    version: 1 as const, sourceFrameId: 'source', tabId: 'projects',
    document: { kind: 'projects', state: '{"version":1}' },
  }
  expect(decodeTabTransfer(encodeTabTransfer(transfer))).toEqual(transfer)
})

it('drops malformed document metadata without changing valid tab identity', () => {
  expect(decodeTabTransfer(JSON.stringify({
    version: 1, sourceFrameId: 'source', tabId: 'projects',
    document: { kind: 'projects', state: 42 },
  }))).toEqual({ version: 1, sourceFrameId: 'source', tabId: 'projects' })
})

it.each([
  { closable: true, visible: true },
  { closable: false, visible: false },
  { closable: undefined, visible: false },
])('honors explicit last-tab closing: $closable', ({ closable, visible }) => {
  const markup = renderToStaticMarkup(createElement(TabBar, {
    tabIdBase: 'documents',
    tabs: [{ id: 'projects', title: 'Projects', closable }],
    active: 'projects',
    onSelect: () => {},
    onClose: () => {},
  }))
  expect(markup.includes('aria-label="Close Projects"')).toBe(visible)
})
