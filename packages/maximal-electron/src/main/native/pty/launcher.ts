import { app, type BrowserWindow } from 'electron';

import type {
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
  VagrantConnector,
  WslConnector,
} from '@maximal/maximal-terminal';
import { TerminalLauncher, loadTerminalProfiles } from '@maximal/maximal-terminal';

let names: TmuxSessionNames | undefined;
let instance: TerminalLauncher<BrowserWindow> | undefined;

/** Name this app's tmux sessions. Fixed once the launcher has been built. */
export function configureTmuxSessions(prefix: string): void {
  if (names?.prefix === prefix) return;
  if (instance) throw new Error('The tmux session prefix cannot change after terminals have launched.');
  names = new TmuxSessionNames(prefix);
}

export function tmuxSessionNames(): TmuxSessionNames {
  if (!names) throw new Error('configurePty must be called before terminals launch.');
  return names;
}

export function launcher(): TerminalLauncher<BrowserWindow> {
  instance ??= createLauncher(tmuxSessionNames());
  return instance;
}

const createLauncher = (names: TmuxSessionNames): TerminalLauncher<BrowserWindow> => new TerminalLauncher<BrowserWindow>({
  connectors: [
    new DockerConnector(execFileRunner),
    new PodmanConnector(execFileRunner),
    new LimaConnector(execFileRunner),
    new MultipassConnector(execFileRunner),
    new KubernetesConnector(execFileRunner),
    new WslConnector(execFileRunner),
    new VagrantConnector(execFileRunner),
    new SshConnector(app.getPath('home'), undefined, execFileRunner),
    new TmuxConnector(execFileRunner, names),
    new SshTmuxConnector(app.getPath('home'), names, undefined, execFileRunner),
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
