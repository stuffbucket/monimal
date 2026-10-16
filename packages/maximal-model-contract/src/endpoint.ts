/** A credential-free endpoint identity used by an execution target. */
export interface ModelEndpointReference {
  readonly id: string
  readonly url?: string
}

/** Rejects endpoint URLs that embed credentials. */
export function assertCredentialFreeEndpoint(
  endpoint: ModelEndpointReference,
): void {
  if (endpoint.url === undefined) return
  const url = new URL(endpoint.url)
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(
      `Execution target endpoint "${endpoint.id}" must not contain credentials.`,
    )
  }
}
