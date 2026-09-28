import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app } from 'electron'

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
  const preferences = await readUserPreferences()
  await writeFile(
    preferencePath(),
    `${JSON.stringify({ ...preferences, ...patch }, undefined, 2)}\n`,
  )
}