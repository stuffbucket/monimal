import { UI_MODES, type UiMode, type UiModeState } from '@maximal/maximal-client/shared/host'

import { readUserPreferences, updateUserPreferences } from './preferences/user-preferences.js'

export const UI_MODE_SWITCH = 'ui'
export const UI_MODE_ENV = 'MAXIMAL_UI'
const UI_MODE_PREFERENCE = 'uiMode'

const RENDERER_ENTRIES = {
  legacy: 'index.html',
  'design-system': 'design-system.html',
  spike: 'spike.html',
} as const satisfies Record<UiMode, string>

export type RendererEntry = (typeof RENDERER_ENTRIES)[UiMode]
export const RENDERER_ENTRY_FILES: readonly RendererEntry[] = Object.values(RENDERER_ENTRIES)

export function parseUiMode(value: unknown): UiMode | undefined {
  return UI_MODES.find((mode) => mode === value)
}

export function rendererEntry(mode: UiMode): RendererEntry {
  return RENDERER_ENTRIES[mode]
}

export interface UiModeSources {
  /** The `--ui` command-line switch value, if present. */
  switchValue?: string
  env?: string
  preference?: unknown
  isPackaged: boolean
}

/** Precedence: command line, environment, saved preference, build default. */
export function resolveUiMode({ switchValue, env, preference, isPackaged }: UiModeSources): UiMode {
  return parseUiMode(switchValue)
    ?? parseUiMode(env)
    ?? parseUiMode(preference)
    ?? (isPackaged ? 'legacy' : 'design-system')
}

export class UiModeController {
  #mode: UiMode
  readonly #switchable: boolean

  constructor(mode: UiMode, switchable: boolean) {
    this.#mode = mode
    this.#switchable = switchable
  }

  static async load(sources: Omit<UiModeSources, 'preference'>): Promise<UiModeController> {
    const preferences = await readUserPreferences()
    return new UiModeController(
      resolveUiMode({ ...sources, preference: preferences[UI_MODE_PREFERENCE] }),
      !sources.isPackaged,
    )
  }

  get mode(): UiMode {
    return this.#mode
  }

  state(): UiModeState {
    return { mode: this.#mode, switchable: this.#switchable }
  }

  /** Session state changes first so a reload follows it even over a launch override. */
  async set(value: unknown): Promise<UiMode> {
    const mode = parseUiMode(value)
    if (mode === undefined) throw new TypeError(`Unknown UI mode: ${String(value)}`)
    if (!this.#switchable) throw new Error('The UI mode is not switchable in this build')
    this.#mode = mode
    await updateUserPreferences({ [UI_MODE_PREFERENCE]: mode })
    return mode
  }
}
