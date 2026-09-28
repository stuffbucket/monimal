import type { DirectTerminalProfile, TrustedTerminalLaunch } from '@maximal/maximal-terminal'

function commandLaunch(command: string, platform: NodeJS.Platform): TrustedTerminalLaunch {
  return platform === 'win32'
    ? {
        command: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-Command', command],
      }
    : { command, args: [] }
}

export function desktopTerminalProfiles(
  platform: NodeJS.Platform = process.platform,
): DirectTerminalProfile[] {
  return [
    ...(platform === 'darwin'
      ? [{
          profile: {
            id: 'claude-desktop',
            label: 'Claude Desktop',
            description: 'Open the Claude desktop app',
            kind: 'command' as const,
          },
          launch: {
            command: '/usr/bin/open',
            args: ['-W', '-a', 'Claude'],
          },
        }]
      : []),
    {
      profile: {
        id: 'claude-code',
        label: 'Claude Code',
        description: 'Start Claude Code in a terminal',
        kind: 'command',
      },
      launch: commandLaunch('claude', platform),
    },
    {
      profile: {
        id: 'copilot-cli',
        label: 'Copilot CLI',
        description: 'Start GitHub Copilot CLI',
        kind: 'command',
      },
      launch: commandLaunch('copilot', platform),
    },
    {
      profile: {
        id: 'codex',
        label: 'Codex',
        description: 'Start OpenAI Codex in a terminal',
        kind: 'command',
      },
      launch: commandLaunch('codex', platform),
    },
    {
      profile: {
        id: 'maximal',
        label: 'Maximal',
        description: 'Open the Maximal harness',
        kind: 'command',
      },
      launch: commandLaunch('maximal', platform),
    },
  ]
}
