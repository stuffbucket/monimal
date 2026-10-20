export interface OwnedDownload {
  downloadId: string
  model: string
}

export interface OwnedApproval {
  runId: string
  id: string
}

export function matchesOwnership(
  activeId: string | undefined,
  candidateId: string,
): boolean {
  return activeId === candidateId
}

export function matchesDownload(
  active: OwnedDownload | undefined,
  candidate: OwnedDownload,
): boolean {
  return active !== undefined
    && active.downloadId === candidate.downloadId
    && active.model === candidate.model
}

export function matchesApproval(
  activeRunId: string | undefined,
  activeApproval: OwnedApproval | undefined,
  candidate: OwnedApproval,
): boolean {
  return matchesOwnership(activeRunId, candidate.runId)
    && activeApproval?.runId === candidate.runId
    && activeApproval.id === candidate.id
}

export function isCurrentGeneration(
  currentGeneration: number,
  candidateGeneration: number,
): boolean {
  return currentGeneration === candidateGeneration
}
