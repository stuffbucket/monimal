import os from "node:os"
import path from "node:path"

const USERDATA_3P_SUFFIX = "-3p"

/** Resolve Claude Desktop's third-party configuration directory. */
export function getClaude3pDir(
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local")
    return path.join(localAppData, `Claude${USERDATA_3P_SUFFIX}`)
  }
  return path.join(
    home,
    "Library",
    "Application Support",
    `Claude${USERDATA_3P_SUFFIX}`,
  )
}
