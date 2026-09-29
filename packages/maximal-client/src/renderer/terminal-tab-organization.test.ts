import { describe, expect, it } from 'vitest'

import type { AppTab } from './frame/AppFrame'
import {
  createTerminalGroup,
  moveTerminalToGroup,
  removeTerminalFromGroup,
  setTerminalTabColor,
} from './terminal-tab-organization'

const product: AppTab = {
  id: 'overview',
  title: 'Overview',
  icon: 'document',
  kind: 'overview',
  closable: false,
}
const api: AppTab = {
  id: 'terminal:api',
  title: 'API',
  icon: 'terminal',
  kind: 'terminal',
  color: 'purple',
}
const worker: AppTab = {
  id: 'terminal:worker',
  title: 'Worker',
  icon: 'terminal',
  kind: 'terminal',
}
const grouped: AppTab = {
  id: 'terminal:web',
  title: 'Web',
  icon: 'terminal',
  kind: 'terminal',
  group: { id: 'group-web', label: 'Group 1', color: 'green' },
}

describe('terminal tab organization', () => {
  it('creates a numbered group using the tab color', () => {
    const tabs = [product, grouped, api]
    const result = createTerminalGroup(tabs, api.id, 'group-api')

    expect(result).not.toBe(tabs)
    expect(result[2]?.group).toEqual({
      id: 'group-api',
      label: 'Group 2',
      color: 'purple',
    })
    expect(result[0]).toBe(product)
    expect(result[1]).toBe(grouped)
  })

  it('uses blue for an uncolored terminal and rejects non-terminals or missing ids', () => {
    const tabs = [product, worker]
    expect(createTerminalGroup(tabs, worker.id, 'group-worker')[1]?.group).toEqual({
      id: 'group-worker',
      label: 'Group 1',
      color: 'blue',
    })
    expect(createTerminalGroup(tabs, product.id, 'group-product')).toBe(tabs)
    expect(createTerminalGroup(tabs, 'missing', 'group-missing')).toBe(tabs)
  })

  it('moves a terminal after the final member of its target group', () => {
    const tail = { ...grouped, id: 'terminal:web-tests', title: 'Web tests' }
    const after = { ...api, id: 'terminal:after', title: 'After' }
    const result = moveTerminalToGroup(
      [product, grouped, worker, api, tail, after],
      worker.id,
      'group-web',
    )

    expect(result.map((tab) => tab.id)).toEqual([
      product.id,
      grouped.id,
      api.id,
      tail.id,
      worker.id,
      after.id,
    ])
    expect(result[4]?.group).toBe(grouped.group)
    expect(result[5]).toBe(after)
  })

  it('rejects invalid, non-terminal, and already-grouped moves', () => {
    const tail = { ...grouped, id: 'terminal:web-tests', title: 'Web tests' }
    const tabs = [product, grouped, worker, tail]
    expect(moveTerminalToGroup(tabs, 'missing', 'group-web')).toBe(tabs)
    expect(moveTerminalToGroup(tabs, product.id, 'group-web')).toBe(tabs)
    expect(moveTerminalToGroup(tabs, worker.id, 'missing')).toBe(tabs)
    expect(moveTerminalToGroup(tabs, grouped.id, 'group-web')).toBe(tabs)
  })

  it('removes only an existing terminal group', () => {
    const groupedProduct = { ...product, group: grouped.group }
    const tabs = [groupedProduct, grouped, worker]
    const result = removeTerminalFromGroup(tabs, grouped.id)
    expect(result[1]).toEqual({ ...grouped, group: undefined })
    expect(result[0]).toBe(groupedProduct)
    expect(result[2]).toBe(worker)
    expect(removeTerminalFromGroup(tabs, groupedProduct.id)[0]).toBe(groupedProduct)
    const ungroupedWorker = removeTerminalFromGroup(tabs, worker.id)
    expect(ungroupedWorker[1]).toBe(grouped)
    expect(ungroupedWorker[2]).toBe(worker)
  })

  it('sets, clears, and preserves terminal colors', () => {
    const tabs = [product, api, worker]
    expect(setTerminalTabColor(tabs, worker.id, 'orange')[2]?.color).toBe('orange')
    expect(setTerminalTabColor(tabs, api.id)[1]?.color).toBeUndefined()
    expect(setTerminalTabColor(tabs, product.id, 'red')[0]).toBe(product)
    expect(setTerminalTabColor(tabs, api.id, 'purple')[1]).toBe(api)
    expect(setTerminalTabColor(tabs, 'missing', 'red')).toEqual(tabs)
  })
})
