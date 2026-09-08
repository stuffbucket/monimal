// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { TerminalLauncher } from '../../src/renderer/components/TerminalLauncher.js';
import type {
  TerminalDiscovery as RendererTerminalDiscovery,
  TerminalLaunchRequest as RendererTerminalLaunchRequest,
  TerminalLaunchResult as RendererTerminalLaunchResult,
  TerminalProfileSummary as RendererTerminalProfileSummary,
  TerminalTargetSummary as RendererTerminalTargetSummary,
} from '../../src/renderer/components/TerminalLauncher.js';
import type {
  TerminalDiscovery as IpcTerminalDiscovery,
  TerminalLaunchRequest as IpcTerminalLaunchRequest,
  TerminalLaunchResult as IpcTerminalLaunchResult,
  TerminalProfileSummary as IpcTerminalProfileSummary,
  TerminalTargetSummary as IpcTerminalTargetSummary,
} from '../../src/shared/ipc.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Value extends true> = Value;

type TerminalLauncherContractParity = [
  Assert<Equal<RendererTerminalProfileSummary, IpcTerminalProfileSummary>>,
  Assert<Equal<RendererTerminalTargetSummary, IpcTerminalTargetSummary>>,
  Assert<Equal<RendererTerminalDiscovery, IpcTerminalDiscovery>>,
  Assert<Equal<RendererTerminalLaunchRequest, IpcTerminalLaunchRequest>>,
  Assert<Equal<RendererTerminalLaunchResult, IpcTerminalLaunchResult>>,
];

void (undefined as unknown as TerminalLauncherContractParity);

const profiles = async () => [
  { id: 'local', label: 'Local', kind: 'local' as const },
  { id: 'tmux-control', label: 'Tmux Control (Experimental)', kind: 'tmux-control' as const },
  { id: 'docker', label: 'Docker', kind: 'docker' as const },
];
const discover = async () => ({
  generation: 1,
  targets: [
    { id: 'local', profileId: 'local', label: 'This computer', state: 'available' as const },
    { id: 'opaque-target', profileId: 'docker', label: 'desktop: web', state: 'available' as const },
  ],
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('TerminalLauncher', () => {
  it('shows only a stable loading state until discovery settles', async () => {
    let resolveProfiles!: (value: RendererTerminalProfileSummary[]) => void;
    let resolveDiscovery!: (value: RendererTerminalDiscovery) => void;
    const pendingProfiles = new Promise<RendererTerminalProfileSummary[]>((resolve) => { resolveProfiles = resolve; });
    const pendingDiscovery = new Promise<RendererTerminalDiscovery>((resolve) => { resolveDiscovery = resolve; });
    const element = document.createElement('div');
    const root = createRoot(element);
    await act(async () => {
      root.render(<TerminalLauncher open onOpenChange={() => undefined} profiles={() => pendingProfiles} discover={() => pendingDiscovery} launch={async () => ({ sessionId: 'unused', label: 'unused' })} onLaunched={() => undefined} />);
    });
    expect(document.body.textContent).toContain('Loading terminal profiles...');
    expect(document.body.textContent).not.toContain('No terminal profiles are available.');
    expect(document.body.textContent).not.toContain('has no running targets');
    await act(async () => {
      resolveProfiles(await profiles());
      resolveDiscovery(await discover());
    });
    expect(document.body.textContent).not.toContain('Loading terminal profiles...');
    expect(document.body.textContent).toContain('Local');
    const tmuxControl = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Tmux Control'));
    expect(tmuxControl).toBeDefined();
    expect(tmuxControl!.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('Tmux Control (Experimental) has no running targets.');
    await act(async () => root.unmount());
  });

  it('searches and launches its sole result from Enter', async () => {
    const launched = vi.fn();
    const launch = vi.fn(async () => ({ sessionId: 'session-1', label: 'Local' }));
    const element = document.createElement('div');
    const root = createRoot(element);
    await act(async () => {
      root.render(<TerminalLauncher open onOpenChange={() => undefined} profiles={profiles} discover={discover} launch={launch} onLaunched={launched} />);
    });
    const input = document.body.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'docker');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.body.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(launch).toHaveBeenCalledWith({ profileId: 'docker', targetId: 'opaque-target', cols: 80, rows: 24 });
    expect(launched).toHaveBeenCalledWith({ sessionId: 'session-1', label: 'Local' });
    await act(async () => root.unmount());
  });

  it('does not create a tab callback when launch fails', async () => {
    const launched = vi.fn();
    const element = document.createElement('div');
    const root = createRoot(element);
    await act(async () => {
      root.render(<TerminalLauncher open onOpenChange={() => undefined} profiles={profiles} discover={discover} launch={async () => { throw new Error('no shell'); }} onLaunched={launched} />);
    });
    await act(async () => {
      (document.body.querySelector('.terminal-launcher__choice') as HTMLButtonElement).click();
    });
    expect(launched).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Terminal could not be started.');
    await act(async () => root.unmount());
  });
});