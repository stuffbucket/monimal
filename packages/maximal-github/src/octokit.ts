import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit as RestOctokit } from "@octokit/rest";

import type {
  GitHubClient,
  GitHubCredentialProvider,
  GitHubFailure,
  GitHubHostProfile,
  GitHubLogger,
  GitHubRepository,
  GitHubViewer,
} from "./contracts.js";

const Octokit = RestOctokit.plugin(retry, throttling);

const noOpLogger: GitHubLogger = {
  debug: () => undefined,
  warn: () => undefined,
};

export interface CreateOctokitGitHubClientOptions {
  accountId: string;
  credentialProvider: GitHubCredentialProvider;
  host: GitHubHostProfile;
  userAgent: string;
  fetch?: typeof globalThis.fetch;
  logger?: GitHubLogger;
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  response?: {
    headers?: Record<string, string | undefined>;
  };
}

function header(error: ErrorLike, name: string): string | undefined {
  const headers = error.response?.headers;
  if (!headers) return undefined;
  return headers[name] ?? headers[name.toLowerCase()];
}

function numberHeader(error: ErrorLike, name: string): number | undefined {
  const value = header(error, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeGitHubError(error: unknown): GitHubFailure {
  const candidate =
    typeof error === "object" && error !== null ? (error as ErrorLike) : {};
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;
  const message =
    typeof candidate.message === "string"
      ? candidate.message
      : "GitHub request failed";
  const requestId = header(candidate, "x-github-request-id");

  if (candidate.name === "AbortError") {
    return { code: "cancelled", message, retryable: false };
  }
  if (status === 401) {
    return {
      code: "unauthenticated",
      message,
      retryable: false,
      status,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (status === 403) {
    const sso = header(candidate, "x-github-sso");
    if (sso) {
      const ssoUrl = /url=([^;,\s]+)/u.exec(sso)?.[1];
      return {
        code: "sso_required",
        message,
        retryable: false,
        status,
        ...(requestId ? { requestId } : {}),
        ...(ssoUrl ? { ssoUrl } : {}),
      };
    }
    const retryAfterSeconds = numberHeader(candidate, "retry-after");
    const remaining = numberHeader(candidate, "x-ratelimit-remaining");
    if (retryAfterSeconds !== undefined || remaining === 0) {
      return {
        code:
          remaining === 0 ? "primary_rate_limited" : "secondary_rate_limited",
        message,
        retryable: true,
        status,
        ...(requestId ? { requestId } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      };
    }
    return {
      code: "permission_denied",
      message,
      retryable: false,
      status,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (status === 429) {
    const retryAfterSeconds = numberHeader(candidate, "retry-after");
    const remaining = numberHeader(candidate, "x-ratelimit-remaining");
    return {
      code:
        remaining === 0
          ? "primary_rate_limited"
          : "secondary_rate_limited",
      message,
      retryable: true,
      status,
      ...(requestId ? { requestId } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
  if (status === 404) {
    return {
      code: "not_found",
      message,
      retryable: false,
      status,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (status === 409) {
    return {
      code: "conflict",
      message,
      retryable: false,
      status,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (status === 422) {
    return {
      code: "validation",
      message,
      retryable: false,
      status,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (status === 451) {
    return {
      code: "policy_restricted",
      message,
      retryable: false,
      status,
      ...(requestId ? { requestId } : {}),
    };
  }
  return {
    code: "transport",
    message,
    retryable: status === undefined || status >= 500,
    ...(status !== undefined ? { status } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

export class GitHubRequestError extends Error {
  readonly failure: GitHubFailure;

  constructor(failure: GitHubFailure) {
    super(failure.message);
    this.name = "GitHubRequestError";
    this.failure = failure;
  }
}

function mapViewer(data: {
  node_id: string;
  id: number;
  login: string;
  avatar_url?: string | null;
  name?: string | null;
  email?: string | null;
  html_url: string;
  type: string;
  site_admin: boolean;
}): GitHubViewer {
  return {
    id: data.node_id,
    databaseId: data.id,
    login: data.login,
    ...(data.avatar_url ? { avatarUrl: data.avatar_url } : {}),
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.email ? { email: data.email } : {}),
    htmlUrl: data.html_url,
    type: data.type,
    siteAdmin: data.site_admin,
  };
}

function mapRepository(
  hostId: string,
  data: {
    node_id: string;
    id: number;
    owner: { login: string } | null;
    name: string;
    full_name: string;
    private: boolean;
    visibility?: string;
    archived: boolean;
    disabled: boolean;
    fork: boolean;
    default_branch: string;
    html_url: string;
    clone_url: string;
    ssh_url: string;
  },
): GitHubRepository {
  return {
    id: data.node_id,
    databaseId: data.id,
    hostId,
    owner: data.owner?.login ?? data.full_name.split("/")[0] ?? "",
    name: data.name,
    fullName: data.full_name,
    private: data.private,
    visibility: data.visibility ?? (data.private ? "private" : "public"),
    archived: data.archived,
    disabled: data.disabled,
    fork: data.fork,
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    sshUrl: data.ssh_url,
  };
}

export async function createOctokitGitHubClient(
  options: CreateOctokitGitHubClientOptions,
): Promise<GitHubClient> {
  const token = await options.credentialProvider.getToken(options.accountId);
  const logger = options.logger ?? noOpLogger;
  const octokit = new Octokit({
    auth: token,
    baseUrl: options.host.restBaseUrl,
    userAgent: options.userAgent,
    ...(options.fetch ? { request: { fetch: options.fetch } } : {}),
    retry: {
      doNotRetry: [400, 401, 403, 404, 409, 410, 422, 451],
    },
    throttle: {
      onRateLimit: (
        retryAfter: number,
        requestOptions: { method: string },
        _octokit: unknown,
        retryCount: number,
      ) => {
        logger.warn("GitHub primary rate limit reached", {
          method: requestOptions.method,
          retryAfter,
        })
        return (
          retryCount === 0 &&
          (requestOptions.method === "GET" || requestOptions.method === "HEAD")
        );
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        requestOptions: { method: string },
      ) => {
        logger.warn("GitHub secondary rate limit reached", {
          method: requestOptions.method,
          retryAfter,
        })
        return false;
      },
    },
  });

  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GitHubRequestError) throw error;
      const failure = normalizeGitHubError(error);
      if (failure.code === "unauthenticated") {
        await options.credentialProvider.invalidate(options.accountId, failure);
      }
      throw new GitHubRequestError(failure);
    }
  };

  return {
    getViewer: (signal) =>
      run(async () => {
        const response = await octokit.rest.users.getAuthenticated({
          headers: {
            "x-github-api-version": options.host.restApiVersion,
          },
          ...(signal ? { request: { signal } } : {}),
        });
        logger.debug("Loaded authenticated GitHub user", {
          accountId: options.accountId,
          hostId: options.host.id,
        });
        return mapViewer(response.data);
      }),
    getRepository: (repository, signal) =>
      run(async () => {
        if (repository.hostId !== options.host.id) {
          throw new GitHubRequestError({
            code: "unsupported_by_host",
            message: `Repository host ${repository.hostId} does not match client host ${options.host.id}`,
            retryable: false,
          });
        }
        const response = await octokit.rest.repos.get({
          owner: repository.owner,
          repo: repository.name,
          headers: {
            "x-github-api-version": options.host.restApiVersion,
          },
          ...(signal ? { request: { signal } } : {}),
        });
        return mapRepository(options.host.id, response.data);
      }),
  };
}
