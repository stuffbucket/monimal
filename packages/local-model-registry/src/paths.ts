import { homedir, platform as hostPlatform } from "node:os"
import path, { posix, win32 } from "node:path"

export interface StuffbucketPathOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly homeDirectory?: string
  readonly platform?: NodeJS.Platform
  readonly suiteDataRoot?: string
}

function platformPath(platform: NodeJS.Platform): typeof path {
  return platform === "win32" ? win32 : posix
}

function requiredHome(
  options: StuffbucketPathOptions,
  platform: NodeJS.Platform,
): string {
  const home =
    options.homeDirectory
    ?? (platform === "win32" ? options.env?.USERPROFILE : options.env?.HOME)
    ?? homedir()
  if (!platformPath(platform).isAbsolute(home))
    throw new TypeError("The home directory must be absolute.")
  return home
}

/** Resolve the suite data root consistently outside any desktop runtime. */
export function resolveStuffbucketDataRoot(
  options: StuffbucketPathOptions = {},
): string {
  const platform = options.platform ?? hostPlatform()
  const paths = platformPath(platform)
  if (options.suiteDataRoot !== undefined) {
    if (!paths.isAbsolute(options.suiteDataRoot))
      throw new TypeError("suiteDataRoot must be an absolute path.")
    return paths.normalize(options.suiteDataRoot)
  }

  const env = options.env ?? process.env
  const home = requiredHome({ ...options, env }, platform)
  if (platform === "darwin")
    return paths.join(home, "Library", "Application Support", "stuffbucket")
  if (platform === "win32") {
    const local = env.LOCALAPPDATA
    if (local !== undefined && paths.isAbsolute(local))
      return paths.join(local, "stuffbucket")
    return paths.join(home, "AppData", "Local", "stuffbucket")
  }

  const xdg = env.XDG_DATA_HOME
  const base =
    xdg !== undefined && paths.isAbsolute(xdg) ?
      xdg
    : paths.join(home, ".local", "share")
  return paths.join(base, "stuffbucket")
}

/** Resolve the directory containing all registry-managed model artifacts. */
export function resolveLocalModelsPath(
  options: StuffbucketPathOptions = {},
): string {
  const platform = options.platform ?? hostPlatform()
  return platformPath(platform).join(
    resolveStuffbucketDataRoot({ ...options, platform }),
    "models",
  )
}
