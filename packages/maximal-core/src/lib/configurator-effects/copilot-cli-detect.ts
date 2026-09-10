import fs from "node:fs"
import path from "node:path"

export interface CopilotCliDetectOptions {
  pathDirs?: Array<string>
  platform?: NodeJS.Platform
}

function copilotBasenames(platform: NodeJS.Platform): Array<string> {
  if (platform === "win32") {
    return ["copilot.exe", "copilot.cmd", "copilot.ps1", "copilot"]
  }
  return ["copilot"]
}

function defaultPathDirs(): Array<string> {
  const raw = process.env.PATH ?? ""
  return raw.split(path.delimiter).filter((directory) => directory.length > 0)
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

/** Find a standalone GitHub Copilot CLI launcher without executing it. */
export function copilotCliInstalled(
  options: CopilotCliDetectOptions = {},
): boolean {
  const platform = options.platform ?? process.platform
  const pathDirs = options.pathDirs ?? defaultPathDirs()
  const basenames = copilotBasenames(platform)
  return pathDirs.some((directory) =>
    basenames.some((basename) => isFile(path.join(directory, basename))),
  )
}
