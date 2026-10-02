import { expect, it } from 'vitest'
import { PRODUCT_TABS, PROJECTS_TAB, SETTINGS_TAB, type AppTab } from './AppFrame'
import { documentTabs, tabAfterClose } from './document-tabs'

const terminal: AppTab = { id: 'terminal:one', title: 'Shell', kind: 'terminal' }

it('keeps permanent workbar destinations outside the document strip', () => {
  expect(documentTabs([...PRODUCT_TABS, PROJECTS_TAB, terminal, SETTINGS_TAB]).map(tab => tab.id))
    .toEqual(['projects', terminal.id, 'settings'])
})

it('selects neighboring documents instead of hidden product entries', () => {
  const tabs = [...PRODUCT_TABS, PROJECTS_TAB, terminal, SETTINGS_TAB]
  expect(tabAfterClose(tabs, PROJECTS_TAB.id, 'overview')).toBe(terminal.id)
  expect(tabAfterClose(tabs, terminal.id, 'overview')).toBe(SETTINGS_TAB.id)
  expect(tabAfterClose(tabs, SETTINGS_TAB.id, 'overview')).toBe(terminal.id)
})

it('returns to the previously selected workspace when the last document closes', () => {
  expect(tabAfterClose([...PRODUCT_TABS, PROJECTS_TAB], PROJECTS_TAB.id, 'traffic')).toBe('traffic')
  expect(tabAfterClose([...PRODUCT_TABS, SETTINGS_TAB], SETTINGS_TAB.id, 'terminals')).toBe('terminals')
})
