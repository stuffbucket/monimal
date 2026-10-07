import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readUserPreferencesMock, updateUserPreferencesMock } = vi.hoisted(() => ({
  readUserPreferencesMock: vi.fn<() => Promise<Record<string, unknown>>>(),
  updateUserPreferencesMock: vi.fn<(patch: Record<string, unknown>) => Promise<void>>(),
}))

vi.mock('./preferences/user-preferences.js', () => ({
  readUserPreferences: readUserPreferencesMock,
  updateUserPreferences: updateUserPreferencesMock,
}))

import {
  RENDERER_ENTRY_FILES,
  UiModeController,
  parseUiMode,
  rendererEntry,
  resolveUiMode,
} from './ui-mode.js'

beforeEach(() => {
  readUserPreferencesMock.mockReset().mockResolvedValue({})
  updateUserPreferencesMock.mockReset().mockResolvedValue(undefined)
})

describe('resolveUiMode', () => {
  it('prefers the command line over every other source', () => {
    expect(resolveUiMode({
      switchValue: 'legacy',
      env: 'design-system',
      preference: 'design-system',
      isPackaged: false,
    })).toBe('legacy')
  })

  it('accepts the spike renderer from any source', () => {
    expect(resolveUiMode({ env: 'spike', isPackaged: true })).toBe('spike')
  })

  it('prefers the environment over the saved preference', () => {
    expect(resolveUiMode({ env: 'legacy', preference: 'design-system', isPackaged: false }))
      .toBe('legacy')
  })

  it('uses the saved preference when no launch override is present', () => {
    expect(resolveUiMode({ preference: 'design-system', isPackaged: true }))
      .toBe('design-system')
  })

  it('ignores unrecognised values at every level', () => {
    expect(resolveUiMode({ switchValue: 'x', env: '', preference: 7, isPackaged: true }))
      .toBe('legacy')
  })

  it('defaults development builds to the design system and packaged builds to legacy', () => {
    expect(resolveUiMode({ isPackaged: false })).toBe('design-system')
    expect(resolveUiMode({ isPackaged: true })).toBe('legacy')
  })
})

describe('renderer entries', () => {
  it('maps each mode to a distinct HTML entry', () => {
    expect(rendererEntry('legacy')).toBe('index.html')
    expect(rendererEntry('design-system')).toBe('design-system.html')
    expect(rendererEntry('spike')).toBe('spike.html')
    expect(new Set(RENDERER_ENTRY_FILES).size).toBe(3)
  })

  it('parses only declared modes', () => {
    expect(parseUiMode('design-system')).toBe('design-system')
    expect(parseUiMode('Design-System')).toBeUndefined()
  })
})

describe('UiModeController', () => {
  it('reads the saved preference beneath launch overrides', async () => {
    readUserPreferencesMock.mockResolvedValue({ uiMode: 'legacy' })

    const controller = await UiModeController.load({ isPackaged: false })

    expect(controller.state()).toEqual({ mode: 'legacy', switchable: true })
  })

  it('switches the session mode and persists it', async () => {
    const controller = new UiModeController('legacy', true)

    await controller.set('design-system')

    expect(controller.mode).toBe('design-system')
    expect(updateUserPreferencesMock).toHaveBeenCalledWith({ uiMode: 'design-system' })
  })

  it('rejects unknown modes without persisting', async () => {
    const controller = new UiModeController('legacy', true)

    await expect(controller.set('neither')).rejects.toThrow(TypeError)
    expect(controller.mode).toBe('legacy')
    expect(updateUserPreferencesMock).not.toHaveBeenCalled()
  })

  it('refuses to switch in packaged builds', async () => {
    const controller = new UiModeController('legacy', false)

    await expect(controller.set('design-system')).rejects.toThrow('not switchable')
    expect(controller.mode).toBe('legacy')
    expect(updateUserPreferencesMock).not.toHaveBeenCalled()
  })
})
