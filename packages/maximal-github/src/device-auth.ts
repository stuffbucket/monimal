import { z } from "zod";

export const GitHubDeviceCodeResponseSchema = z
  .object({
    device_code: z.string(),
    user_code: z.string(),
    verification_uri: z.string(),
    verification_uri_complete: z.string().optional(),
    expires_in: z.number().nonnegative().catch(900),
    interval: z.number().nonnegative().catch(5),
  })
  .loose();

export type GitHubDeviceCodeResponse = z.infer<
  typeof GitHubDeviceCodeResponseSchema
>;

export interface GitHubDeviceCodeRequestInit {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  errorMessage: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface GitHubJsonValidator<T> {
  parse(input: unknown): T;
}

export type GitHubJsonRequester = <T>(
  url: string,
  init: GitHubDeviceCodeRequestInit,
  validator: GitHubJsonValidator<T>,
) => Promise<T>;

export interface RequestGitHubDeviceCodeOptions {
  oauthBaseUrl: string;
  clientId: string;
  scope: string;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  requestJson: GitHubJsonRequester;
}

export function requestGitHubDeviceCode(
  options: RequestGitHubDeviceCodeOptions,
): Promise<GitHubDeviceCodeResponse> {
  const url = new URL("/login/device/code", options.oauthBaseUrl).href;
  const init: GitHubDeviceCodeRequestInit = {
    method: "POST",
    headers: { ...options.headers },
    body: JSON.stringify({
      client_id: options.clientId,
      scope: options.scope,
    }),
    errorMessage: "Failed to get device code",
  };

  if (options.signal !== undefined) init.signal = options.signal;
  if (options.timeoutMs !== undefined) init.timeoutMs = options.timeoutMs;

  return options.requestJson(url, init, GitHubDeviceCodeResponseSchema);
}
