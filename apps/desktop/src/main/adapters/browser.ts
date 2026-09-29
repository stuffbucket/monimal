import {
  BrowserHost,
  createBrowserToolset,
} from '@maximal/maximal-browser/host'
import { registerToolset } from '@maximal/maximal-harness/host'
import {
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'

const id = z.string().uuid()
const url = z.string().min(1).max(8_192)
const navigation = z.object({ id, url })
const command = z.object({
  id,
  command: z.enum(['back', 'forward', 'reload']),
})
const bounds = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
})
const visibility = z.object({
  id: id.nullable(),
  bounds: bounds.optional(),
})
const ref = z.string().regex(/^e\d+$/)
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('inspect'), id }),
  z.object({ type: z.literal('click'), id, ref }),
  z.object({ type: z.literal('hover'), id, ref }),
  z.object({
    type: z.literal('type'),
    id,
    ref,
    text: z.string().max(50_000),
    clear: z.boolean().optional(),
  }),
  z.object({ type: z.literal('press'), id, key: z.string().max(16) }),
  z.object({ type: z.literal('drag'), id, fromRef: ref, toRef: ref }),
  z.object({
    type: z.literal('scroll'),
    id,
    direction: z.enum(['up', 'down', 'left', 'right']),
    amount: z.number().min(1).max(5_000).optional(),
  }),
  z.object({
    type: z.literal('wait'),
    id,
    text: z.string().max(1_000).optional(),
    timeoutMs: z.number().min(0).max(30_000).optional(),
  }),
  z.object({ type: z.literal('screenshot'), id }),
  z.object({
    type: z.literal('set-control'),
    id,
    control: z.enum(['user', 'agent-shared', 'agent-exclusive']),
  }),
  z.object({
    type: z.literal('terminal-context'),
    sessionIds: z.array(z.string().min(1)).max(32),
  }),
])

export function startBrowserHost(window: () => BrowserWindow | null): () => void {
  const owner = (event: IpcMainInvokeEvent): BrowserWindow => {
    const current = window()
    if (!current || current.isDestroyed() || event.sender !== current.webContents) {
      throw new Error('Browser requests are accepted only from the main window.')
    }
    return current
  }
  const host = new BrowserHost({
    window,
    onEvent: (event) => {
      const current = window()
      if (current && !current.isDestroyed()) {
        current.webContents.send(BRIDGE_CHANNELS.browserEvent, event)
      }
    },
  })
  const unregisterToolset = registerToolset(createBrowserToolset(host))

  ipcMain.handle(BRIDGE_CHANNELS.browserList, (event) => {
    owner(event)
    return host.list()
  })
  ipcMain.handle(BRIDGE_CHANNELS.browserOpen, (event, input: unknown) => {
    owner(event)
    return host.open(url.parse(input), 'user')
  })
  ipcMain.handle(BRIDGE_CHANNELS.browserNavigate, (event, input: unknown) => {
    owner(event)
    const request = navigation.parse(input)
    return host.navigate(request.id, request.url)
  })
  ipcMain.handle(BRIDGE_CHANNELS.browserCommand, (event, input: unknown) => {
    owner(event)
    const request = command.parse(input)
    host.command(request.id, request.command)
  })
  ipcMain.handle(BRIDGE_CHANNELS.browserClose, (event, input: unknown) => {
    owner(event)
    host.close(id.parse(input))
  })
  ipcMain.handle(BRIDGE_CHANNELS.browserShow, (event, input: unknown) => {
    owner(event)
    const request = visibility.parse(input)
    host.show(request.id, request.bounds)
  })
  ipcMain.handle(BRIDGE_CHANNELS.browserAction, (event, input: unknown) => {
    owner(event)
    const request = action.parse(input)
    switch (request.type) {
      case 'inspect': return host.inspect(request.id)
      case 'click': return host.click(request.id, request.ref)
      case 'hover': return host.hover(request.id, request.ref)
      case 'type': return host.type(request.id, request.ref, request.text, request.clear)
      case 'press': return host.press(request.id, request.key)
      case 'drag': return host.drag(request.id, request.fromRef, request.toRef)
      case 'scroll': return host.scroll(request.id, request.direction, request.amount)
      case 'wait': return host.wait(request.id, request)
      case 'screenshot': return host.screenshot(request.id)
      case 'set-control': return host.setControl(request.id, request.control)
      case 'terminal-context': return host.setTerminalContext(request.sessionIds)
    }
  })

  return () => {
    unregisterToolset()
    host.dispose()
    for (const channel of [
      BRIDGE_CHANNELS.browserList,
      BRIDGE_CHANNELS.browserOpen,
      BRIDGE_CHANNELS.browserNavigate,
      BRIDGE_CHANNELS.browserCommand,
      BRIDGE_CHANNELS.browserClose,
      BRIDGE_CHANNELS.browserShow,
      BRIDGE_CHANNELS.browserAction,
    ]) ipcMain.removeHandler(channel)
  }
}
