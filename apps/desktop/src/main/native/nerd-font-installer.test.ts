import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { installNerdFont } from './nerd-font-installer'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'maximal-font-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  )
})

describe('Nerd Font installer', () => {
  it('installs only monospaced font faces into the macOS user font directory', async () => {
    const home = await temporaryDirectory()
    const download = vi.fn(async (
      _url: string,
      archive: string,
      expectedSize: number,
      expectedSha256: string,
    ) => {
      expect(expectedSize).toBe(32_279_622)
      expect(expectedSha256).toBe(
        '72258950f9338c41eb640db9d6f4117026b95c47afdf87a96baaf106b7904b41',
      )
      await writeFile(archive, 'verified archive')
    })
    const extract = vi.fn(async (_archive: string, destination: string) => {
      await mkdir(join(destination, 'nested'))
      await writeFile(
        join(destination, 'nested', 'IntelOneMonoNerdFontMono-Regular.ttf'),
        'mono',
      )
      await writeFile(
        join(destination, 'nested', 'IntelOneMonoNerdFontMono-Italic.otf'),
        'mono italic',
      )
      await writeFile(
        join(destination, 'IntelOneMonoNerdFont-Regular.ttf'),
        'proportional',
      )
      await writeFile(join(destination, 'README.md'), 'documentation')
    })

    await expect(installNerdFont('intel-one-mono', {
      platform: 'darwin',
      home,
      download,
      extract,
    })).resolves.toMatchObject({
      id: 'intel-one-mono',
      family: 'IntoneMono Nerd Font Mono',
    })

    await expect(readFile(
      join(home, 'Library', 'Fonts', 'IntelOneMonoNerdFontMono-Regular.ttf'),
      'utf8',
    )).resolves.toBe('mono')
    await expect(readFile(
      join(home, 'Library', 'Fonts', 'IntelOneMonoNerdFontMono-Italic.otf'),
      'utf8',
    )).resolves.toBe('mono italic')
    await expect(readFile(
      join(home, 'Library', 'Fonts', 'IntelOneMonoNerdFont-Regular.ttf'),
      'utf8',
    )).rejects.toThrow()
  })

  it('rejects unsupported hosts and unknown catalog identifiers', async () => {
    await expect(installNerdFont('intel-one-mono', {
      platform: 'linux',
    })).rejects.toThrow('currently available on macOS')
    await expect(installNerdFont('not-a-font', {
      platform: 'darwin',
    })).rejects.toThrow('Unknown Nerd Font selection')
  })

  it('fails when an archive contains no monospaced TTF faces', async () => {
    const home = await temporaryDirectory()
    await expect(installNerdFont('intel-one-mono', {
      platform: 'darwin',
      home,
      download: vi.fn(async (_url: string, archive: string) => {
        await writeFile(archive, 'verified archive')
      }),
      extract: vi.fn(async (_archive: string, destination: string) => {
        await writeFile(join(destination, 'README.md'), 'documentation')
      }),
    })).rejects.toThrow('contained no monospaced Nerd Font faces')
  })
})
