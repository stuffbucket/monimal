interface RuntimeSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false }
}

interface CacheEnvelope {
  schemaVersion: 1
  savedAt: string
  value: unknown
}

const CACHE_PREFIX = 'maximal.settings-cache.'

function storageKey(key: string): string {
  return `${CACHE_PREFIX}${key}`
}

function storage(): Storage {
  if (globalThis.localStorage === undefined) {
    throw new Error('Persistent settings storage is unavailable.')
  }
  return globalThis.localStorage
}

export function readSettingsCache<T>(
  key: string,
  schema: RuntimeSchema<T>,
): T | null {
  const store = storage()
  const raw = store.getItem(storageKey(key))
  if (raw === null) return null

  let envelope: unknown
  try {
    envelope = JSON.parse(raw)
  } catch {
    store.removeItem(storageKey(key))
    throw new Error(`The cached settings value for ${key} was invalid and was cleared.`)
  }

  if (
    typeof envelope !== 'object'
    || envelope === null
    || !('schemaVersion' in envelope)
    || envelope.schemaVersion !== 1
    || !('value' in envelope)
  ) {
    store.removeItem(storageKey(key))
    throw new Error(`The cached settings value for ${key} was outdated and was cleared.`)
  }

  const parsed = schema.safeParse((envelope as CacheEnvelope).value)
  if (!parsed.success) {
    store.removeItem(storageKey(key))
    throw new Error(`The cached settings value for ${key} was invalid and was cleared.`)
  }
  return parsed.data
}

export function writeSettingsCache(
  key: string,
  value: unknown,
): void {
  const envelope: CacheEnvelope = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    value,
  }
  storage().setItem(storageKey(key), JSON.stringify(envelope))
}
