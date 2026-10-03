import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface ShortcutRegistration {
  id: string
  pid: number
  startedAt: number
}

interface GlobalShortcutOwnerOptions {
  directory?: string
  registration?: ShortcutRegistration
  processIsAlive?: (pid: number) => boolean
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ESRCH') return false
    if (isNodeError(error) && error.code === 'EPERM') return true
    throw error
  }
}

function parseRegistration(serialized: string): ShortcutRegistration | undefined {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    return undefined
  }
  if (
    typeof value !== 'object'
    || value === null
  ) {
    return undefined
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.pid !== 'number'
    || !Number.isSafeInteger(candidate.pid)
    || candidate.pid <= 0
    || typeof candidate.startedAt !== 'number'
    || !Number.isFinite(candidate.startedAt)
  ) return undefined
  return {
    id: candidate.id,
    pid: candidate.pid,
    startedAt: candidate.startedAt,
  }
}

export class GlobalShortcutOwner {
  private readonly directory: string
  private readonly registration: ShortcutRegistration
  private readonly processIsAlive: (pid: number) => boolean
  private registrationPath: string | undefined

  constructor(options: GlobalShortcutOwnerOptions = {}) {
    this.directory = options.directory
      ?? join(tmpdir(), 'maximal-global-shortcut-v1')
    this.registration = options.registration ?? {
      id: randomUUID(),
      pid: process.pid,
      startedAt: Date.now(),
    }
    this.processIsAlive = options.processIsAlive ?? processIsAlive
  }

  start(): void {
    if (this.registrationPath) return
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const registrationPath = join(
      this.directory,
      `${String(this.registration.pid)}-${this.registration.id}.json`,
    )
    writeFileSync(
      registrationPath,
      JSON.stringify(this.registration),
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    )
    this.registrationPath = registrationPath
  }

  isOwner(): boolean {
    if (!this.registrationPath) return false
    const registrations: ShortcutRegistration[] = []
    for (const entry of readdirSync(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const path = join(this.directory, entry.name)
      let registration: ShortcutRegistration | undefined
      try {
        registration = parseRegistration(readFileSync(path, 'utf8'))
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') continue
        throw error
      }
      if (!registration || !this.processIsAlive(registration.pid)) {
        rmSync(path, { force: true })
        continue
      }
      registrations.push(registration)
    }
    registrations.sort((left, right) =>
      right.startedAt - left.startedAt || right.id.localeCompare(left.id))
    return registrations[0]?.id === this.registration.id
  }

  stop(): void {
    if (!this.registrationPath) return
    rmSync(this.registrationPath, { force: true })
    this.registrationPath = undefined
  }
}
