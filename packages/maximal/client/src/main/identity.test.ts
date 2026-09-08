import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SETTINGS_SECTIONS } from '../shared/settings-sections.js'

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

/*
 * The Settings menus.
 *
 * Read out of the built template rather than off a rendered menu: `Menu` is a
 * native object, and the template is the whole of what this module decides.
 *
 * The two entry points sit in different places per platform — the application
 * submenu on macOS, the Settings menu elsewhere — so the helpers below find
 * them by what identifies them (the accelerator, and membership of the section
 * list) rather than by an index that only holds on one platform.
 */
interface TemplateItem {
  label?: string
  type?: string
  accelerator?: string
  enabled?: boolean
  click?: () => void
  submenu?: TemplateItem[]
}

function template(): TemplateItem[] {
  return buildFromTemplate.mock.calls[0]?.[0] as TemplateItem[]
}

function settingsMenu(): TemplateItem[] {
  return template().find((item) => item.label === 'Settings')?.submenu ?? []
}

/** The `Settings…` item, wherever this platform puts it. */
function openItem(): TemplateItem | undefined {
  const appSubmenu = template()[0]?.submenu ?? []
  return [...appSubmenu, ...settingsMenu()].find(
    (item) => item.accelerator === 'CmdOrCtrl+,',
  )
}

const sectionLabels = SETTINGS_SECTIONS.map(({ label }) => label)

function sectionItems(): TemplateItem[] {
  return settingsMenu().find((item) => item.label === 'Open Section')?.submenu ?? []
}

describe('installApplicationMenu, Settings', () => {
  it('offers Settings on the platform accelerator', () => {
    installApplicationMenu({ onOpenSettings: vi.fn() })

    expect(openItem()?.label).toBe('Settings…')
  })

  it('asks for the surface itself, with no section singled out', () => {
    const onOpenSettings = vi.fn()
    installApplicationMenu({ onOpenSettings })

    openItem()?.click?.()

    expect(onOpenSettings).toHaveBeenCalledWith(null)
  })

  it('lists every section in one Open Section flyout, in manifest order', () => {
    // The regression this catches is a menu naming a section the surface does
    // not render: the item would scroll to nothing.
    installApplicationMenu({ onOpenSettings: vi.fn() })

    expect(settingsMenu().filter((item) => item.label === 'Open Section')).toHaveLength(1)
    expect(sectionItems().map((item) => item.label)).toEqual(sectionLabels)
  })

  it('asks for the section its item names', () => {
    const onOpenSettings = vi.fn()
    installApplicationMenu({ onOpenSettings })

    for (const item of sectionItems()) item.click?.()

    expect(onOpenSettings.mock.calls.flat()).toEqual(
      SETTINGS_SECTIONS.map(({ id }) => id),
    )
  })

  it('disables both entry points when nothing is listening', () => {
    // A menu item that reliably does nothing is worse than a visibly
    // unavailable one, and `installApplicationMenu()` is called with no
    // callbacks before a window exists.
    installApplicationMenu()

    expect(openItem()?.enabled).toBe(false)
    expect(sectionItems().every((item) => item.enabled === false)).toBe(true)
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
