import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

import { describe, expect, it, vi } from 'vitest'

import {
  getOllamaRuntimeStatus,
  launchOllama,
  updateOllamaContextLength,
} from './ollama-runtime'

function command(
  responses: Record<string, { stdout: string } | Error>,
): (file: string, args: string[]) => Promise<{ stdout: string }> {
  return vi.fn(async (file: string, args: string[]) => {
    const key = `${file} ${args.join(' ')}`
    const response = responses[key]
    if (response instanceof Error) throw response
    if (response === undefined) throw new Error(`Unexpected command: ${key}`)
    return response
  })
}

describe('Ollama runtime discovery', () => {
  it('reports a registered desktop app even when its local service is stopped', async () => {
    const status = await getOllamaRuntimeStatus({
      platform: 'darwin',
      environment: {},
      home: '/Users/test',
      access: vi.fn(async (path) => {
        if (path !== '/Applications/Ollama.app') throw new Error('not found')
      }),
      fetch: vi.fn(async () => {
        throw new Error('connection refused')
      }),
      execFile: command({
        '/bin/launchctl getenv OLLAMA_HOST': { stdout: '' },
        '/usr/bin/which ollama': new Error('not on PATH'),
      }),
    })

    expect(status).toEqual({
      installation: 'application',
      installed: true,
      running: false,
      can_launch: true,
      can_manage: true,
      application_path: '/Applications/Ollama.app',
      server_configuration_path: '/Users/test/.ollama/server.json',
      desktop_settings_path:
        '/Users/test/Library/Application Support/Ollama/db.sqlite',
      endpoint: 'http://127.0.0.1:11434',
      context_length: null,
    })
  })

  it('reports a CLI installation independently from port availability', async () => {
    const status = await getOllamaRuntimeStatus({
      platform: 'linux',
      environment: {},
      home: '/home/test',
      access: vi.fn(async () => {
        throw new Error('not found')
      }),
      fetch: vi.fn(async () => {
        throw new Error('connection refused')
      }),
      execFile: command({
        '/usr/bin/which ollama': { stdout: '/usr/local/bin/ollama\n' },
      }),
    })

    expect(status).toEqual({
      installation: 'cli',
      installed: true,
      running: false,
      can_launch: true,
      can_manage: false,
      application_path: '/usr/local/bin/ollama',
      server_configuration_path: '/home/test/.ollama/server.json',
      desktop_settings_path: null,
      endpoint: 'http://127.0.0.1:11434',
      context_length: null,
    })
  })

  it('probes the endpoint configured through OLLAMA_HOST', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))

    const status = await getOllamaRuntimeStatus({
      platform: 'linux',
      environment: { OLLAMA_HOST: '192.168.1.20:11500' },
      home: '/home/test',
      access: vi.fn(async () => {
        throw new Error('not found')
      }),
      fetch,
      execFile: command({
        '/usr/bin/which ollama': new Error('not on PATH'),
      }),
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://192.168.1.20:11500/api/version',
      expect.any(Object),
    )
    expect(status.endpoint).toBe('http://192.168.1.20:11500')
    expect(status.running).toBe(true)
  })

  it('opens the registered desktop app to manage Ollama models', async () => {
    const execFile = command({
      '/usr/bin/open /Applications/Ollama.app': { stdout: '' },
      '/bin/launchctl getenv OLLAMA_HOST': { stdout: '' },
      '/usr/bin/which ollama': { stdout: '/usr/local/bin/ollama\n' },
    })

    const status = await launchOllama({
      platform: 'darwin',
      environment: {},
      home: '/Users/test',
      access: vi.fn(async (path) => {
        if (path !== '/Applications/Ollama.app') throw new Error('not found')
      }),
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
      execFile,
    })

    expect(execFile).toHaveBeenCalledWith('/usr/bin/open', [
      '/Applications/Ollama.app',
    ])
    expect(status.running).toBe(true)
    expect(status.can_manage).toBe(true)
  })

  it('starts ollama serve when only the CLI is installed', async () => {
    const child = new EventEmitter() as ChildProcess
    child.unref = vi.fn()
    const spawn = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'))
      return child
    })
    const execFile = command({
      '/usr/bin/which ollama': { stdout: '/opt/bin/ollama\n' },
    })

    await launchOllama({
      platform: 'linux',
      environment: {},
      home: '/home/test',
      access: vi.fn(async () => {
        throw new Error('not found')
      }),
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
      execFile,
      spawn,
    })

    expect(spawn).toHaveBeenCalledWith('/opt/bin/ollama', ['serve'])
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('updates the desktop context length through the narrow settings writer', async () => {
    const writeContextLength = vi.fn()
    const databasePath =
      '/Users/test/Library/Application Support/Ollama/db.sqlite'

    const status = await updateOllamaContextLength(8192, {
      platform: 'darwin',
      environment: {},
      home: '/Users/test',
      access: vi.fn(async (path) => {
        if (path !== '/Applications/Ollama.app' && path !== databasePath) {
          throw new Error('not found')
        }
      }),
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
      execFile: command({
        '/bin/launchctl getenv OLLAMA_HOST': { stdout: '' },
        '/usr/bin/which ollama': new Error('not on PATH'),
      }),
      readContextLength: vi.fn(() => 8192),
      writeContextLength,
    })

    expect(writeContextLength).toHaveBeenCalledWith(databasePath, 8192)
    expect(status.context_length).toBe(8192)
  })
})
