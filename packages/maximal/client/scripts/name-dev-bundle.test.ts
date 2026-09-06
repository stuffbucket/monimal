import { describe, expect, it } from 'vitest'

import { renameBundle } from './name-dev-bundle.mjs'

/**
 * The one part of naming the development bundle that a filesystem cannot show
 * you is wrong.
 *
 * `CFBundleName` is a `<key>`/`<string>` pair in a plist that holds a dozen
 * other pairs, several of whose values are also the word "Electron", and one
 * of which is `CFBundleIdentifier` — the key that decides where preferences
 * and TCC grants live. A pattern that matched loosely would rewrite a
 * neighbour, and the app would still start.
 */

const plist = (name: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>Electron</string>
	<key>CFBundleIdentifier</key>
	<string>com.github.Electron</string>
	<key>CFBundleName</key>
	<string>${name}</string>
	<key>CFBundleDisplayName</key>
	<string>Electron</string>
</dict>
</plist>
`

describe('renameBundle', () => {
  it('renames CFBundleName', () => {
    const result = renameBundle(plist('Electron'), 'Maximal')
    expect(result.changed).toBe(true)
    expect(result.was).toBe('Electron')
    expect(result.plist).toContain('<key>CFBundleName</key>\n\t<string>Maximal</string>')
  })

  /*
   * The failure the pattern exists to prevent. Replacing the word "Electron"
   * would move the bundle identifier, and macOS keys the app's storage and
   * permissions on it: the app starts, and starts from nothing.
   */
  it('leaves every other key alone', () => {
    const { plist: after } = renameBundle(plist('Electron'), 'Maximal')
    expect(after).toContain('<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>')
    expect(after).toContain('<key>CFBundleExecutable</key>\n\t<string>Electron</string>')
    expect(after).toContain('<key>CFBundleDisplayName</key>\n\t<string>Electron</string>')
  })

  it('reports no change when the name is already right', () => {
    const result = renameBundle(plist('Maximal'), 'Maximal')
    expect(result.changed).toBe(false)
    expect(result.was).toBe('Maximal')
  })

  /*
   * `was` distinguishes the two no-change answers, and the caller acts on the
   * difference: a bundle already named is used, a plist with no such key is
   * abandoned for the stock one.
   */
  it('reports no key rather than no change when the layout is unfamiliar', () => {
    const result = renameBundle('<plist><dict></dict></plist>', 'Maximal')
    expect(result.changed).toBe(false)
    expect(result.was).toBeUndefined()
  })

  it('renames back, so a shared bundle can be repaired', () => {
    const result = renameBundle(plist('Maximal'), 'Electron')
    expect(result.changed).toBe(true)
    expect(result.plist).toContain('<key>CFBundleName</key>\n\t<string>Electron</string>')
  })
})
