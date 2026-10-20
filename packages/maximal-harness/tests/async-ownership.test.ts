import { describe, expect, it } from 'vitest'

import {
  isCurrentGeneration,
  matchesApproval,
  matchesDownload,
  matchesOwnership,
} from '../src/renderer/async-ownership.js'

describe('async ownership', () => {
  it('matches only a defined identical operation identity', () => {
    expect(matchesOwnership('run-1', 'run-1')).toBe(true)
    expect(matchesOwnership('run-1', 'run-2')).toBe(false)
    expect(matchesOwnership(undefined, 'run-1')).toBe(false)
  })

  it('matches both the download operation and model', () => {
    const active = { downloadId: 'download-1', model: 'model-a' }

    expect(matchesDownload(active, active)).toBe(true)
    expect(matchesDownload(active, {
      downloadId: 'download-2',
      model: 'model-a',
    })).toBe(false)
    expect(matchesDownload(active, {
      downloadId: 'download-1',
      model: 'model-b',
    })).toBe(false)
    expect(matchesDownload(undefined, active)).toBe(false)
  })

  it('matches the run and current approval together', () => {
    const active = { runId: 'run-1', id: 'approval-1' }

    expect(matchesApproval('run-1', active, active)).toBe(true)
    expect(matchesApproval('run-2', active, active)).toBe(false)
    expect(matchesApproval(undefined, active, active)).toBe(false)
    expect(matchesApproval('run-1', undefined, active)).toBe(false)
    expect(matchesApproval('run-1', active, {
      runId: 'run-2',
      id: 'approval-1',
    })).toBe(false)
    expect(matchesApproval('run-1', active, {
      runId: 'run-1',
      id: 'approval-2',
    })).toBe(false)
  })

  it('matches only the captured generation', () => {
    expect(isCurrentGeneration(3, 3)).toBe(true)
    expect(isCurrentGeneration(3, 2)).toBe(false)
  })
})
