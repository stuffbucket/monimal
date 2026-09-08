import {
  createTerminalTransport,
  type DetachableTerminalTransport,
} from 'stuffbucket-electron/renderer'

const METHODS = {
  spawn: 'spawn',
  write: 'write',
  resize: 'resize',
  ack: 'acknowledge',
  terminate: 'terminate',
  list: 'list',
  data: 'data',
  exit: 'exit',
} as const

type RequestMethod = typeof METHODS.spawn | typeof METHODS.write | typeof METHODS.resize
  | typeof METHODS.ack | typeof METHODS.terminate | typeof METHODS.list
type EventMethod = typeof METHODS.data | typeof METHODS.exit

export const TERMINAL_METHODS = {
  ...METHODS,
}

const terminal = window.maximal.terminal

export const terminalTransport: DetachableTerminalTransport = createTerminalTransport({
  channels: TERMINAL_METHODS,
  invoke: async (channel, request) => {
    if (channel === METHODS.spawn)
      return terminal.spawn(request as Parameters<typeof terminal.spawn>[0])
    const input = request as { id: string; data?: string; cols?: number; rows?: number; sequence?: number }
    if (channel === METHODS.write) return terminal.write(input.id, input.data ?? '')
    if (channel === METHODS.resize)
      return terminal.resize(input.id, input.cols ?? 1, input.rows ?? 1)
    if (channel === METHODS.ack)
      return terminal.acknowledge(input.id, input.sequence ?? 0)
    if (channel === METHODS.terminate) return terminal.terminate(input.id)
    return terminal.list()
  },
  on: (event, listener) =>
    event === METHODS.data
      ? terminal.onData(listener)
      : terminal.onExit(listener),
} satisfies Parameters<typeof createTerminalTransport<RequestMethod, EventMethod>>[0])