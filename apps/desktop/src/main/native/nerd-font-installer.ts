import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { get } from 'node:https'

import {
  NERD_FONT_ASSETS,
  nerdFontDownloadUrl,
  type NerdFontAsset,
} from './nerd-font-catalog.js'

const MAX_REDIRECTS = 5
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

interface InstallerDependencies {
  platform: NodeJS.Platform
  home: string
  download(
    url: string,
    destination: string,
    expectedSize: number,
    expectedSha256: string,
  ): Promise<void>
  extract(archive: string, destination: string): Promise<void>
}

function downloadVerifiedArchive(
  url: string,
  destination: string,
  expectedSize: number,
  expectedSha256: string,
  redirects = 0,
): Promise<void> {
  const parsed = new URL(url)
  if (
    parsed.protocol !== 'https:'
    || !ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)
  ) {
    return Promise.reject(new Error('The font download redirected to an untrusted host.'))
  }
  if (redirects > MAX_REDIRECTS) {
    return Promise.reject(new Error('The font download exceeded the redirect limit.'))
  }

  return new Promise((resolve, reject) => {
    const request = get(parsed, (response) => {
      const location = response.headers.location
      if (
        response.statusCode !== undefined
        && response.statusCode >= 300
        && response.statusCode < 400
        && location !== undefined
      ) {
        response.resume()
        void downloadVerifiedArchive(
          new URL(location, parsed).toString(),
          destination,
          expectedSize,
          expectedSha256,
          redirects + 1,
        ).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`The font download failed with HTTP ${String(response.statusCode)}.`))
        return
      }
      const advertisedSize = Number(response.headers['content-length'])
      if (Number.isFinite(advertisedSize) && advertisedSize > expectedSize) {
        response.resume()
        reject(new Error('The font download exceeded its reviewed size.'))
        return
      }

      void open(destination, 'wx').then(async (file) => {
        const hash = createHash('sha256')
        let received = 0
        try {
          for await (const chunk of response) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            received += buffer.length
            if (received > expectedSize) {
              response.destroy()
              throw new Error('The font download exceeded its reviewed size.')
            }
            hash.update(buffer)
            await file.write(buffer)
          }
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('The font download failed.', { cause: error }),
          )
          return
        } finally {
          await file.close()
        }
        if (received !== expectedSize) {
          reject(new Error('The font download size did not match the reviewed asset.'))
          return
        }
        if (hash.digest('hex') !== expectedSha256) {
          reject(new Error('The font download failed its SHA-256 integrity check.'))
          return
        }
        resolve()
      }, reject)
    })
    request.on('error', reject)
  })
}

function extractZip(archive: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-x', '-k', archive, destination], (error) => {
      if (error) reject(new Error('The verified font archive could not be extracted.', { cause: error }))
      else resolve()
    })
  })
}

const defaults: InstallerDependencies = {
  platform: process.platform,
  home: homedir(),
  download: downloadVerifiedArchive,
  extract: extractZip,
}

async function monospacedFontFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await monospacedFontFiles(path))
    else if (entry.isSymbolicLink()) {
      throw new Error('The verified archive contained an unsupported symbolic link.')
    }
    else if (
      entry.isFile()
      && /NerdFontMono[^/]*\.(?:otf|ttf)$/iu.test(entry.name)
    ) {
      files.push(path)
    }
  }
  return files
}

async function requireRealDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const metadata = await lstat(directory)
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('The user font directory is not a regular directory.')
  }
}

async function installFiles(files: readonly string[], destination: string): Promise<void> {
  if (files.length === 0) {
    throw new Error('The verified archive contained no monospaced Nerd Font faces.')
  }
  await requireRealDirectory(destination)
  for (const source of files) {
    const target = join(destination, basename(source))
    const temporary = `${target}.maximal-${randomUUID()}`
    try {
      await copyFile(source, temporary)
      await rename(temporary, target)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}

export async function installNerdFont(
  fontId: string,
  overrides: Partial<InstallerDependencies> = {},
): Promise<NerdFontAsset> {
  const dependencies = { ...defaults, ...overrides }
  if (dependencies.platform !== 'darwin') {
    throw new Error('In-app Nerd Font installation is currently available on macOS.')
  }
  const asset = NERD_FONT_ASSETS.find(({ id }) => id === fontId)
  if (asset === undefined) throw new Error('Unknown Nerd Font selection.')

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'maximal-nerd-font-'))
  const archive = join(temporaryDirectory, asset.archiveName)
  const extracted = join(temporaryDirectory, 'extracted')
  await mkdir(extracted)
  try {
    await dependencies.download(
      nerdFontDownloadUrl(asset),
      archive,
      asset.downloadSize,
      asset.sha256,
    )
    await dependencies.extract(archive, extracted)
    await installFiles(
      await monospacedFontFiles(extracted),
      join(dependencies.home, 'Library', 'Fonts'),
    )
    return asset
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
