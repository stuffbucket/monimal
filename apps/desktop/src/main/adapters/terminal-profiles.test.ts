import { describe, expect, it } from 'vitest'

import { desktopTerminalProfiles } from './terminal-profiles'

describe('desktop terminal profiles', () => {
  it('owns the Maximal client profiles and their POSIX commands', () => {
    const profiles = desktopTerminalProfiles('darwin')

    expect(profiles.map(({ profile }) => profile.id)).toEqual([
      'claude-desktop',
      'claude-code',
      'copilot-cli',
      'codex',
      'maximal',
    ])
    expect(profiles.map(({ launch }) => launch)).toEqual([
      { command: '/usr/bin/open', args: ['-W', '-a', 'Claude'] },
      { command: 'claude', args: [] },
      { command: 'copilot', args: [] },
      { command: 'codex', args: [] },
      { command: 'maximal', args: [] },
    ])
  })

  it('uses PowerShell for command-line clients on Windows', () => {
    const profiles = desktopTerminalProfiles('win32')

    expect(profiles.map(({ profile }) => profile.id)).toEqual([
      'claude-code',
      'copilot-cli',
      'codex',
      'maximal',
    ])
    expect(profiles.find(({ profile }) => profile.id === 'codex')?.launch).toEqual({
      command: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-Command', 'codex'],
    })
  })
})
