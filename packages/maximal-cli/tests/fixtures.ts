import * as z from "zod/v4"

import type {
  CommandDefinition,
  CommandSchema,
  JsonObject,
} from "../src/index.ts"

function schema<Input extends JsonObject>(
  value: z.ZodType<Input>,
): CommandSchema<unknown, Input> {
  return value
}

export const echoInputSchema = schema(
  z.object({
    message: z.string(),
  }),
)

export const echoOutputSchema = schema(
  z.object({
    echoed: z.string(),
  }),
)

export const echoCommand: CommandDefinition<
  { readonly message: string },
  { readonly echoed: string }
> = {
  name: "echo",
  title: "Echo",
  description: "Returns the supplied message.",
  inputSchema: echoInputSchema,
  outputSchema: echoOutputSchema,
  annotations: {
    readOnly: true,
    idempotent: true,
    destructive: false,
    openWorld: false,
  },
  execute(input) {
    return Promise.resolve({ echoed: input.message })
  },
}
