import { createHash } from 'node:crypto'
import { join } from 'node:path'

const PROFILE_NAME = /^[a-zA-Z0-9._-]{1,64}$/u

export function developmentUserDataPath(
  baseUserData: string,
  appPath: string,
  profileOverride: string | undefined,
): string {
  const override = profileOverride?.trim()
  if (override) {
    if (!PROFILE_NAME.test(override)) {
      throw new Error('MAXIMAL_DEV_PROFILE must contain only letters, numbers, ".", "_", or "-".')
    }
    return `${baseUserData}-${override}`
  }
  const checkoutId = createHash('sha256').update(appPath).digest('hex').slice(0, 8)
  return `${baseUserData}-${checkoutId}`
}

export function developmentCredentialHome(appData: string): string {
  return join(appData, 'Maximal-development-credentials')
}
