import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app } from 'electron'

let activeUpdate: Promise<void> | undefined

function preferencePath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

export async function readUserPreferences(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(preferencePath(), 'utf8'))
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export async function updateUserPreferences(
  patch: Record<string, unknown>,
): Promise<void> {
  const write = async (): Promise<void> => {
    const preferences = await readUserPreferences()
    await writeFile(
      preferencePath(),
      `${JSON.stringify({ ...preferences, ...patch }, undefined, 2)}\n`,
    )
  }
  const update = activeUpdate
    ? activeUpdate.then(write, write)
    : write()
  activeUpdate = update
  try {
    await update
  } finally {
    if (activeUpdate === update) activeUpdate = undefined
  }
}