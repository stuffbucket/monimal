import { HTTPError } from "~/lib/errors/error"
import { runtimeConsole } from "~/lib/platform/runtime-console"

export const awaitApproval = async () => {
  const response = await runtimeConsole.prompt(`Accept incoming request?`, {
    type: "confirm",
  })

  if (!response)
    throw new HTTPError(
      "Request rejected",
      Response.json({ message: "Request rejected" }, { status: 403 }),
    )
}
