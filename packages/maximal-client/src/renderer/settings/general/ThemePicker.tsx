import {
  type ChangeEvent,
  type ReactElement,
  type RefObject,
} from 'react'

import {
  Button,
  Note,
  Select,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  TextInput,
} from '@maximal/maximal-electron/renderer'

import {
  type AppearanceMode,
  type AppearanceThemeFile,
  type ThemeCategory,
  type ThemeableSettingsSnapshot,
} from '../../appearance'
import { ThemeBoard, ThemeCard } from './ThemeBoard'

const CATEGORY_OPTIONS: Array<{
  value: ThemeCategory | 'all'
  label: string
}> = [
  { value: 'all', label: 'All styles' },
  { value: 'expressive', label: 'Expressive' },
  { value: 'heritage-inspired', label: 'Craft & place' },
  { value: 'modern', label: 'Modern' },
  { value: 'nature', label: 'Nature' },
  { value: 'studio', label: 'Studio' },
]

const RECENT_THEME_LIMIT = 5

function ThemeStackGhosts({ count }: { count: number }): ReactElement {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="theme-stack__ghost"
          aria-hidden="true"
        >
          <span />
          <span />
        </span>
      ))}
    </>
  )
}

export function ThemeNotices({
  appearanceError,
  historyError,
  pendingTheme,
  previewing,
  theme,
  onApplyPending,
  onCancelPending,
  onKeep,
}: {
  appearanceError?: string
  historyError?: string
  pendingTheme: AppearanceThemeFile | null
  previewing: boolean
  theme: AppearanceThemeFile
  onApplyPending: () => void
  onCancelPending: () => void
  onKeep: () => void
}): ReactElement {
  return (
    <>
      {appearanceError
        ? <Note status="failed" live="assertive">{appearanceError}</Note>
        : null}
      {historyError
        ? <Note status="failed" live="assertive">{historyError}</Note>
        : null}
      {pendingTheme ? (
        <Note status="needs-approval" live="assertive">
          <span className="theme-shader-warning">
            <span>
              <strong>{pendingTheme.name}</strong> turns on the{' '}
              {pendingTheme.shader?.material} animated background shader.
              Motion respects Reduce Motion.
            </span>
            <span className="appearance-actions">
              <Button size="sm" onClick={onApplyPending}>Preview shader theme</Button>
              <Button size="sm" onClick={onCancelPending}>Cancel</Button>
            </span>
          </span>
        </Note>
      ) : null}
      {previewing ? (
        <Note live="polite">
          <span className="theme-preview-notice">
            <span>
              Previewing <strong>{theme.name}</strong>. Keep it, or restore any
              of your five most recent theme snapshots below.
            </span>
            <Button size="sm" onClick={onKeep}>Keep theme</Button>
          </span>
        </Note>
      ) : null}
    </>
  )
}

export function ThemeLibrary({
  themes,
  totalCount,
  currentId,
  busy,
  query,
  category,
  importInput,
  onQueryChange,
  onCategoryChange,
  onSelect,
  onImport,
  onExport,
}: {
  themes: AppearanceThemeFile[]
  totalCount: number
  currentId: string
  busy: boolean
  query: string
  category: ThemeCategory | 'all'
  importInput: RefObject<HTMLInputElement | null>
  onQueryChange: (query: string) => void
  onCategoryChange: (category: ThemeCategory | 'all') => void
  onSelect: (theme: AppearanceThemeFile) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onExport: () => void
}): ReactElement {
  return (
    <SettingsSection
      title="Theme library"
      description={`${String(totalCount)} legible palettes, organized for quick browsing. Search names, colors, places, or design references.`}
    >
      <div className="theme-library-toolbar">
        <Select
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={onCategoryChange}
          aria-label="Filter theme style"
          testId="theme-category"
        />
        <TextInput
          value={query}
          onChange={onQueryChange}
          aria-label="Search themes"
          placeholder="Search themes"
        />
        <div className="theme-library-toolbar__actions">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => importInput.current?.click()}
          >
            Import
          </Button>
          <Button size="sm" disabled={busy} onClick={onExport}>Export</Button>
          <input
            ref={importInput}
            className="appearance-file-input"
            type="file"
            accept=".json,.maximal-theme.json,application/json"
            onChange={onImport}
            aria-label="Import theme file"
          />
        </div>
      </div>
      <div className="theme-library-results" aria-live="polite">
        {String(themes.length)} themes
      </div>
      {query === '' && category === 'all' ? (
        <ThemeBoard
          themes={themes}
          currentId={currentId}
          busy={busy}
          onSelect={onSelect}
        />
      ) : (
        <div className="theme-grid">
          {themes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              selected={theme.id === currentId}
              disabled={busy}
              onSelect={() => onSelect(theme)}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  )
}

function historyLabel(selectedAt: string): string {
  const date = new Date(selectedAt)
  return Number.isNaN(date.getTime())
    ? 'Earlier'
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function ThemeOverview({
  theme,
  starterTheme,
  entries,
  busy,
  onThemeChange,
  onSelectStarter,
  onRestore,
}: {
  theme: AppearanceThemeFile
  starterTheme: AppearanceThemeFile
  entries: ThemeableSettingsSnapshot[]
  busy: boolean
  onThemeChange: (theme: AppearanceThemeFile) => void
  onSelectStarter: (theme: AppearanceThemeFile) => void
  onRestore: (entry: ThemeableSettingsSnapshot) => void
}): ReactElement {
  return (
    <SettingsSection
      title="Theme"
      description="Review the current palette or restore one of five complete recent snapshots, including terminal colors and shader settings."
    >
      <div className="theme-stack">
        <div className="theme-stack__current">
          <span className="theme-stack__label">Current</span>
          <ThemeCard
            theme={theme}
            selected
            disabled={busy}
            compact
            showMeta
            meta={theme.source}
            testId="current-theme-card"
          />
        </div>
        <div className="theme-stack__recent">
          <span className="theme-stack__label">Recent previews</span>
          {entries.length === 0 ? (
            <div className="theme-stack__cards">
              <ThemeCard
                theme={starterTheme}
                selected={false}
                disabled={busy}
                compact
                showMeta
                meta="Starter · Candy paint shader"
                testId="starter-theme-card"
                onSelect={() => onSelectStarter(starterTheme)}
              />
              <ThemeStackGhosts count={RECENT_THEME_LIMIT - 1} />
            </div>
          ) : (
            <div className="theme-stack__cards">
              {entries.map((entry) => {
                const shader = entry.material
                  && entry.appearance?.backgroundEffectsEnabled
                  ? ` · ${entry.material.preset} shader`
                  : ''
                return (
                  <ThemeCard
                    key={`${entry.selectedAt}-${entry.theme.id}`}
                    theme={entry.theme}
                    selected={false}
                    disabled={busy}
                    compact
                    showMeta
                    meta={`${historyLabel(entry.selectedAt)}${shader}`}
                    testId={`recent-theme-${entry.selectedAt}`}
                    onSelect={() => onRestore(entry)}
                  />
                )
              })}
              <ThemeStackGhosts
                count={Math.max(0, RECENT_THEME_LIMIT - entries.length)}
              />
            </div>
          )}
        </div>
      </div>
      <SettingsGroup>
        <SettingsItem
          title="Mode"
          divider={false}
          description="Auto follows the macOS, Windows, or Linux appearance setting."
          control={
            <Select<AppearanceMode>
              value={theme.appearance}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              disabled={busy}
              onChange={(appearance) => onThemeChange({ ...theme, appearance })}
              aria-label="Appearance mode"
              testId="appearance-mode"
            />
          }
        />
      </SettingsGroup>
    </SettingsSection>
  )
}
