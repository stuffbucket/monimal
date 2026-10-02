import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react'

import {
  parseAppearanceTheme,
  readAppearance,
  serializeAppearance,
  type AppearanceThemeFile,
  type ThemeCategory,
  type ThemeableSettingsSnapshot,
} from '../../appearance'
import {
  previewTheme,
  restoreTheme,
} from '../../theme-application'
import {
  pushThemeHistory,
  readThemeHistory,
} from '../../theme-history'
import {
  BUILT_IN_THEMES,
  builtInTheme,
} from '../../themes/catalog'
import type { SettingsCapabilities } from '../capabilities'
import {
  ThemeLibrary,
  ThemeNotices,
  ThemeOverview,
} from './ThemePicker'

function requiredBuiltInTheme(id: string): AppearanceThemeFile {
  const theme = builtInTheme(id)
  if (theme === undefined) {
    throw new Error(`The built-in ${id} theme is required.`)
  }
  return theme
}

const MAXIMIZED_THEME = requiredBuiltInTheme('maximized')

function filterThemes(
  query: string,
  category: ThemeCategory | 'all',
): AppearanceThemeFile[] {
  const needle = query.trim().toLocaleLowerCase()
  return BUILT_IN_THEMES.filter((theme) => {
    if (category !== 'all' && theme.category !== category) return false
    if (needle === '') return true
    return [
      theme.name,
      theme.description,
      theme.source,
      theme.category,
      ...theme.tags,
    ].some((value) => value.toLocaleLowerCase().includes(needle))
  })
}

function downloadTheme(theme: AppearanceThemeFile): void {
  const url = URL.createObjectURL(
    new Blob([serializeAppearance(theme)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${
    theme.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') || 'theme'
  }.maximal-theme.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AppearanceSection({
  capabilities,
}: {
  capabilities: SettingsCapabilities
}): ReactElement {
  const [appearance, setAppearance] = useState(readAppearance)
  const [history, setHistory] = useState(readThemeHistory)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ThemeCategory | 'all'>('all')
  const [pendingTheme, setPendingTheme] = useState<AppearanceThemeFile | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const theme = appearance.theme
  const filteredThemes = useMemo(
    () => filterThemes(query, category),
    [category, query],
  )

  const applyTheme = async (next: AppearanceThemeFile): Promise<void> => {
    setBusy(true)
    setPendingTheme(null)
    try {
      const previous = await previewTheme(capabilities, theme, next)
      setAppearance({ theme: next })
      setHistory(pushThemeHistory(previous))
      setPreviewing(true)
    } catch (error) {
      setAppearance({
        theme,
        error: error instanceof Error
          ? error.message
          : 'The theme could not be previewed.',
      })
    } finally {
      setBusy(false)
    }
  }

  const requestTheme = (next: AppearanceThemeFile): void => {
    if (next.shader !== undefined) {
      setPendingTheme(next)
    } else {
      void applyTheme(next)
    }
  }

  const restoreSnapshot = async (
    snapshot: ThemeableSettingsSnapshot,
  ): Promise<void> => {
    setBusy(true)
    setPendingTheme(null)
    try {
      const current = await restoreTheme(capabilities, theme, snapshot)
      setAppearance({ theme: snapshot.theme })
      setHistory(pushThemeHistory(current))
      setPreviewing(true)
    } catch (error) {
      setAppearance({
        theme,
        error: error instanceof Error
          ? error.message
          : 'The earlier theme could not be restored.',
      })
    } finally {
      setBusy(false)
    }
  }

  const importTheme = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    try {
      requestTheme(parseAppearanceTheme(await file.text()))
    } catch (error) {
      setAppearance({
        theme,
        error: error instanceof Error ? error.message : 'The theme could not be imported.',
      })
    }
  }

  return (
    <>
      <ThemeNotices
        appearanceError={appearance.error}
        historyError={history.error}
        pendingTheme={pendingTheme}
        previewing={previewing}
        theme={theme}
        onApplyPending={() => {
          if (pendingTheme !== null) void applyTheme(pendingTheme)
        }}
        onCancelPending={() => setPendingTheme(null)}
        onKeep={() => setPreviewing(false)}
      />
      <ThemeOverview
        theme={theme}
        starterTheme={MAXIMIZED_THEME}
        entries={history.entries}
        busy={busy}
        onThemeChange={(next) => void applyTheme(next)}
        onSelectStarter={requestTheme}
        onRestore={(entry) => void restoreSnapshot(entry)}
      />
      <ThemeLibrary
        themes={filteredThemes}
        totalCount={BUILT_IN_THEMES.length}
        currentId={theme.id}
        busy={busy}
        query={query}
        category={category}
        importInput={importInput}
        onQueryChange={setQuery}
        onCategoryChange={setCategory}
        onSelect={requestTheme}
        onImport={(event) => void importTheme(event)}
        onExport={() => downloadTheme(theme)}
      />
    </>
  )
}
