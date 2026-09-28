import { EventEmitter } from 'node:events'

import { ControlRpcError } from '@maximal/maximal-core/client'
import { describe, expect, it, vi } from 'vitest'

import { CoreProcessClient } from './core-process-client.js'

function fixture() {
  const events = new EventEmitter()
  const send = vi.fn((_message: unknown, callback: (error: Error | null) => void) => {
    callback(null)
    return true
  })
  const child = Object.assign(events, { connected: true, send })
  return { child, send, emit: events.emit.bind(events) }
}

describe('Core process control channel', () => {
  it('correlates overlapping requests without any socket address', async () => {
    const { child, send, emit } = fixture()
    const client = new CoreProcessClient(child)
    const first = client.call('auth/status')
    const second = client.call('accounts/list', { enabled: true })

    expect(send.mock.calls.map(([message]) => message)).toEqual([
      { kind: 'rpc', id: 1, method: 'auth/status' },
      { kind: 'rpc', id: 2, method: 'accounts/list', params: { enabled: true } },
    ])
    emit('message', { kind: 'rpc-result', id: 2, result: { accounts: [] } })
    emit('message', { kind: 'rpc-result', id: 1, result: { state: 'unauthenticated' } })
    await expect(first).resolves.toEqual({ state: 'unauthenticated' })
    await expect(second).resolves.toEqual({ accounts: [] })
    client.close()
  })

  it('preserves structured Core RPC errors', async () => {
    const { child, emit } = fixture()
    const client = new CoreProcessClient(child)
    const result = client.call('auth/start')
    emit('message', {
      kind: 'rpc-result', id: 1,
      error: { code: 1002, message: 'Sign in required', data: { reason: 'auth_fatal' } },
    })
    await expect(result).rejects.toMatchObject({
      code: 1002, message: 'Sign in required', data: { reason: 'auth_fatal' },
    } satisfies Partial<ControlRpcError>)
    client.close()
  })

  it('reports process-channel send failures instead of leaving calls pending', async () => {
    const { child, send } = fixture()
    const client = new CoreProcessClient(child)
    send.mockImplementationOnce((_message, callback) => {
      callback(new Error('IPC send failed'))
      return false
    })

    await expect(client.call('auth/status')).rejects.toThrow('IPC send failed')
    client.close()
  })

  it('delivers notifications and fails pending calls when the child exits', async () => {
    const { child, emit } = fixture()
    const client = new CoreProcessClient(child)
    const onState = vi.fn()
    client.onState(onState)
    emit('message', {
      kind: 'control-event',
      frame: { jsonrpc: '2.0', method: 'control/auth', params: { state: 'authenticated' } },
    })
    expect(onState).toHaveBeenLastCalledWith(
      { auth: { state: 'authenticated' } }, 'auth',
    )
    const result = client.call('models/list')
    emit('exit', 1, null)
    await expect(result).rejects.toThrow('Maximal Core process IPC closed')
    await expect(client.call('models/list')).rejects.toThrow('disconnected')
  })

  it('replaces prior feed state on a reconnect snapshot', () => {
    const { child, emit } = fixture()
    const client = new CoreProcessClient(child)
    const onState = vi.fn()
    client.onState(onState)
    emit('message', {
      kind: 'control-event',
      frame: { jsonrpc: '2.0', method: 'control/auth', params: { state: 'polling' } },
    })
    emit('message', {
      kind: 'control-event',
      frame: {
        jsonrpc: '2.0',
        method: 'control/snapshot',
        params: { protocolVersion: 2, snapshot: { accounts: { accounts: [] } } },
      },
    })

    expect(onState).toHaveBeenLastCalledWith(
      { accounts: { accounts: [] } }, 'snapshot',
    )
    client.close()
  })

  it('replays a snapshot received before discovery completes to a later listener', () => {
    const { child, emit } = fixture()
    const client = new CoreProcessClient(child)
    emit('message', {
      kind: 'control-event',
      frame: {
        jsonrpc: '2.0',
        method: 'control/snapshot',
        params: { protocolVersion: 2, snapshot: { auth: { state: 'unauthenticated' } } },
      },
    })

    const onState = vi.fn()
    client.onState(onState)
    expect(onState).toHaveBeenCalledWith(
      { auth: { state: 'unauthenticated' } }, 'snapshot',
    )
    client.close()
  })

  it('fails closed if the child sends an incompatible snapshot', async () => {
    const { child, emit } = fixture()
    const client = new CoreProcessClient(child)
    const result = client.call('models/list')
    emit('message', {
      kind: 'control-event',
      frame: {
        jsonrpc: '2.0',
        method: 'control/snapshot',
        params: { protocolVersion: 999, snapshot: {} },
      },
    })

    await expect(result).rejects.toThrow('incompatible control snapshot')
    await expect(client.call('models/list')).rejects.toThrow('disconnected')
  })
})
