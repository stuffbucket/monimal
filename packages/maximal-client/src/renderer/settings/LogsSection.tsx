import { useQuery } from '@tanstack/react-query'
import { useCallback, useState, type ReactElement } from 'react'
import type { LogFile } from '@maximal/maximal-logging'

import {
  Button,
  CopyButton,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from '@maximal/maximal-electron/renderer'

import type { SettingsCapabilities } from './capabilities'
import { describeError } from '../shared/errors'

interface LogsSectionProps {
  capabilities: SettingsCapabilities
}

export function LogsSection({ capabilities }: LogsSectionProps): ReactElement {
  const query = useQuery({
    queryKey: ['settings', 'logs'],
    queryFn: async () => {
      const [location, coreLocation, files] = await Promise.all([
        capabilities.logs.location(),
        capabilities.logs.coreLocation(),
        capabilities.logs.list(),
      ])
      return { location, coreLocation, files }
    },
  })
  const location = query.data?.location ?? null
  const coreLocation = query.data?.coreLocation ?? null
  const files: LogFile[] | null = query.data?.files ?? null
  const queryError = query.error === null ? null : describeError(query.error)
  const [actionError, setActionError] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealingCore, setRevealingCore] = useState(false)
  const error = actionError ?? queryError

  const revealCore = useCallback(async () => {
    setRevealingCore(true)
    setActionError(null)
    try {
      await capabilities.logs.revealCore()
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setRevealingCore(false)
    }
  }, [capabilities])

  const reveal = useCallback(async () => {
    setRevealing(true)
    setActionError(null)
    try {
      await capabilities.logs.reveal()
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setRevealing(false)
    }
  }, [capabilities])

  return (
    <section className="settings-section">
      <SettingsSection
        title="Log files"
        description="Inspect persistent desktop lifecycle logs and locate core logs."
      >
        <SettingsGroup>
          <SettingsItem
            title="Desktop log folder"
            description={location ?? (error ? 'Log location unavailable' : 'Loading log location…')}
            actions={
              location ? (
                <>
                  <CopyButton text={location} about="the log folder path" />
                  <Button size="sm" onClick={() => void reveal()} disabled={revealing}>
                    {revealing ? 'Opening…' : 'Reveal desktop logs'}
                  </Button>
                </>
              ) : undefined
            }
          >
            {files !== null ? (
              <p>{files.length === 0
                ? 'No desktop logs have been written yet.'
                : `Desktop logs: ${files.map((file) => file.name).join(', ')}`}</p>
            ) : null}
            {error ? (
              <Note status="failed" live="assertive">
                {error}
              </Note>
            ) : null}
          </SettingsItem>
          {coreLocation ? (
            <SettingsItem
              title="Core log folder"
              description={coreLocation}
              actions={
                <>
                  <CopyButton text={coreLocation} about="the core log folder path" />
                  <Button size="sm" onClick={() => void revealCore()} disabled={revealingCore}>
                    {revealingCore ? 'Opening…' : 'Reveal core logs'}
                  </Button>
                </>
              }
            />
          ) : null}
        </SettingsGroup>
      </SettingsSection>
    </section>
  )
}
