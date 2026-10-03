import type { AgentApproval } from './contracts.js'

export interface AssistantCliOptions {
  chatId: string
  databasePath: string
  cwd: string
  approval: AgentApproval
  codingTools: boolean
  preferredModel?: string
  toolsetIds: string[]
  systemPrompt?: string
}

function valueAt(arguments_: string[], index: number, flag: string): string {
  const value = arguments_[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

export function parseAssistantCliOptions(arguments_: string[]): AssistantCliOptions {
  const values: Partial<AssistantCliOptions> = {
    approval: 'writes',
    codingTools: true,
    toolsetIds: [],
  }
  const toolsetIds: string[] = []

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--') continue
    if (argument === '--coding-tools') {
      values.codingTools = true
      continue
    }
    if (argument === '--no-coding-tools') {
      values.codingTools = false
      continue
    }
    const aliases: Record<string, keyof AssistantCliOptions> = {
      '--chat': 'chatId',
      '--database': 'databasePath',
      '--cwd': 'cwd',
      '--approval': 'approval',
      '--model': 'preferredModel',
      '--toolset': 'toolsetIds',
      '--system-prompt': 'systemPrompt',
    }
    const key = argument ? aliases[argument] : undefined
    if (!key) throw new Error(`Unsupported agent option: ${argument ?? ''}`)
    const value = valueAt(arguments_, index, argument ?? '')
    index += 1
    if (key === 'toolsetIds') {
      toolsetIds.push(...value.split(',').map((entry) => entry.trim()).filter(Boolean))
      continue
    }
    if (key === 'approval') {
      if (value !== 'all' && value !== 'read-only' && value !== 'writes' && value !== 'none') {
        throw new Error('--approval must be all, read-only, writes, or none.')
      }
      values.approval = value
      continue
    }
    Object.assign(values, { [key]: value })
  }

  for (const [key, label] of [
    ['chatId', '--chat'],
    ['databasePath', '--database'],
    ['cwd', '--cwd'],
  ] as const) {
    if (!values[key]?.trim()) throw new Error(`${label} is required.`)
  }
  return {
    chatId: values.chatId!,
    databasePath: values.databasePath!,
    cwd: values.cwd!,
    approval: values.approval!,
    codingTools: values.codingTools!,
    toolsetIds,
    ...(values.preferredModel ? { preferredModel: values.preferredModel } : {}),
    ...(values.systemPrompt ? { systemPrompt: values.systemPrompt } : {}),
  }
}
