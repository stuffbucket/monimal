import type { z } from "zod"

import { resolveSettingsEnvironment as resolveEnvironment } from "@stuffbucket/maximal-settings"

export function resolveSettingsEnvironment<Settings>(
  schema: z.ZodType<Settings>,
  stored: Settings,
  environment: Readonly<Record<string, string | undefined>>,
): Settings {
  return resolveEnvironment(schema, stored, {
    values: environment,
    prefix: "MAXIMAL",
  })
}
