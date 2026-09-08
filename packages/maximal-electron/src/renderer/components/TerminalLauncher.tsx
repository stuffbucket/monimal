import { Search, SquareTerminal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Dialog, TextInput } from './controls/index.js';

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
  const [items, setItems] = useState<TerminalProfileSummary[]>([]);
  const [targets, setTargets] = useState<TerminalTargetSummary[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setError(undefined);
    setQuery('');
    setLoading(true);
    void Promise.all([profiles(), discover()])
      .then(([nextProfiles, result]) => {
        if (!current) return;
        setItems(nextProfiles);
        setTargets(result.targets);
      })
      .catch(() => {
        if (current) setError('Terminal profiles are unavailable.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [discover, open, profiles]);

  const normalizedQuery = query.toLocaleLowerCase();
  const choices = items.flatMap<TerminalChoice>((profile) => {
    const targetless = profile.kind === 'local' || profile.kind === 'tmux-control';
    if (targetless) return [{ profile, target: undefined }];
    return targets
      .filter((target) => target.profileId === profile.id && target.state === 'available')
      .map((target) => ({ profile, target }));
  }).filter(({ profile, target }) =>
    profile.label.toLocaleLowerCase().includes(normalizedQuery)
      || target?.label.toLocaleLowerCase().includes(normalizedQuery),
  );
  const unavailable = items.flatMap((profile) => {
    if (profile.kind === 'local' || profile.kind === 'tmux-control') return [];
    if (targets.some((target) => target.profileId === profile.id && target.state === 'available')) return [];
    const status = targets.find((target) => target.profileId === profile.id);
    const reason = status?.state === 'timed-out' ? 'Timed out' : status?.state === 'unavailable' ? 'Unavailable' : 'No running targets';
    return profile.label.toLocaleLowerCase().includes(normalizedQuery)
      ? [{ profile, reason }]
      : [];
  });
  const recent = choices.filter(({ profile }) => recentProfileIds.includes(profile.id));
  const available = choices.filter(({ profile }) => !recentProfileIds.includes(profile.id));
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
              {target && <span className="terminal-launcher__kind">{profile.label}</span>}
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
      description="Choose a terminal profile."
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
      {loading
        ? <p>Loading terminal profiles...</p>
        : <>
            {error && <p role="alert">{error}</p>}
            {!error && items.length === 0 && <p>No terminal profiles are available.</p>}
            {group('Recent', recent)}
            {group('Available', available)}
            {!error && choices.length === 0 && unavailable.length === 0 && <p>No matching terminals.</p>}
            {unavailable.length > 0 && (
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