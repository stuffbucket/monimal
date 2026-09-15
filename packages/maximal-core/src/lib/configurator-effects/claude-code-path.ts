import os from "node:os"
import path from "node:path"

import { assertIsolatedTestPath } from "~/lib/platform/test-isolation"

/** Resolve Claude Code's user settings without reading or writing the target. */
export function getClaudeCodeSettingsPath(): string {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim()
  assertIsolatedTestPath(override, "CLAUDE_CONFIG_DIR")
  const configDirectory = override || path.join(os.homedir(), ".claude")
  return path.join(configDirectory, "settings.json")
}
