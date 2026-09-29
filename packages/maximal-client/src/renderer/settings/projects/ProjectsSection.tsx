import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import {
  Button,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
  TextInput,
} from '@maximal/maximal-electron/renderer'
import type { DiscoveryRoot, ProjectCatalogSnapshot } from '@maximal/project-catalog'

import type { SettingsCapabilities } from '../capabilities'
import { describeError } from '../../shared/errors'

function RootSettings({
  root,
  capabilities,
  perform,
}: {
  root: DiscoveryRoot
  capabilities: Pick<SettingsCapabilities, 'projects'>
  perform: (action: () => Promise<unknown>) => Promise<void>
}): ReactElement {
  const [exclusions, setExclusions] = useState(root.exclusions.join(', '))

  const update = (change: Parameters<typeof capabilities.projects.updateRoot>[1]) =>
    perform(() => capabilities.projects.updateRoot(root.id, change))

  return (
    <SettingsItem
      title={root.path}
      description={`Scan: ${root.lastScanState}${root.issueCount > 0 ? ` · ${root.issueCount} issues` : ''}`}
      actions={
        <>
          <Button size="sm" onClick={() =>
            void perform(() => capabilities.projects.refresh(root.id))}>
            Refresh
          </Button>
          <Button size="sm" variant="danger" onClick={() =>
            void perform(() => capabilities.projects.removeRoot(root.id))}>
            Remove
          </Button>
        </>
      }
    >
      <div className="project-root-settings">
        <Switch
          label={`Discover projects under ${root.path}`}
          displayLabel="Discover subtrees"
          checked={root.enabled}
          onChange={(enabled) => void update({ enabled })}
        />
        <Switch
          label={`Trust ${root.path}`}
          displayLabel="Trust this folder"
          checked={root.trusted}
          onChange={(trusted) => void update({ trusted })}
        />
        <Switch
          label={`Trust projects below ${root.path}`}
          displayLabel="Trust subtrees"
          checked={root.trustSubtrees}
          disabled={!root.trusted}
          onChange={(trustSubtrees) => void update({ trustSubtrees })}
        />
        <label className="project-root-settings__field">
          <span>Excluded directory names</span>
          <TextInput
            aria-label={`Excluded directories for ${root.path}`}
            value={exclusions}
            placeholder="node_modules, vendor, generated"
            onChange={setExclusions}
            onBlur={() => {
              const values = exclusions.split(',').map((value) => value.trim()).filter(Boolean)
              void update({ exclusions: [...new Set(values)] })
            }}
          />
        </label>
      </div>
    </SettingsItem>
  )
}

export function ProjectsSection({
  capabilities,
}: {
  capabilities: Pick<SettingsCapabilities, 'projects'>
}): ReactElement {
  const [snapshot, setSnapshot] = useState<ProjectCatalogSnapshot | null>(null)
  const [error, setError] = useState<string>()
  const latestSnapshot = useRef<Promise<ProjectCatalogSnapshot> | undefined>(undefined)
  const load = useCallback(async () => {
    const request = capabilities.projects.snapshot()
    latestSnapshot.current = request
    try {
      const value = await request
      if (latestSnapshot.current !== request) return
      setSnapshot(value)
      setError(undefined)
    } catch (cause) {
      if (latestSnapshot.current === request) setError(describeError(cause))
    }
  }, [capabilities])

  const perform = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      await load()
    } catch (cause) {
      setError(describeError(cause))
    }
  }, [load])

  useEffect(() => {
    // The host snapshot is awaited before load can update state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const unsubscribe = capabilities.projects.subscribe(() => void load())
    return () => {
      latestSnapshot.current = undefined
      unsubscribe()
    }
  }, [capabilities, load])

  return (
    <section className="settings-section">
      <SettingsSection
        title="Discovery and trust"
        description="Choose where Maximal discovers projects and which folders may launch terminals."
      >
        <SettingsGroup dividers={false}>
          <SettingsItem
            title="Discovery roots"
            description="Maximal scans only folders you add. New roots start untrusted."
            actions={
              <>
                <Button size="sm" variant="primary" onClick={() =>
                  void perform(() => capabilities.projects.addRoot())}>
                  Add folder
                </Button>
                <Button size="sm" onClick={() =>
                  void perform(() => capabilities.projects.refresh())}>
                  Refresh all
                </Button>
              </>
            }
          >
            <Note>
              Trusting a folder permits opening it in a terminal. “Trust subtrees” extends that
              permission to discovered projects below the selected folder.
            </Note>
          </SettingsItem>
          {snapshot?.roots.map((root) => (
            <RootSettings
              key={JSON.stringify([root.id, root.exclusions])}
              root={root}
              capabilities={capabilities}
              perform={perform}
            />
          ))}
          {!snapshot && !error ? <Note>Loading project folders…</Note> : null}
          {snapshot && snapshot.roots.length === 0 ? (
            <Note>No project folders have been added.</Note>
          ) : null}
        </SettingsGroup>
        {error ? <Note status="failed" live="assertive">{error}</Note> : null}
      </SettingsSection>
    </section>
  )
}
