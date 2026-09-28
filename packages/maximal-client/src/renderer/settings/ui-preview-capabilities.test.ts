import { describe, expect, it, vi } from 'vitest'

import { createPreviewSettingsCapabilities } from './ui-preview-capabilities'

describe('UI preview menu-bar mode', () => {
  it('supports the confirmation flow used by Appearance', async () => {
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
    const capabilities = createPreviewSettingsCapabilities()

    await expect(capabilities.general.menuBarMode()).resolves.toEqual({
      enabled: false,
      pending: false,
    })

    const attempt = await capabilities.general.beginMenuBarOnly()
    expect(attempt).toEqual({
      attemptId: 'preview-menu-bar-1',
      deadlineMs: Date.now() + 15_000,
    })
    await expect(capabilities.general.menuBarMode()).resolves.toEqual({
      enabled: true,
      pending: true,
    })
    await expect(
      capabilities.general.confirmMenuBarOnly(attempt.attemptId),
    ).resolves.toEqual({ enabled: true, pending: false })
  })

  it('reverts or disables menu-bar mode without leaving a pending attempt', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const attempt = await capabilities.general.beginMenuBarOnly()

    await expect(
      capabilities.general.cancelMenuBarOnly(attempt.attemptId),
    ).resolves.toEqual({ enabled: false, pending: false })

    await capabilities.general.beginMenuBarOnly()
    await expect(capabilities.general.disableMenuBarOnly()).resolves.toEqual({
      enabled: false,
      pending: false,
    })
  })

  it('rejects a stale confirmation like the native controller', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    await capabilities.general.beginMenuBarOnly()

    await expect(
      capabilities.general.confirmMenuBarOnly('stale'),
    ).rejects.toThrow('Menu-bar-only confirmation is no longer active')
  })
})