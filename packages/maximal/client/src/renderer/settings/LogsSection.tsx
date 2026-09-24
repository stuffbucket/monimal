import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { LogFile } from '@stuffbucket/maximal-logging'

import {
  Button,
  CopyButton,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from './capabilities'
import { describeError } from '../shared/errors'

interface LogsSectionProps {
  capabilities: SettingsCapabilities
}

export function LogsSection({ capabilities }: LogsSectionProps): ReactElement {
  const [location, setLocation] = useState<string | null>(null)
  const [coreLocation, setCoreLocation] = useState<string | null>(null)
  const [files, setFiles] = useState<LogFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealingCore, setRevealingCore] = useState(false)

  useEffect(() => {
    let settled = false
    void Promise.all([
      capabilities.logs.location(),
      capabilities.logs.coreLocation(),
      capabilities.logs.list(),
    ]).then(
      ([path, corePath, entries]) => {
        if (!settled) {
          setLocation(path)
          setCoreLocation(corePath)
          setFiles(entries)
        }
      },
      (cause: unknown) => {
        if (!settled) setError(describeError(cause))
      },
    )
    return () => {
      settled = true
    }
  }, [capabilities])

  const revealCore = useCallback(async () => {
    setRevealingCore(true)
    setError(null)
    try {
      await capabilities.logs.revealCore()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setRevealingCore(false)
    }
  }, [capabilities])

  const reveal = useCallback(async () => {
    setRevealing(true)
    setError(null)
    try {
      await capabilities.logs.reveal()
    } catch (cause) {
      setError(describeError(cause))
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
