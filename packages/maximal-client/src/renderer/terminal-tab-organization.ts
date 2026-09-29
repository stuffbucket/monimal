import type { TabColor, TabGroup } from '@maximal/maximal-electron/renderer'

import type { AppTab } from './frame/AppFrame'

export function createTerminalGroup(
  tabs: AppTab[],
  tabId: string,
  groupId: string,
): AppTab[] {
  const tab = tabs.find((candidate) => candidate.id === tabId)
  if (tab?.kind !== 'terminal') return tabs
  const groupNumber = new Set(tabs.flatMap((candidate) =>
    candidate.group?.id ?? [])).size + 1
  const group: TabGroup = {
    id: groupId,
    label: `Group ${groupNumber}`,
    color: tab.color ?? 'blue',
  }
  return tabs.map((candidate) =>
    candidate.id === tabId ? { ...candidate, group } : candidate)
}

export function moveTerminalToGroup(
  tabs: AppTab[],
  tabId: string,
  groupId: string,
): AppTab[] {
  const tab = tabs.find((candidate) => candidate.id === tabId)
  const group = tabs.find((candidate) => candidate.group?.id === groupId)?.group
  if (tab?.kind !== 'terminal' || !group || tab.group?.id === groupId) return tabs
  const groupedTab = { ...tab, group }
  const remaining = tabs.filter((candidate) => candidate.id !== tabId)
  const insertAt = remaining.reduce(
    (lastIndex, candidate, index) =>
      candidate.group?.id === groupId ? index + 1 : lastIndex,
    0,
  )
  return [
    ...remaining.slice(0, insertAt),
    groupedTab,
    ...remaining.slice(insertAt),
  ]
}

export function removeTerminalFromGroup(tabs: AppTab[], tabId: string): AppTab[] {
  return tabs.map((tab) =>
    tab.id === tabId && tab.kind === 'terminal' && tab.group !== undefined
      ? { ...tab, group: undefined }
      : tab)
}

export function setTerminalTabColor(
  tabs: AppTab[],
  tabId: string,
  color?: TabColor,
): AppTab[] {
  return tabs.map((tab) =>
    tab.id === tabId && tab.kind === 'terminal' && tab.color !== color
      ? { ...tab, color }
      : tab)
}
