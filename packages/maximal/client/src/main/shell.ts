// The shell seam. The window comes from the shell package; this client injects
// its own preload, renderer and core origin, so the package stays
// maximal-agnostic. Confining that to one function keeps the swap to a fuller
// lifecycle entry point local.
import { createHostWindow, type HostWindowOptions } from 'stuffbucket-electron/host'

export type ShellOptions = HostWindowOptions

/**
 * Defaults `titleBarStyle` to `'hiddenInset'`.
 *
 * The shell draws its own in-page title bar and reserves room for the macOS
 * traffic lights, so it assumes the window has no native title bar. Electron's
 * default gives it one, which stacks two title bars and strands the reserved
 * space. The default lives here so no call site has to repeat it; an explicit
 * `titleBarStyle` still wins, being spread after.
 */
export function runShell(options: HostWindowOptions): ReturnType<typeof createHostWindow> {
  return createHostWindow({ titleBarStyle: 'hiddenInset', ...options })
}
