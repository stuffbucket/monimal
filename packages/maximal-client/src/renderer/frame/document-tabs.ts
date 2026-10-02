import { WORKBAR_ITEMS } from './workbar-layout'

interface DocumentCandidate {
  id: string
  kind: string
}

export function documentTabs<T extends DocumentCandidate>(tabs: T[]): T[] {
  return tabs.filter((tab) => tab.kind === 'projects'
    || !WORKBAR_ITEMS.some((item) => item.id === tab.kind))
}

export function tabAfterClose(tabs: DocumentCandidate[], id: string, workspaceId: string): string {
  // Permanent workbar destinations are not neighbors in the document strip.
  const documents = documentTabs(tabs)
  const index = documents.findIndex((tab) => tab.id === id)
  const remaining = documents.filter((tab) => tab.id !== id)
  return (remaining[index] ?? remaining[index - 1])?.id ?? workspaceId
}
