import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultShell } from '../../src/pty/shell.js';

function onPlatform(platform: NodeJS.Platform, env: Record<string, string | undefined>): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('defaultShell', () => {
  it('uses COMSPEC on Windows, ignoring SHELL', () => {
    onPlatform('win32', { COMSPEC: 'C:\\cmd.exe', SHELL: '/bin/bash' });
    expect(defaultShell()).toBe('C:\\cmd.exe');
  });

  it('falls back to PowerShell on Windows', () => {
    onPlatform('win32', { COMSPEC: undefined });
    expect(defaultShell()).toBe('powershell.exe');
  });

  it('uses SHELL elsewhere, ignoring COMSPEC', () => {
    onPlatform('linux', { SHELL: '/bin/bash', COMSPEC: 'C:\\cmd.exe' });
    expect(defaultShell()).toBe('/bin/bash');
  });

  it('falls back to zsh elsewhere', () => {
    onPlatform('darwin', { SHELL: undefined });
    expect(defaultShell()).toBe('/bin/zsh');
  });
});
