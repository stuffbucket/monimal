import { useState, type ReactElement } from 'react'

import { Button, ScrollArea } from 'stuffbucket-electron/renderer'

import {
  DEFAULT_SETTINGS_SECTION_ID,
  type SettingsSectionId,
} from '../../shared/settings-sections'
import { SurfaceRail, useTabPanelId } from '../frame/AppFrame'
import { useGuardedNavigation } from '../unsaved-changes'
import type { SettingsCapabilities } from './capabilities'
import { SETTINGS_SECTION_VIEWS } from './manifest'
import { ModelProviderDisclosureState } from './ModelsSection'
import { SectionRail } from './SectionRail'

// The Settings surface. Composition only: `shared/settings-sections.ts` owns
// which sections exist, joined to their icons and panels in `./manifest`.
// Each section owns its own data lifecycle against `SettingsCapabilities`.
// The selected manifest label names the shared page rather than being repeated
// as a heading inside it. Building the capabilities
// instance via `createCoreSettingsCapabilities` is deliberately somebody
// else's decision. The window frame is too: it belongs to ../frame/AppFrame,
// and this surface reaches the parts of it that are its own through that
// module's slots.
//
// The rail and the panels are both projections of the manifest. They used to
// be two hand-written lists in this file, which could disagree and eventually
// would: a section in the rail with no panel scrolls to nothing.
//

/** A section the application menu asked to be shown. */
export interface SettingsSectionRequest {
  id: SettingsSectionId
}

interface SettingsProps {
  capabilities: SettingsCapabilities
  request?: SettingsSectionRequest | null
  onBack?: () => void
}

export function Settings({
  capabilities,
  request = null,
  onBack,
}: SettingsProps): ReactElement {
  ensureSettingsStyles()
  const panelId = useTabPanelId()
  const [current, setCurrent] = useState<SettingsSectionId>(
    request?.id ?? DEFAULT_SETTINGS_SECTION_ID,
  )
  const [seenRequest, setSeenRequest] = useState(request)
  const requestNavigation = useGuardedNavigation()

  if (request !== seenRequest) {
    setSeenRequest(request)
    if (request !== null) setCurrent(request.id)
  }

  const currentView = SETTINGS_SECTION_VIEWS.find(({ id }) => id === current)!
  const CurrentPanel = currentView.Panel

  return (
    <>
      <SurfaceRail>
        {(collapsed) => (
          <SectionRail
            sections={SETTINGS_SECTION_VIEWS}
            current={current}
            controls={panelId}
            onSelect={(next) => {
              if (next !== current) requestNavigation(() => setCurrent(next))
            }}
            collapsed={collapsed}
          />
        )}
      </SurfaceRail>

      <ScrollArea
        className="settings-page"
        surface="canvas"
        aria-label={currentView.label}
      >
        {onBack ? (
          <div className="settings-page__back">
            <Button onClick={onBack}>Back to sign in</Button>
          </div>
        ) : null}
        <ModelProviderDisclosureState>
          <CurrentPanel key={current} capabilities={capabilities} />
        </ModelProviderDisclosureState>
      </ScrollArea>
    </>
  )
}

// ---- Styles ----
//
// Injected once on import, guarded by element id so HMR reloads don't pile up
// duplicate <style> tags. What is left here is this surface's own layout — the
// page column, the rail, the section rhythm, the device-code and accounts
// blocks. The controls inside them are the package's (`Note`, `Button`,
// `CopyButton`), and they ship their own rules, so `.settings-note` and
// `.settings-button` are gone rather than renamed. No component in this
// directory declares a classname of its own, so there is still one place to
// check for drift. Values read the `--shell-*` contract with fallbacks, so a
// host that defines no theme still renders something legible.
//
// The page block is `settings-page`, not `settings`, and must stay that way.
// The package's `SettingsPage` styles `.sb-shell .settings` as a header-plus-
// scrolling-body frame, and `.sb-shell .settings__heading` as a grid wrapper
// around a title and a description — both at specificity (0,2,0) against the
// bare classes here at (0,1,0), so the package won silently. This surface is
// neither of those things: it is a padded content column with an `h1` in it.
// `settings-page` also follows the convention every other block below already
// uses, and leaves the package's namespace alone.
const SETTINGS_CSS = `
.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-5, 24px);
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: var(--shell-space-4, 16px);
  color: var(--shell-text, #f5f5f5);
  font-size: var(--shell-text-base, 0.875rem);
}

.settings-page__back {
  display: flex;
  justify-content: flex-end;
}

/* The rail. Its own rules rather than the shell's .nav class, which belongs to
   NavRail and carries a selection model this rail does not have. */
.settings-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--shell-space-2, 8px);
  min-height: 0;
  overflow-y: auto;
  font-size: var(--shell-text-base, 0.875rem);
  line-height: var(--shell-leading-base, 1.5);
}

.settings-rail__link {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  appearance: none;
  border: 0;
  border-radius: var(--shell-radius, 6px);
  min-height: 40px;
  padding: 0 var(--shell-space-2, 8px);
  color: var(--shell-text-muted, #a0a8b4);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-rail__link:hover {
  color: var(--shell-text, #f5f5f5);
  background: var(--shell-hover, rgb(255 255 255 / 0.06));
}

/* Colour and weight together, so the current section is never marked by hue
   alone. */
.settings-rail__link[aria-current='page'] {
  color: var(--shell-accent, #5198a6);
  background: var(--shell-accent-muted, rgb(81 152 166 / 0.12));
  font-weight: 500;
}

.settings-rail__link:focus-visible {
  outline: 2px solid var(--shell-focus, var(--shell-accent, #5198a6));
  outline-offset: 2px;
}


.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3, 12px);
  min-width: 0;
}

.settings-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--shell-space-2, 8px);
}

.settings-connector-form,
.settings-connector-fields,
.settings-connector-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.settings-connector-form {
  gap: var(--shell-space-5, 24px);
}

.settings-connector-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--shell-space-4, 16px);
}

.search-provider-order__fallback {
  margin-inline: calc(var(--shell-space-4, 16px) + 2px);
}

.search-behavior {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-4, 16px);
  width: min(100%, 52rem);
}

.search-behavior__domains {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--shell-space-4, 16px);
  min-width: 0;
}

.search-behavior__field {
  min-width: 0;
}

.search-behavior__help {
  width: 20px;
  height: 20px;
  padding: 0;
}

.search-behavior__switch-label {
  display: inline-flex;
  align-items: center;
  gap: var(--shell-space-1, 4px);
}

.settings-connector-field {
  align-items: flex-start;
  gap: var(--shell-space-2, 8px);
}

.settings-connector-field[data-layout='full'] {
  grid-column: 1 / -1;
}

.settings-details {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  margin: 0;
}

.settings-details__row {
  display: flex;
  align-items: baseline;
  gap: var(--shell-space-2, 8px);
}

.settings-details__row dt {
  margin: 0;
  min-width: 9em;
  font-size: var(--shell-text-sm, 0.9em);
  color: var(--shell-text-subtle, #8f97a2);
}

.settings-details__row dd {
  margin: 0;
  font-size: var(--shell-text-sm, 0.9em);
  color: var(--shell-text, #f5f5f5);
}

.settings-link-button {
  padding: 0;
  border: none;
  background: none;
  color: var(--shell-accent, #5198a6);
  font: inherit;
  font-size: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.settings-link-button:focus-visible {
  outline: 2px solid var(--shell-focus, var(--shell-accent, #5198a6));
  outline-offset: 2px;
}

.settings-device-code {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--shell-space-2, 8px);
}

.settings-device-code__code {
  margin: 0;
  padding: var(--shell-space-2, 8px) var(--shell-space-4, 16px);
  border-radius: var(--shell-radius, 6px);
  background: var(--shell-hover, rgb(255 255 255 / 0.06));
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 1.5em;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.settings-device-code__link-row {
  margin: 0;
}

.settings-device-code__actions {
  display: flex;
  gap: var(--shell-space-2, 8px);
}

.settings-accounts-list {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-accounts-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3, 12px);
  padding: var(--shell-space-2, 8px) 0;
}

.settings-accounts-list__identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-accounts-list__login {
  font-size: var(--shell-text-sm, 0.9em);
  font-weight: 600;
  color: var(--shell-text, #f5f5f5);
}

.settings-accounts-list__meta {
  font-size: var(--shell-text-sm, 0.8125rem);
  color: var(--shell-text-subtle, #8f97a2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-accounts-list__active-badge {
  flex: none;
  padding: 2px var(--shell-space-2, 8px);
  border: 1px solid var(--shell-border, #2a2a2a);
  border-radius: var(--shell-radius-small, 4px);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 500;
  color: var(--maximal-success, #22c55e);
  white-space: nowrap;
}

.settings-subsection {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  min-width: 0;
}

.settings-section__subheading {
  margin: 0;
  color: var(--shell-text, #f5f5f5);
  font-size: var(--shell-text-lg, 1.0625rem);
  font-weight: var(--shell-weight-lg, 600);
}

.settings-advanced > summary {
  width: fit-content;
  font-size: var(--shell-text-sm, 0.9em);
  font-weight: 600;
  cursor: pointer;
}

.settings-advanced > summary:focus-visible {
  outline: 2px solid var(--shell-focus, var(--shell-accent, #5198a6));
  outline-offset: 2px;
}

.settings-section__actions,
.settings-copy-value,
.settings-dialog__actions,
.settings-periods {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  flex-wrap: wrap;
}

.settings-section__actions,
.settings-periods {
  justify-content: flex-end;
}

.settings-dialog__heading {
  margin: 0;
  font-size: 1.1em;
}

.settings-dialog__actions {
  justify-content: flex-end;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3, 12px);
  padding: var(--shell-space-2, 8px) 0;
  border-bottom: 1px solid var(--shell-border, #2a2a2a);
}

.settings-list__content {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  min-width: 0;
}

.settings-list__meta,
.settings-list__detail {
  color: var(--shell-text-subtle, #8f97a2);
  font-size: var(--shell-text-sm, 0.9em);
}

.settings-list__detail,
.settings-copy-value code,
.settings-code-block code {
  overflow-wrap: anywhere;
}

.settings-code-block {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--shell-space-2, 8px);
  padding: var(--shell-space-3, 12px);
  border: 1px solid var(--shell-border, #2a2a2a);
  border-radius: var(--shell-radius, 6px);
  min-width: 0;
}

.settings-wide-content,
.settings-table-wrap {
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.settings-table-wrap:focus-visible {
  outline: 2px solid var(--shell-focus, var(--shell-accent, #5198a6));
  outline-offset: 2px;
}

.settings-model-vendor-groups,
.settings-model-vendor,
.settings-model-tables {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.settings-model-vendor-groups {
  gap: var(--shell-space-2, 8px);
}

.settings-model-vendor {
  border-bottom: 1px solid var(--shell-border, #2a2a2a);
}

.settings-model-vendor__trigger {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  width: 100%;
  min-height: 44px;
  padding: var(--shell-space-2, 8px) 0;
  border: 0;
  color: var(--shell-text, #f5f5f5);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-model-vendor__trigger:hover {
  color: var(--shell-accent, #5198a6);
}

.settings-model-vendor__trigger:focus-visible {
  outline: 2px solid var(--shell-focus, var(--shell-accent, #5198a6));
  outline-offset: 2px;
}

.settings-model-vendor__chevron {
  transition: transform 120ms ease-out;
}

.settings-model-vendor__trigger[aria-expanded='false'] .settings-model-vendor__chevron {
  transform: rotate(-90deg);
}

.settings-model-vendor__name {
  overflow: hidden;
  font-size: var(--shell-text-base, 0.875rem);
  font-weight: var(--shell-weight-lg, 600);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-model-vendor__count {
  color: var(--shell-text-muted, #8a8a8a);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .settings-model-vendor__chevron {
    transition: none;
  }
}

.settings-model-vendor .settings-table-wrap--models {
  box-sizing: border-box;
  width: calc(100% - var(--shell-space-5, 24px));
  margin-inline-start: var(--shell-space-5, 24px);
  padding-inline-start: var(--shell-space-3, 12px);
  border-inline-start: 1px solid var(--shell-border, #2a2a2a);
}

.settings-local-model__row {
  align-items: flex-start;
  flex-wrap: wrap;
}

.settings-local-model__content {
  flex: 1 1 20rem;
}

.settings-local-model__actions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
}

.settings-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--shell-space-2, 8px);
  margin: 0;
}

.settings-metrics > div {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
}

.settings-metrics dt,
.settings-metrics dd {
  margin: 0;
}

.settings-metrics dt {
  color: var(--shell-text-subtle, #8f97a2);
  font-size: var(--shell-text-sm, 0.9em);
}

.settings-metrics dd {
  font-size: 1.15em;
  font-weight: 600;
}

.settings-table {
  width: 100%;
  min-width: 440px;
  border-collapse: collapse;
  font-size: var(--shell-text-base, 0.875rem);
  text-align: left;
}

.settings-table--models {
  min-width: 560px;
  table-layout: fixed;
}

.settings-table__type-column {
  width: 56px;
}

.settings-table__token-column {
  width: 112px;
}

.settings-table__capability-column {
  width: 152px;
}

.settings-table caption {
  padding: var(--shell-space-2, 8px) 0;
  font-size: var(--shell-text-base, 0.875rem);
  font-weight: var(--shell-weight-lg, 600);
  text-align: left;
}

.settings-table th,
.settings-table td {
  padding: var(--shell-space-2, 8px);
  border-bottom: 1px solid var(--shell-border, #2a2a2a);
  vertical-align: top;
}

.settings-table thead th {
  color: var(--shell-text-muted, #8a8a8a);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: var(--shell-weight-lg, 600);
  white-space: nowrap;
}

.settings-table tbody th {
  font-weight: var(--shell-weight-md, 500);
}

.settings-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.settings-table__capabilities {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
}

.settings-table__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--shell-text-muted, #8a8a8a);
}

.settings-table__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--shell-text-muted, #8a8a8a);
}

.settings-table__model-name,
.settings-table--models code {
  display: block;
}

.settings-table--models code {
  margin-top: var(--shell-space-1, 4px);
  color: var(--shell-text-muted, #8a8a8a);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 400;
}

.settings-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`

const SETTINGS_STYLE_ID = 'settings-styles'

function ensureSettingsStyles(): void {
  if (!document.getElementById(SETTINGS_STYLE_ID)) {
    const style = document.createElement('style')
    style.id = SETTINGS_STYLE_ID
    style.textContent = SETTINGS_CSS
    document.head.appendChild(style)
  }
}
