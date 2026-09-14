export async function readRequestedModel(
  request: Request,
): Promise<string | undefined> {
  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return undefined
  }
  if (
    typeof body !== "object"
    || body === null
    || !("model" in body)
    || typeof body.model !== "string"
  ) {
    return undefined
  }
  return body.model
}
