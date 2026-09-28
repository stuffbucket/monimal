import { describe, expect, it } from 'vitest'

import { resolveLicenseBundlePath } from './license-bundle.js'

describe('resolveLicenseBundlePath', () => {
  it('finds the generated source artifact during development', () => {
    expect(resolveLicenseBundlePath({
      appPath: '/repo/apps/desktop',
      isPackaged: false,
    })).toBe('/repo/apps/desktop/THIRD-PARTY-LICENSES.txt')
  })

  it('reads the final-build bundle from inside app.asar when packaged', () => {
    expect(resolveLicenseBundlePath({
      appPath: '/Applications/Maximal.app/Contents/Resources/app.asar',
      isPackaged: true,
    })).toBe('/Applications/Maximal.app/Contents/Resources/app.asar/THIRD-PARTY-LICENSES.txt')
  })
})