import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CommandConnector, DiscoveredTarget } from './command-connectors.js';
import type {
  TerminalDiscovery,
  TerminalLaunchRequest,
  TerminalLaunchResult,
  TerminalProfileSummary,
  TerminalTargetSummary,
} from '../../shared/ipc.js';

export interface TrustedTerminalLaunch {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  tmuxControl?: true;
}

export interface TerminalProfilesFile {
  version: 7;
  profiles?: unknown[];
}

const LOCAL_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'local',
  label: 'Local',
  kind: 'local',
});

const TMUX_CONTROL_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'tmux-control',
  label: 'Tmux Control (Experimental)',
  kind: 'tmux-control',
});

const DOCKER_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'docker',
  label: 'Docker',
  kind: 'docker',
});

const PODMAN_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'podman',
  label: 'Podman',
  kind: 'podman',
});

const LIMA_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'lima',
  label: 'Lima',
  kind: 'lima',
});

const MULTIPASS_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'multipass',
  label: 'Multipass',
  kind: 'multipass',
});

const KUBERNETES_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'kubernetes',
  label: 'Kubernetes',
  kind: 'kubernetes',
});

const WSL_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'wsl',
  label: 'WSL',
  kind: 'wsl',
});

const VAGRANT_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'vagrant',
  label: 'Vagrant',
  kind: 'vagrant',
});

const SSH_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'ssh',
  label: 'SSH',
  kind: 'ssh',
});

const TMUX_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'tmux',
  label: 'Tmux',
  kind: 'tmux',
});

const SSH_TMUX_PROFILE: TerminalProfileSummary = Object.freeze({
  id: 'ssh-tmux',
  label: 'SSH + Tmux',
  kind: 'ssh-tmux',
});

const LOCAL_TARGET: TerminalTargetSummary = Object.freeze({
  id: 'local',
  profileId: 'local',
  label: 'This computer',
  state: 'available',
});

export function coerceTerminalProfiles(value: unknown): TerminalProfilesFile {
  if (typeof value !== 'object' || value === null) return { version: 7 };
  const candidate = value as { version?: unknown; profiles?: unknown };
  return {
    version: 7,
    ...(typeof candidate.version === 'number' && candidate.version >= 1 && candidate.version <= 7 && Array.isArray(candidate.profiles)
      && candidate.profiles.every((profile) => typeof profile === 'object' && profile !== null)
      ? { profiles: candidate.profiles }
      : {}),
  };
}

/** Read and repair the app-owned profile file without exposing its contents. */
export function loadTerminalProfiles(userData: string): TerminalProfilesFile {
  const filename = join(userData, 'terminal-profiles.json');
  let profiles: TerminalProfilesFile;
  try {
    profiles = coerceTerminalProfiles(JSON.parse(readFileSync(filename).toString()));
  } catch {
    profiles = { version: 7 };
  }
  mkdirSync(userData, { recursive: true });
  writeFileSync(filename, Buffer.from(`${JSON.stringify(profiles, undefined, 2)}\n`));
  return profiles;
}

export function terminalProfiles(platform = process.platform): readonly TerminalProfileSummary[] {
  return [
    LOCAL_PROFILE,
    ...(platform === 'darwin' || platform === 'linux' ? [TMUX_CONTROL_PROFILE] : []),
    DOCKER_PROFILE,
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32' ? [PODMAN_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' ? [LIMA_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32' ? [MULTIPASS_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32' ? [KUBERNETES_PROFILE] : []),
    ...(platform === 'win32' ? [WSL_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32' ? [VAGRANT_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32' ? [SSH_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' ? [TMUX_PROFILE] : []),
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32' ? [SSH_TMUX_PROFILE] : []),
  ];
}

interface Reservation<Owner> {
  owner: Owner;
  expiresAt: number;
  launch: TrustedTerminalLaunch;
}

interface Target {
  generation: number;
  profileId: TerminalProfileSummary['id'];
  target: DiscoveredTarget;
}

export class TerminalLauncher<Owner> {
  private readonly reservations = new Map<string, Reservation<Owner>>();
  private readonly targets = new Map<string, Target>();
  private readonly connectors: readonly CommandConnector[];
  private targetsOwner: Owner | undefined;
  private generation = 0;

  constructor(
    private readonly options: {
      now?: () => number;
      reservationMs?: number;
      discoveryMs?: number;
      createId?: () => string;
      localLaunch?: TrustedTerminalLaunch;
      connectors?: readonly CommandConnector[];
      platform?: NodeJS.Platform;
    } = {},
  ) {
    this.connectors = this.options.connectors ?? Object.freeze(Array.from(new Set<CommandConnector>()));
  }

  profiles(): readonly TerminalProfileSummary[] {
    return terminalProfiles(this.options.platform);
  }

  async discover(owner: Owner): Promise<TerminalDiscovery> {
    const generation = ++this.generation;
    this.targetsOwner = owner;
    const targets: TerminalTargetSummary[] = [LOCAL_TARGET];
    for (const connector of this.connectors) {
      if (!this.profiles().some((profile) => profile.id === connector.id)) continue;
      try {
        for (const target of await connector.discover()) {
          const id = (this.options.createId ?? randomUUID)();
          this.targets.set(id, { generation, profileId: connector.id, target });
          targets.push({ id, profileId: connector.id, label: target.label, state: 'available' });
        }
      } catch (error) {
        const state = (error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ? 'timed-out' : 'unavailable';
        targets.push({ id: `${connector.id}-${state}`, profileId: connector.id, label: connector.label, state });
      }
    }
    return { generation, targets };
  }

  launch(owner: Owner, request: TerminalLaunchRequest): TerminalLaunchResult {
    let launch: TrustedTerminalLaunch;
    let label = LOCAL_PROFILE.label;
    if (request.profileId === LOCAL_PROFILE.id && (!request.targetId || request.targetId === LOCAL_TARGET.id)) {
      launch = this.options.localLaunch ?? {
        command: (this.options.platform ?? process.platform) === 'win32' ? 'powershell.exe' : process.env['SHELL'] ?? '/bin/zsh',
        args: [],
      };
    } else if (request.profileId === TMUX_CONTROL_PROFILE.id && (!request.targetId || request.targetId === LOCAL_TARGET.id)
      && this.profiles().some((profile) => profile.id === TMUX_CONTROL_PROFILE.id)) {
      launch = { command: 'tmux', args: [], tmuxControl: true };
      label = TMUX_CONTROL_PROFILE.label;
    } else {
      const target = this.targets.get(request.targetId!);
      const connector = this.connectors.find((candidate) => candidate.id === request.profileId);
      if (!target || this.targetsOwner !== owner || target.generation !== this.generation || target.profileId !== request.profileId || !connector) {
        throw new Error('Unknown terminal profile or target.');
      }
      launch = connector.launch(target.target);
      label = connector.label;
    }
    const sessionId = (this.options.createId ?? randomUUID)();
    this.reservations.set(sessionId, {
      owner,
      expiresAt: this.now() + (this.options.reservationMs ?? 10_000),
      launch,
    });
    return { sessionId, label };
  }

  take(owner: Owner, sessionId: string): TrustedTerminalLaunch | undefined {
    this.clean();
    const reservation = this.reservations.get(sessionId);
    if (!reservation || reservation.owner !== owner) return undefined;
    this.reservations.delete(sessionId);
    return reservation.launch;
  }

  release(owner: Owner): void {
    for (const [id, reservation] of this.reservations) {
      if (reservation.owner === owner) this.reservations.delete(id);
    }
    if (this.targetsOwner === owner) {
      this.targetsOwner = undefined;
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private clean(): void {
    const now = this.now();
    for (const [id, reservation] of this.reservations) {
      if (reservation.expiresAt <= now) this.reservations.delete(id);
    }
  }
}