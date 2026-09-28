import { join } from 'node:path'

interface LicenseBundleLocation {
  appPath: string
  isPackaged: boolean
}

export function resolveLicenseBundlePath(location: LicenseBundleLocation): string {
  return join(location.appPath, 'THIRD-PARTY-LICENSES.txt')
}