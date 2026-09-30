import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

import {
  Button,
  FormField,
  Note,
  SettingsActions,
  SettingsDisclosure,
  SettingsDisclosureList,
  SettingsSection,
  Switch,
  TextInput,
} from '@maximal/maximal-electron/renderer'
import type { DiscoveryRoot, ProjectCatalogSnapshot } from '@maximal/project-catalog'

import type { SettingsCapabilities } from '../capabilities'
import { describeError } from '../../shared/errors'

export const projectCatalogQueryKey = ['settings', 'projects', 'catalog'] as const

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
    <SettingsDisclosure
      title={root.path}
      description={root.enabled ? 'Project discovery enabled' : 'Project discovery paused'}
      meta={`${root.lastScanState}${root.issueCount > 0 ? ` · ${root.issueCount} issues` : ''}`}
    >
      <div className="project-root-controls">
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
        <FormField
          label="Excluded directory names"
          hint="Separate names with commas. These directories are skipped anywhere below this root."
        >
          {(field) => (
            <TextInput
              {...field}
              aria-label={`Excluded directories for ${root.path}`}
              value={exclusions}
              placeholder="node_modules, vendor, generated"
              onChange={setExclusions}
              onBlur={() => {
                const values = exclusions.split(',').map((value) => value.trim()).filter(Boolean)
                void update({ exclusions: [...new Set(values)] })
              }}
            />
          )}
        </FormField>
      </div>
      <SettingsActions>
        <Button size="sm" onClick={() =>
          void perform(() => capabilities.projects.refresh(root.id))}>
          Refresh
        </Button>
        <Button size="sm" variant="danger" onClick={() =>
          void perform(() => capabilities.projects.removeRoot(root.id))}>
          Remove
        </Button>
      </SettingsActions>
    </SettingsDisclosure>
  )
}

export function ProjectsSection({
  capabilities,
}: {
  capabilities: Pick<SettingsCapabilities, 'projects'>
}): ReactElement {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: projectCatalogQueryKey,
    queryFn: () => capabilities.projects.snapshot(),
  })
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: projectCatalogQueryKey,
      exact: true,
    }),
  })
  const mutateAsync = mutation.mutateAsync
  const resetMutation = mutation.reset

  const perform = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
    await mutateAsync(action).catch(() => undefined)
  }, [mutateAsync])

  useEffect(() => {
    const invalidate = (): void => {
      resetMutation()
      void queryClient.invalidateQueries({
        queryKey: projectCatalogQueryKey,
        exact: true,
      })
    }
    const unsubscribe = capabilities.projects.subscribe(invalidate)
    invalidate()
    return unsubscribe
  }, [capabilities, queryClient, resetMutation])

  const snapshot: ProjectCatalogSnapshot | null = query.data ?? null
  const cause = mutation.error ?? query.error
  const error = cause === null ? undefined : describeError(cause)

  return (
    <section className="settings-section">
      <SettingsSection
        title="Discovery roots"
        description="Choose where Maximal discovers projects and which folders may launch terminals."
      >
        <Note>
          Maximal scans only folders you add. New roots start untrusted. Trusting a folder permits
          opening it in a terminal; trusting subtrees extends that permission to projects below it.
        </Note>
        <SettingsActions>
          <Button size="sm" variant="primary" onClick={() =>
            void perform(() => capabilities.projects.addRoot())}>
            Add folder
          </Button>
          <Button size="sm" onClick={() =>
            void perform(() => capabilities.projects.refresh())}>
            Refresh all
          </Button>
        </SettingsActions>
        {snapshot && snapshot.roots.length > 0 ? (
          <SettingsDisclosureList>
          {snapshot?.roots.map((root) => (
            <RootSettings
              key={JSON.stringify([root.id, root.exclusions])}
              root={root}
              capabilities={capabilities}
              perform={perform}
            />
          ))}
          </SettingsDisclosureList>
        ) : null}
        {!snapshot && !error ? <Note live="polite">Loading project folders…</Note> : null}
        {snapshot && snapshot.roots.length === 0 ? (
          <Note>No project folders have been added.</Note>
        ) : null}
        {error ? <Note status="failed" live="assertive">{error}</Note> : null}
      </SettingsSection>
    </section>
  )
}
