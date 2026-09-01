import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Identity is what the operating system shows: the menu bar's application
 * name, and the dock icon. Both are set through Electron surfaces rather than
 * through anything this app renders, so the fakes below are the only way to
 * observe them.
 *
 * The behaviour worth pinning is the conditional half. Setting a dock icon
 * from a missing or unreadable file does not fail loudly — `nativeImage`
 * returns an empty image, and handing that to `setIcon` clears the icon rather
 * than leaving the default in place. Each guard here corresponds to a way the
 * app could end up with no icon at all.
 */

const { setName, setIcon, isPackaged, buildFromTemplate, setApplicationMenu, createFromPath, existsSync } =
  vi.hoisted(() => ({
    setName: vi.fn(),
    setIcon: vi.fn(),
    isPackaged: { value: false },
    buildFromTemplate: vi.fn((template: unknown) => template),
    setApplicationMenu: vi.fn(),
    createFromPath: vi.fn((): { isEmpty: () => boolean } => ({ isEmpty: () => false })),
    existsSync: vi.fn(() => true),
  }))

vi.mock('electron', () => ({
  app: {
    name: 'Maximal',
    setName,
    get isPackaged() {
      return isPackaged.value
    },
    dock: { setIcon },
    getAppPath: () => '/app',
  },
  Menu: { buildFromTemplate, setApplicationMenu },
  nativeImage: { createFromPath },
  shell: { openExternal: vi.fn() },
}))

vi.mock('node:fs', () => ({ existsSync }))

const { applyAppName, applyDockIcon, installApplicationMenu } = await import('./identity.js')

beforeEach(() => {
  vi.clearAllMocks()
  isPackaged.value = false
  existsSync.mockReturnValue(true)
  createFromPath.mockReturnValue({ isEmpty: () => false })
})

describe('applyAppName', () => {
  it('sets the product name', () => {
    applyAppName()
    expect(setName).toHaveBeenCalledWith('Maximal')
  })
})

describe('installApplicationMenu', () => {
  /*
   * The template's shape is platform-dependent, so asserting one shape
   * everywhere fails wherever the suite happens not to run locally — this test
   * pinned the macOS shape and went red on the Linux CI runner, where the first
   * entry is File. Both contracts are worth stating, so each platform asserts
   * its own rather than skipping.
   */
  const onDarwin = process.platform === 'darwin' ? it : it.skip
  const offDarwin = process.platform === 'darwin' ? it.skip : it

  it('installs exactly one menu', () => {
    installApplicationMenu()
    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
  })

  onDarwin('leads with an application submenu labelled from app.name', () => {
    installApplicationMenu()

    const template = buildFromTemplate.mock.calls[0]?.[0] as Array<{ label?: string }>
    // This submenu is the whole point of installing a template: Electron's
    // default is labelled from its own binary. Reading `app.name` rather than
    // repeating the string is what keeps the two from disagreeing.
    expect(template[0]?.label).toBe('Maximal')
  })

  offDarwin('has no application submenu, so File leads', () => {
    installApplicationMenu()

    const template = buildFromTemplate.mock.calls[0]?.[0] as Array<{ label?: string }>
    expect(template[0]?.label).toBe('File')
  })
})

describe('applyDockIcon', () => {
  const onDarwin = process.platform === 'darwin' ? it : it.skip

  onDarwin('sets the icon from the rendered PNG when unpackaged', () => {
    applyDockIcon()
    expect(setIcon).toHaveBeenCalledTimes(1)
  })

  onDarwin('leaves a packaged app alone', () => {
    // The bundle's own .icns is higher resolution than the PNG, and the OS
    // already resolves it. Overriding it there would be a downgrade.
    isPackaged.value = true
    applyDockIcon()
    expect(setIcon).not.toHaveBeenCalled()
  })

  onDarwin('does not clear the icon when the file is missing', () => {
    existsSync.mockReturnValue(false)
    applyDockIcon()
    expect(setIcon).not.toHaveBeenCalled()
  })

  onDarwin('does not clear the icon when the file is not a readable image', () => {
    createFromPath.mockReturnValue({ isEmpty: () => true })
    applyDockIcon()
    expect(setIcon).not.toHaveBeenCalled()
  })
})
