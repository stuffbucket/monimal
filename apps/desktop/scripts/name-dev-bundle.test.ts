import { describe, expect, it } from 'vitest'

import { executablePath, renameBundle } from './name-dev-bundle.mjs'

/**
 * The one part of naming the development bundle that a filesystem cannot show
 * you is wrong.
 *
 * The name lives in two `<key>`/`<string>` pairs in a plist that holds a dozen
 * others, several of whose values are also the word "Electron", and one of
 * which is `CFBundleIdentifier` — the key that decides where preferences and
 * TCC grants live. A pattern that matched loosely would rewrite a neighbour,
 * and the app would still start.
 *
 * Both name keys are covered here because getting one and not the other is a
 * failure that looks like success: the menu bar reads `CFBundleName` and the
 * Finder reads `CFBundleDisplayName`, so a half-named bundle is correct
 * wherever you happen to look first. That is exactly the state this file did
 * not catch the first time.
 *
 * Neither key names the Dock tile — that is the bundle directory's job, and
 * `executablePath` below is the part of this file that carries it.
 */

const plist = (name: string, displayName = name) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>Electron</string>
	<key>CFBundleIdentifier</key>
	<string>com.github.Electron</string>
	<key>CFBundleName</key>
	<string>${name}</string>
	<key>CFBundleDisplayName</key>
	<string>${displayName}</string>
</dict>
</plist>
`

/** The stock plist as shipped, minus the key macOS only sometimes carries. */
const withoutDisplayName = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>com.github.Electron</string>
	<key>CFBundleName</key>
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
   * The Finder's key. macOS prefers it over `CFBundleName` wherever both exist,
   * so a run that renamed only the other one left the bundle named in one place
   * and not the next.
   */
  it('renames CFBundleDisplayName too', () => {
    const { plist: after } = renameBundle(plist('Electron'), 'Maximal')
    expect(after).toContain('<key>CFBundleDisplayName</key>\n\t<string>Maximal</string>')
    expect(after).not.toContain('<string>Electron</string>\n</dict>')
  })

  /*
   * The failure the pattern exists to prevent. Replacing the word "Electron"
   * would move the bundle identifier, and macOS keys the app's storage and
   * permissions on it: the app starts, and starts from nothing.
   *
   * `CFBundleExecutable` is on the same list for a different reason: it names
   * a file inside the bundle, and renaming the key alone stops the launch.
   */
  it('leaves every other key alone', () => {
    const { plist: after } = renameBundle(plist('Electron'), 'Maximal')
    expect(after).toContain('<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>')
    expect(after).toContain('<key>CFBundleExecutable</key>\n\t<string>Electron</string>')
  })

  it('reports no change when both names are already right', () => {
    const result = renameBundle(plist('Maximal'), 'Maximal')
    expect(result.changed).toBe(false)
    expect(result.was).toBe('Maximal')
  })

  /*
   * The state a copy made by the version that only knew one key is left in.
   * It has to count as a change, or the marker rebuild would produce a bundle
   * that is still half named.
   */
  it('finishes a bundle that was only half renamed', () => {
    const result = renameBundle(plist('Maximal', 'Electron'), 'Maximal')
    expect(result.changed).toBe(true)
    expect(result.plist).toContain('<key>CFBundleDisplayName</key>\n\t<string>Maximal</string>')
  })

  /* A key the plist does not carry is not a key that failed to rename. */
  it('renames what is there when a name key is absent', () => {
    const result = renameBundle(withoutDisplayName, 'Maximal')
    expect(result.changed).toBe(true)
    expect(result.was).toBe('Electron')
    expect(result.plist).toContain('<key>CFBundleName</key>\n\t<string>Maximal</string>')
    expect(result.plist).not.toContain('CFBundleDisplayName')
  })

  /*
   * `was` distinguishes the two no-change answers, and the caller acts on the
   * difference: a bundle already named is used, a plist with no such key is
   * abandoned for the stock one. The anchor key is the one that decides.
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
    expect(result.plist).toContain('<key>CFBundleDisplayName</key>\n\t<string>Electron</string>')
  })
})

/*
 * The Dock reads a tile's name off the bundle DIRECTORY, not off any key in the
 * plist above — measured, and written up in `name-dev-bundle.mjs`. So the
 * directory component of this path is load-bearing product copy, and getting it
 * wrong fails silently: Forge falls back to the stock bundle, which starts
 * perfectly well under the wrong name.
 */
describe('executablePath', () => {
  it('runs the binary out of a bundle directory carrying the product name', () => {
    expect(executablePath('/tmp/dist')).toBe('/tmp/dist/Maximal.app/Contents/MacOS/Electron')
  })

  /* `CFBundleExecutable` still says "Electron", and it names a real file. */
  it('leaves the executable inside the bundle stock-named', () => {
    expect(executablePath('/tmp/dist').endsWith('/Electron')).toBe(true)
  })
})
