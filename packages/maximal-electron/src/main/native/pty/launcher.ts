import { app, type BrowserWindow } from 'electron';

import type {
  DirectTerminalProfile,
  TerminalDiscovery,
  TerminalProfileSummary,
} from '@maximal/maximal-terminal';
import {
  DockerConnector,
  execFileRunner,
  KubernetesConnector,
  LimaConnector,
  MultipassConnector,
  PodmanConnector,
  SshConnector,
  SshTmuxConnector,
  TmuxConnector,
  TmuxSessionNames,
  type TmuxStatusMode,
  VagrantConnector,
  WslConnector,
} from '@maximal/maximal-terminal';
import { TerminalLauncher, loadTerminalProfiles } from '@maximal/maximal-terminal';

let names: TmuxSessionNames | undefined;
let status: TmuxStatusMode = 'off';
let instance: TerminalLauncher<BrowserWindow> | undefined;
let directProfiles: readonly DirectTerminalProfile[] = [];

/** Name this app's tmux sessions. Fixed once the launcher has been built. */
export function configureTmuxSessions(prefix: string, nextStatus: TmuxStatusMode = 'off'): void {
  if (names?.prefix === prefix && status === nextStatus) return;
  if (instance) throw new Error('Tmux session configuration cannot change after terminals have launched.');
  names = new TmuxSessionNames(prefix);
  status = nextStatus;
}

export function configureDirectTerminalProfiles(profiles: readonly DirectTerminalProfile[]): void {
  if (instance) {
    if (profiles.length === 0 && directProfiles.length === 0) return;
    throw new Error('Direct terminal profiles cannot change after terminals have launched.');
  }
  directProfiles = profiles;
}

export function tmuxSessionNames(): TmuxSessionNames {
  if (!names) throw new Error('configurePty must be called before terminals launch.');
  return names;
}

export function launcher(): TerminalLauncher<BrowserWindow> {
  instance ??= createLauncher(tmuxSessionNames(), status);
  return instance;
}

const createLauncher = (
  names: TmuxSessionNames,
  tmuxStatus: TmuxStatusMode,
): TerminalLauncher<BrowserWindow> => new TerminalLauncher<BrowserWindow>({
  directProfiles,
  connectors: [
    new DockerConnector(execFileRunner),
    new PodmanConnector(execFileRunner),
    new LimaConnector(execFileRunner),
    new MultipassConnector(execFileRunner),
    new KubernetesConnector(execFileRunner),
    new WslConnector(execFileRunner),
    new VagrantConnector(execFileRunner),
    new SshConnector(app.getPath('home'), undefined, execFileRunner),
    new TmuxConnector(execFileRunner, names, tmuxStatus),
    new SshTmuxConnector(app.getPath('home'), names, undefined, execFileRunner, tmuxStatus),
  ],
});
const launchOwners = new WeakSet<BrowserWindow>();

/** Reload profiles, and release this window's reservations when it closes. */
export function prepareLauncher(owner: BrowserWindow): void {
  loadTerminalProfiles(app.getPath('userData'));
  if (launchOwners.has(owner)) return;
  launchOwners.add(owner);
  owner.once('closed', () => launcher().release(owner));
}

/** Renderer-visible summaries. Executable profile settings never leave main. */
export function listTerminalProfiles(owner: BrowserWindow | undefined): TerminalProfileSummary[] {
  if (!owner) return [];
  prepareLauncher(owner);
  return [...launcher().profiles()];
}

export async function discoverTerminalTargets(
  owner: BrowserWindow | undefined,
): Promise<TerminalDiscovery> {
  if (!owner) return { generation: 0, targets: [] };
  prepareLauncher(owner);
  return launcher().discover(owner);
}
