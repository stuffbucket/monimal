import {
  Collapsible,
  Combobox,
  Dialog,
} from '@maximal/maximal-design-system/components'
import {
  CommandIcon,
  SearchIcon,
} from '@maximal/maximal-design-system/icons'
import type {
  TerminalDiscovery,
  TerminalLaunchRequest,
  TerminalLaunchResult,
  TerminalProfileSummary,
  TerminalTargetSummary,
} from '@maximal/maximal-terminal'
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

import './TerminalLauncher.css'

export interface TerminalLauncherProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profiles: () => Promise<TerminalProfileSummary[]>
  discover: () => Promise<TerminalDiscovery>
  launch: (request: TerminalLaunchRequest) => Promise<TerminalLaunchResult>
  onLaunched: (result: TerminalLaunchResult) => void
  recentProfileIds?: readonly string[]
  renderProfileIcon?: (profile: TerminalProfileSummary) => ReactNode
}

interface TerminalChoice {
  profile: TerminalProfileSummary
  target?: TerminalTargetSummary
}

const TARGETLESS_PROFILE_KINDS = new Set<TerminalProfileSummary['kind']>([
  'command',
  'local',
  'tmux-control',
])

function choiceId({ profile, target }: TerminalChoice): string {
  return `${profile.id}\u0000${target?.id ?? ''}`
}

function matchesQuery(choice: TerminalChoice, query: string): boolean {
  return choice.profile.label.toLocaleLowerCase().includes(query)
    || choice.profile.description?.toLocaleLowerCase().includes(query) === true
    || choice.target?.label.toLocaleLowerCase().includes(query) === true
}

function availableChoices(
  profiles: readonly TerminalProfileSummary[],
  targets: readonly TerminalTargetSummary[],
): TerminalChoice[] {
  const discovered = profiles.flatMap<TerminalChoice>((profile) => {
    if (TARGETLESS_PROFILE_KINDS.has(profile.kind)) return [{ profile }]
    return targets
      .filter((target) => target.profileId === profile.id && target.state === 'available')
      .map((target) => ({ profile, target }))
  })
  const persistentDestinations = new Set(discovered
    .filter(({ profile, target }) =>
      (profile.kind === 'tmux' || profile.kind === 'ssh-tmux')
      && target?.purpose === 'new')
    .map(({ profile, target }) =>
      `${profile.kind === 'tmux' ? 'local' : 'remote'}\u0000${target?.label ?? profile.label}`))

  return discovered.filter(({ profile, target }) => {
    const destination = profile.kind === 'local'
      ? `local\u0000${profile.label}`
      : profile.kind === 'ssh' && target
        ? `remote\u0000${target.label}`
        : undefined
    return destination === undefined || !persistentDestinations.has(destination)
  })
}

function unavailableProfiles(
  profiles: readonly TerminalProfileSummary[],
  targets: readonly TerminalTargetSummary[],
  choices: readonly TerminalChoice[],
  query: string,
): Array<{ profile: TerminalProfileSummary; reason: string }> {
  return profiles.flatMap((profile) => {
    if (profile.kind === 'local' || profile.kind === 'tmux-control') return []
    if (profile.kind === 'tmux' && profiles.some((candidate) => candidate.kind === 'local')) {
      return []
    }
    if (
      profile.kind === 'ssh-tmux'
      && choices.some(({ profile: candidate }) => candidate.kind === 'ssh')
    ) {
      return []
    }
    if (targets.some((target) =>
      target.profileId === profile.id && target.state === 'available')) {
      return []
    }
    if (!profile.label.toLocaleLowerCase().includes(query)) return []
    const status = targets.find((target) => target.profileId === profile.id)
    return [{
      profile,
      reason: status?.state === 'timed-out' ? 'Timed out' : 'No running targets',
    }]
  })
}

interface UnavailableProfileListProps {
  entries: ReadonlyArray<{ profile: TerminalProfileSummary; reason: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
}

function UnavailableProfileList({
  entries,
  open,
  onOpenChange,
}: UnavailableProfileListProps): ReactElement | null {
  if (entries.length === 0) return null
  return (
    <Collapsible
      onOpenChange={onOpenChange}
      open={open}
      title={`${entries.length} unavailable ${
        entries.length === 1 ? 'profile' : 'profiles'
      }`}
    >
      <ul className="terminal-launcher__unavailable">
        {entries.map(({ profile, reason }) => (
          <li key={profile.id}>
            <span>{profile.label}</span>
            <span className="terminal-launcher__secondary">{reason}</span>
          </li>
        ))}
      </ul>
    </Collapsible>
  )
}

function useTerminalSources(
  profiles: TerminalLauncherProps['profiles'],
  discover: TerminalLauncherProps['discover'],
) {
  const [items, setItems] = useState<TerminalProfileSummary[]>([])
  const [targets, setTargets] = useState<TerminalTargetSummary[]>([])
  const [profileError, setProfileError] = useState<string>()
  const [discoveryError, setDiscoveryError] = useState<string>()
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [discovering, setDiscovering] = useState(true)

  useEffect(() => {
    let current = true
    void profiles()
      .then((nextProfiles) => {
        if (current) setItems(nextProfiles)
      })
      .catch(() => {
        if (current) setProfileError('Terminal profiles are unavailable.')
      })
      .finally(() => {
        if (current) setLoadingProfiles(false)
      })
    void discover()
      .then((result) => {
        if (current) setTargets(result.targets)
      })
      .catch(() => {
        if (current) {
          setDiscoveryError('Remote and runtime targets could not be discovered.')
        }
      })
      .finally(() => {
        if (current) setDiscovering(false)
      })
    return () => {
      current = false
    }
  }, [discover, profiles])

  return {
    discovering,
    discoveryError,
    items,
    loadingProfiles,
    profileError,
    setProfileError,
    targets,
  }
}

type TerminalLauncherContentProps = Omit<TerminalLauncherProps, 'open'>

function TerminalLauncherContent({
  onOpenChange,
  profiles,
  discover,
  launch,
  onLaunched,
  recentProfileIds = [],
  renderProfileIcon,
}: TerminalLauncherContentProps): ReactElement {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string>()
  const [unavailableOpen, setUnavailableOpen] = useState(false)
  const {
    discovering,
    discoveryError,
    items,
    loadingProfiles,
    profileError,
    setProfileError,
    targets,
  } = useTerminalSources(profiles, discover)

  const normalizedQuery = query.toLocaleLowerCase()
  const choices = availableChoices(items, targets)
  const filteredChoices = choices.filter((choice) => matchesQuery(choice, normalizedQuery))
  const unavailable = unavailableProfiles(items, targets, choices, normalizedQuery)
  const running = choices.filter(({ target }) => target?.purpose === 'running')
  const launchable = choices.filter(({ target }) => target?.purpose !== 'running')
  const recent = launchable.filter(({ profile }) => recentProfileIds.includes(profile.id))
  const available = launchable.filter(({ profile }) => !recentProfileIds.includes(profile.id))
  const groups = [
    { label: 'Running', entries: running },
    { label: 'Recent', entries: recent },
    { label: 'Available', entries: available },
  ].filter((group) => group.entries.length > 0)
  const choicesById = new Map(choices.map((choice) => [choiceId(choice), choice]))
  const comboboxGroups = groups.map((group) => ({
    label: group.label,
    options: group.entries.map((choice) => ({
      value: choiceId(choice),
      label: choice.target?.label ?? choice.profile.label,
      textValue: choice.target?.label ?? choice.profile.label,
      description: choice.target?.purpose === 'running'
        ? undefined
        : choice.profile.description,
      metadata: pending === choiceId(choice)
        ? 'Starting...'
        : choice.target && choice.target.label !== choice.profile.label
          ? choice.profile.label
          : undefined,
      icon: renderProfileIcon?.(choice.profile) ?? <CommandIcon />,
      keywords: [
        choice.profile.label,
        choice.profile.description,
        choice.target?.label,
      ].filter((keyword): keyword is string => keyword !== undefined),
    })),
  }))

  const choose = async (choice: TerminalChoice): Promise<void> => {
    if (pending !== undefined) return
    const id = choiceId(choice)
    setPending(id)
    setProfileError(undefined)
    try {
      const result = await launch({
        profileId: choice.profile.id,
        targetId: choice.target?.id,
        cols: 80,
        rows: 24,
      })
      onLaunched(result)
      onOpenChange(false)
    } catch {
      setProfileError('Terminal could not be started.')
    } finally {
      setPending(undefined)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (filteredChoices.length === 1) void choose(filteredChoices[0])
  }

  return (
    <>
      <form onSubmit={submit}>
        <Combobox
          disabled={pending !== undefined}
          emptyMessage={
            !profileError && items.length === 0
              ? 'No terminal profiles are available.'
              : 'No matching terminals.'
          }
          error={profileError ?? discoveryError}
          groups={comboboxGroups}
          inline
          inputValue={query}
          label="Search terminal profiles"
          leading={<SearchIcon />}
          loading={loadingProfiles || discovering}
          loadingMessage={
            loadingProfiles
              ? 'Loading terminal profiles...'
              : 'Checking running terminals, SSH, containers, and virtual machines...'
          }
          onInputValueChange={(value, eventDetails) => {
            if (eventDetails.isItemPress) return
            setQuery(value)
            if (value.length > 0) setUnavailableOpen(true)
          }}
          onValueChange={(id) => {
            const choice = id === null ? undefined : choicesById.get(id)
            if (choice) void choose(choice)
          }}
          placeholder="Search terminals"
          showLabel={false}
          value={null}
        />
      </form>
      {!discovering ? (
        <UnavailableProfileList
          entries={unavailable}
          onOpenChange={setUnavailableOpen}
          open={unavailableOpen}
        />
      ) : null}
    </>
  )
}

export function TerminalLauncher({
  open,
  onOpenChange,
  ...props
}: TerminalLauncherProps): ReactElement {
  return (
    <Dialog
      className="terminal-launcher"
      description="Start a terminal here or connect to another environment."
      onOpenChange={onOpenChange}
      open={open}
      popupProps={{ 'data-testid': 'terminal-launcher' }}
      title="Open terminal"
    >
      {open ? (
        <TerminalLauncherContent
          {...props}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  )
}
