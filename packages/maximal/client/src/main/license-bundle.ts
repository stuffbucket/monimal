import { join } from 'node:path'

interface LicenseBundleLocation {
  appPath: string
  isPackaged: boolean
}

export function resolveLicenseBundlePath({
  appPath,
  isPackaged,
}: LicenseBundleLocation): string {
  return isPackaged
    ? join(appPath, 'THIRD-PARTY-LICENSES.txt')
    : join(appPath, '..', 'THIRD-PARTY-LICENSES.txt')
}