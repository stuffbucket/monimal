import type { ProviderDispatch } from "@maximal/maximal-model-contract"

export interface SystemOneHttpProviderConfig {
  readonly apiKey: string
  readonly authType: "authorization" | "x-api-key"
  readonly baseUrl: string
}

export type SystemOneHttpProviderFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>

const jsonHeaders = { "content-type": "application/json" }

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}${path}`
}

function authorizedHeaders(
  config: SystemOneHttpProviderConfig,
  source?: Headers,
): Headers {
  const headers = new Headers(source)
  headers.delete("authorization")
  headers.delete("x-api-key")
  if (config.authType === "authorization") {
    headers.set("authorization", `Bearer ${config.apiKey}`)
  } else {
    headers.set("x-api-key", config.apiKey)
  }
  return headers
}

async function modelsResponse(
  config: SystemOneHttpProviderConfig,
  signal: AbortSignal,
  fetchImplementation: SystemOneHttpProviderFetch,
): Promise<Response> {
  const response = await fetchImplementation(
    endpoint(config.baseUrl, "/v1/models"),
    {
      headers: authorizedHeaders(config),
      signal,
    },
  )
  if (!response.ok) return response

  const payload: unknown = await response.json()
  if (
    payload === null
    || typeof payload !== "object"
    || !Array.isArray((payload as { readonly models?: unknown }).models)
  ) {
    return Response.json(
      {
        type: "error",
        error: {
          type: "api_error",
          message: "The System One provider returned an invalid model catalog.",
        },
      },
      { status: 502 },
    )
  }
  const data = (
    payload as { readonly models: ReadonlyArray<unknown> }
  ).models.flatMap((value) => {
    if (
      value === null
      || typeof value !== "object"
      || typeof (value as { readonly name?: unknown }).name !== "string"
    ) {
      return []
    }
    const name = (value as { readonly name: string }).name
    return [{ id: name, display_name: name, type: "model" }]
  })
  return Response.json({ data, has_more: false }, { headers: jsonHeaders })
}

async function inferenceResponse(
  config: SystemOneHttpProviderConfig,
  dispatch: ProviderDispatch,
  fetchImplementation: SystemOneHttpProviderFetch,
): Promise<Response> {
  const headers = new Headers({
    accept: dispatch.request.headers.get("accept") ?? "application/json",
    "content-type": "application/json",
  })
  return await fetchImplementation(endpoint(config.baseUrl, "/v1/systemone"), {
    method: "POST",
    headers: authorizedHeaders(config, headers),
    body: await dispatch.request.clone().text(),
    signal: dispatch.signal,
  })
}

export function dispatchSystemOneHttpProvider(
  config: SystemOneHttpProviderConfig,
  dispatch: ProviderDispatch,
  fetchImplementation: SystemOneHttpProviderFetch = fetch,
): Promise<Response> {
  if (dispatch.operation === "models") {
    return modelsResponse(config, dispatch.signal, fetchImplementation)
  }
  if (dispatch.operation === "systemone") {
    return inferenceResponse(config, dispatch, fetchImplementation)
  }
  return Promise.resolve(
    Response.json(
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: `The ${dispatch.operation} operation is not supported by this System One provider.`,
        },
      },
      { status: 501 },
    ),
  )
}
