import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getOllamaCloudDisabled,
  getOllamaRuntimeStatus,
  launchOllama,
  updateOllamaCloudDisabled,
  updateOllamaContextLength,
} from '../src/runtime'

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434'

function endpointAtPort(port: number): string {
  const endpoint = new URL(DEFAULT_ENDPOINT)
  endpoint.port = String(port)
  return endpoint.href.replace(/\/$/u, '')
}

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
      endpoint: DEFAULT_ENDPOINT,
      process_id: null,
      process_endpoint: null,
      suggested_endpoint: null,
      context_length: null,
    })
  })

  describe('Ollama server configuration', () => {
    const homes: string[] = []

    afterEach(async () => {
      await Promise.all(homes.splice(0).map((home) => rm(home, {
        force: true,
        recursive: true,
      })))
    })

    async function temporaryHome(): Promise<string> {
      const home = await mkdtemp(join(tmpdir(), 'maximal-ollama-'))
      homes.push(home)
      return home
    }

    it('defaults cloud models to enabled when server.json is absent', async () => {
      const home = await temporaryHome()

      expect(getOllamaCloudDisabled({ home })).toBe(false)
    })

    it('creates server.json and preserves unrelated Ollama settings', async () => {
      const home = await temporaryHome()
      const directory = join(home, '.ollama')
      const path = join(directory, 'server.json')
      await mkdir(directory)
      await writeFile(path, JSON.stringify({ origins: ['https://example.test'] }))

      expect(await updateOllamaCloudDisabled(true, { home })).toBe(true)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        origins: ['https://example.test'],
        disable_ollama_cloud: true,
      })

      expect(await updateOllamaCloudDisabled(false, { home })).toBe(false)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        origins: ['https://example.test'],
        disable_ollama_cloud: false,
      })
    })

    it('rejects malformed existing server configuration', async () => {
      const home = await temporaryHome()
      const directory = join(home, '.ollama')
      await mkdir(directory)
      await writeFile(join(directory, 'server.json'), '{')

      expect(() => getOllamaCloudDisabled({ home })).toThrow()
      await expect(updateOllamaCloudDisabled(true, { home })).rejects.toThrow()
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
      endpoint: DEFAULT_ENDPOINT,
      process_id: null,
      process_endpoint: null,
      suggested_endpoint: null,
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

  it('finds an Ollama PID and suggests its responding non-default port', async () => {
    const status = await getOllamaRuntimeStatus({
      platform: 'linux',
      environment: {},
      configuredEndpoint: DEFAULT_ENDPOINT,
      home: '/home/test',
      access: vi.fn(async (path) => {
        if (path !== '/usr/bin/lsof') throw new Error('not found')
      }),
      fetch: vi.fn(async (input) =>
        new Response(null, {
          status: String(input).includes(':11500/') ? 200 : 503,
        })),
      execFile: command({
        '/usr/bin/which ollama': { stdout: '/opt/bin/ollama\n' },
        '/usr/bin/pgrep -x ollama': { stdout: '4242\n' },
        '/usr/bin/lsof -nP -a -p 4242 -iTCP -sTCP:LISTEN -Fn': {
          stdout: 'p4242\nn*:11500\n',
        },
      }),
    })

    expect(status).toMatchObject({
      running: false,
      process_id: 4242,
      process_endpoint: endpointAtPort(11500),
      suggested_endpoint: endpointAtPort(11500),
    })
  })

  it('uses ss to find the Ollama PID port when lsof is unavailable on Linux', async () => {
    const status = await getOllamaRuntimeStatus({
      platform: 'linux',
      environment: {},
      configuredEndpoint: DEFAULT_ENDPOINT,
      home: '/home/test',
      access: vi.fn(async (path) => {
        if (path !== '/usr/bin/ss') throw new Error('not found')
      }),
      fetch: vi.fn(async (input) =>
        new Response(null, {
          status: String(input).includes(':11501/') ? 200 : 503,
        })),
      execFile: command({
        '/usr/bin/which ollama': { stdout: '/opt/bin/ollama\n' },
        '/usr/bin/pgrep -x ollama': { stdout: '4343\n' },
        '/usr/bin/ss -ltnp': {
          stdout: 'LISTEN 0 4096 *:11501 *:* users:(("ollama",pid=4343,fd=3))\n',
        },
      }),
    })

    expect(status).toMatchObject({
      process_id: 4343,
      process_endpoint: endpointAtPort(11501),
      suggested_endpoint: endpointAtPort(11501),
    })
  })

  it('finds the capitalized Ollama application process on macOS', async () => {
    const status = await getOllamaRuntimeStatus({
      platform: 'darwin',
      environment: {},
      configuredEndpoint: DEFAULT_ENDPOINT,
      home: '/Users/test',
      access: vi.fn(async (path) => {
        if (path !== '/Applications/Ollama.app' && path !== '/usr/sbin/lsof') {
          throw new Error('not found')
        }
      }),
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
      execFile: command({
        '/usr/bin/which ollama': new Error('not on PATH'),
        '/usr/bin/pgrep -x ollama': new Error('not found'),
        '/usr/bin/pgrep -x Ollama': { stdout: '4444\n' },
        '/usr/sbin/lsof -nP -a -p 4444 -iTCP -sTCP:LISTEN -Fn': {
          stdout: 'p4444\nn*:11434\n',
        },
      }),
    })

    expect(status).toMatchObject({
      running: true,
      process_id: 4444,
      process_endpoint: DEFAULT_ENDPOINT,
      suggested_endpoint: null,
    })
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
