import { Search, SquareTerminal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Dialog, TextInput } from './controls/index.js';
import { useComponentStyles } from '../lib/component-styles.js';

const TERMINAL_LAUNCHER_STYLES = `
.sb-shell {
  --shell-terminal-launcher-width: min(440px, 90vw);
  --shell-terminal-launcher-max-height: calc(100vh - 32px);
}

.sb-shell .terminal-launcher {
  width: var(--shell-terminal-launcher-width);
  max-height: var(--shell-terminal-launcher-max-height);
  overflow-y: auto;
}

.sb-shell .terminal-launcher__search {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

.sb-shell .terminal-launcher__group {
  display: grid;
  gap: var(--shell-space-2);
}

.sb-shell .terminal-launcher__group h3 {
  margin: 0;
  font-size: var(--shell-text-sm);
}

.sb-shell .terminal-launcher__choice {
  justify-content: flex-start;
  gap: var(--shell-space-2);
}

.sb-shell .terminal-launcher__kind,
.sb-shell .terminal-launcher__pending {
  margin-left: auto;
  color: var(--shell-text-muted);
  font-size: var(--shell-text-xs);
}

.sb-shell .terminal-launcher__unavailable {
  padding-top: var(--shell-space-2);
  color: var(--shell-text-muted);
  border-top: 1px solid var(--shell-border);
}

.sb-shell .terminal-launcher__unavailable summary {
  cursor: pointer;
  font-size: var(--shell-text-sm);
}

.sb-shell .terminal-launcher__unavailable ul {
  display: grid;
  gap: var(--shell-space-1);
  margin: var(--shell-space-2) 0 0;
  padding: 0;
  list-style: none;
}

.sb-shell .terminal-launcher__unavailable li {
  display: flex;
  justify-content: space-between;
  gap: var(--shell-space-3);
  font-size: var(--shell-text-xs);
}
`;

/** A renderer-visible terminal profile, with no executable configuration. */
export interface TerminalProfileSummary {
  id: string;
  label: string;
  kind: 'local' | 'tmux-control' | 'docker' | 'podman' | 'lima' | 'multipass' | 'kubernetes' | 'wsl' | 'vagrant' | 'ssh' | 'tmux' | 'ssh-tmux';
}

export interface TerminalTargetSummary {
  id: string;
  profileId: string;
  label: string;
  state: 'available' | 'unavailable' | 'timed-out';
  purpose?: 'destination' | 'new' | 'running';
}

export interface TerminalDiscovery {
  generation: number;
  targets: TerminalTargetSummary[];
}

export interface TerminalLaunchRequest {
  profileId: string;
  targetId?: string;
  cols: number;
  rows: number;
}

export interface TerminalLaunchResult {
  sessionId: string;
  label: string;
  canRunInBackground: boolean;
}

export interface TerminalLauncherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: () => Promise<TerminalProfileSummary[]>;
  discover: () => Promise<TerminalDiscovery>;
  launch: (request: TerminalLaunchRequest) => Promise<TerminalLaunchResult>;
  onLaunched: (result: TerminalLaunchResult) => void;
  recentProfileIds?: string[];
}

interface TerminalChoice {
  profile: TerminalProfileSummary;
  target?: TerminalTargetSummary;
}

/** A host-neutral terminal launcher. The application supplies every operation. */
export function TerminalLauncher({
  open,
  onOpenChange,
  profiles,
  discover,
  launch,
  onLaunched,
  recentProfileIds = [],
}: TerminalLauncherProps) {
  useComponentStyles('terminal-launcher', TERMINAL_LAUNCHER_STYLES);
  const [items, setItems] = useState<TerminalProfileSummary[]>([]);
  const [targets, setTargets] = useState<TerminalTargetSummary[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [discoveryError, setDiscoveryError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setError(undefined);
    setDiscoveryError(undefined);
    setQuery('');
    setItems([]);
    setTargets([]);
    setLoadingProfiles(true);
    setDiscovering(true);
    void profiles()
      .then((nextProfiles) => {
        if (current) setItems(nextProfiles);
      })
      .catch(() => {
        if (current) setError('Terminal profiles are unavailable.');
      })
      .finally(() => {
        if (current) setLoadingProfiles(false);
      });
    void discover()
      .then((result) => {
        if (current) setTargets(result.targets);
      })
      .catch(() => {
        if (current) setDiscoveryError('Remote and runtime targets could not be discovered.');
      })
      .finally(() => {
        if (current) setDiscovering(false);
      });
    return () => {
      current = false;
    };
  }, [discover, open, profiles]);

  const normalizedQuery = query.toLocaleLowerCase();
  const discoveredChoices = items.flatMap<TerminalChoice>((profile) => {
    const targetless = profile.kind === 'local' || profile.kind === 'tmux-control';
    if (targetless) return [{ profile, target: undefined }];
    return targets
      .filter((target) => target.profileId === profile.id && target.state === 'available')
      .map((target) => ({ profile, target }));
  });
  const persistentDestinations = new Set(discoveredChoices
    .filter(({ profile, target }) =>
      (profile.kind === 'tmux' || profile.kind === 'ssh-tmux') && target?.purpose === 'new')
    .map(({ profile, target }) =>
      `${profile.kind === 'tmux' ? 'local' : 'remote'}\u0000${target?.label ?? profile.label}`));
  const choices = discoveredChoices.filter(({ profile, target }) => {
    const destination = profile.kind === 'local'
      ? `local\u0000${profile.label}`
      : profile.kind === 'ssh' && target
        ? `remote\u0000${target.label}`
        : undefined;
    return destination === undefined || !persistentDestinations.has(destination);
  }).filter(({ profile, target }) =>
    profile.label.toLocaleLowerCase().includes(normalizedQuery)
      || target?.label.toLocaleLowerCase().includes(normalizedQuery),
  );
  const unavailable = items.flatMap((profile) => {
    if (profile.kind === 'local' || profile.kind === 'tmux-control') return [];
    if (profile.kind === 'tmux' && items.some((candidate) => candidate.kind === 'local')) return [];
    if (profile.kind === 'ssh-tmux' && choices.some(({ profile: candidate }) => candidate.kind === 'ssh')) return [];
    if (targets.some((target) => target.profileId === profile.id && target.state === 'available')) return [];
    const status = targets.find((target) => target.profileId === profile.id);
    const reason = status?.state === 'timed-out' ? 'Timed out' : status?.state === 'unavailable' ? 'Unavailable' : 'No running targets';
    return profile.label.toLocaleLowerCase().includes(normalizedQuery)
      ? [{ profile, reason }]
      : [];
  });
  const running = choices.filter(({ target }) => target?.purpose === 'running');
  const launchable = choices.filter(({ target }) => target?.purpose !== 'running');
  const recent = launchable.filter(({ profile }) => recentProfileIds.includes(profile.id));
  const available = launchable.filter(({ profile }) => !recentProfileIds.includes(profile.id));
  async function choose(profile: TerminalProfileSummary, target?: TerminalTargetSummary): Promise<void> {
    if (pending) return;
    const choiceId = `${profile.id}\u0000${target?.id ?? ''}`;
    setPending(choiceId);
    setError(undefined);
    try {
      onLaunched(await launch({ profileId: profile.id, targetId: target?.id, cols: 80, rows: 24 }));
      onOpenChange(false);
    } catch {
      setError('Terminal could not be started.');
    } finally {
      setPending(undefined);
    }
  }

  function group(label: string, entries: typeof choices) {
    if (entries.length === 0) return null;
    return (
      <section className="terminal-launcher__group" aria-label={label}>
        <h3>{label}</h3>
        {entries.map(({ profile, target }) => {
          const choiceId = `${profile.id}\u0000${target?.id ?? ''}`;
          return (
            <Button
              block
              className="terminal-launcher__choice"
              disabled={pending !== undefined}
              key={choiceId}
              onClick={() => void choose(profile, target)}
            >
              <SquareTerminal size={16} />
              <span>{target?.label ?? profile.label}</span>
              {target && target.label !== profile.label
                ? <span className="terminal-launcher__kind">{profile.label}</span>
                : null}
              {pending === choiceId && <span className="terminal-launcher__pending">Starting...</span>}
            </Button>
          );
        })}
      </section>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open terminal"
      description="Start a terminal here or connect to another environment."
      className="dialog terminal-launcher"
      testId="terminal-launcher"
    >
      <form
        className="terminal-launcher__search"
        onSubmit={(event) => {
          event.preventDefault();
          if (choices.length === 1) void choose(choices[0]!.profile, choices[0]!.target);
        }}
      >
        <Search size={16} aria-hidden="true" />
        <TextInput
          aria-label="Search terminal profiles"
          value={query}
          onChange={setQuery}
          placeholder="Search terminals"
        />
      </form>
      {loadingProfiles
        ? <p>Loading terminal profiles...</p>
        : <>
            {error && <p role="alert">{error}</p>}
            {discovering && <p role="status">Checking running terminals, SSH, containers, and virtual machines...</p>}
            {discoveryError && <p role="alert">{discoveryError}</p>}
            {!error && items.length === 0 && <p>No terminal profiles are available.</p>}
            {group('Running', running)}
            {group('Recent', recent)}
            {group('Available', available)}
            {!error && !discovering && choices.length === 0 && unavailable.length === 0 && <p>No matching terminals.</p>}
            {!discovering && unavailable.length > 0 && (
              <details className="terminal-launcher__unavailable" open={query.length > 0 || undefined}>
                <summary>{unavailable.length} unavailable {unavailable.length === 1 ? 'profile' : 'profiles'}</summary>
                <ul>
                  {unavailable.map(({ profile, reason }) => (
                    <li key={profile.id}><span>{profile.label}</span><span>{reason}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </>}
    </Dialog>
  );
}