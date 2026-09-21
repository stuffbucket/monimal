import path from "node:path"

import { detectClaudeInstalls } from "~/lib/configurator-effects/claude-code-detect"
import { claudeAppInstalled } from "~/lib/configurator-effects/claude-desktop-detect"
import { copilotCliInstalled } from "~/lib/configurator-effects/copilot-cli-detect"

const detector = process.argv[2]
const platform = process.env.MAXIMAL_CONFIGURATOR_TEST_PLATFORM as
  NodeJS.Platform | undefined
const systemRoot = process.env.MAXIMAL_CONFIGURATOR_TEST_SYSTEM_ROOT

let result: unknown
switch (detector) {
  case "claude-code": {
    result = detectClaudeInstalls({
      ...(platform === undefined ? {} : { platform }),
      ...(systemRoot === undefined ?
        {}
      : {
          homebrewDirs: [
            path.join(systemRoot, "opt", "homebrew", "bin"),
            path.join(systemRoot, "usr", "local", "bin"),
          ],
        }),
    })
    break
  }
  case "claude-desktop": {
    result = claudeAppInstalled({
      ...(platform === undefined ? {} : { platform }),
      ...(systemRoot === undefined ?
        {}
      : {
          darwinAppPath: path.join(systemRoot, "Applications", "Claude.app"),
        }),
    })
    break
  }
  case "copilot-cli": {
    result = copilotCliInstalled(platform === undefined ? {} : { platform })
    break
  }
  default: {
    throw new Error(`Unknown configurator detector: ${detector}`)
  }
}

process.stdout.write(`${JSON.stringify(result)}\n`)
