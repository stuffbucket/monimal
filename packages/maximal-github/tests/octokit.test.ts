import { describe, expect, test, vi } from "vitest";

import type {
  GitHubCredentialProvider,
  GitHubFailure,
} from "../src/contracts.js";
import { createGitHubHostProfile } from "../src/index.js";
import {
  createOctokitGitHubClient,
  GitHubRequestError,
  normalizeGitHubError,
} from "../src/octokit.js";

function credentialProvider(): GitHubCredentialProvider {
  return {
    getToken: () => Promise.resolve("gho_test"),
    invalidate: () => undefined,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Octokit GitHub client", () => {
  test("loads and maps the authenticated viewer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        jsonResponse({
          node_id: "U_node",
          id: 42,
          login: "managed_corp",
          avatar_url: "https://avatars.example/u/42",
          name: "Managed User",
          email: null,
          html_url: "https://github.com/managed_corp",
          type: "User",
          site_admin: false,
        }),
      ),
    );
    const client = await createOctokitGitHubClient({
      accountId: "account-1",
      credentialProvider: credentialProvider(),
      host: createGitHubHostProfile({ kind: "github-cloud" }),
      userAgent: "maximal-test/0.0.0",
      fetch,
    });

    await expect(client.getViewer()).resolves.toEqual({
      id: "U_node",
      databaseId: 42,
      login: "managed_corp",
      avatarUrl: "https://avatars.example/u/42",
      displayName: "Managed User",
      htmlUrl: "https://github.com/managed_corp",
      type: "User",
      siteAdmin: false,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[0];
    const requestUrl =
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.href
          : request?.url;
    expect(requestUrl).toBe("https://api.github.com/user");
  });

  test("does not send a repository request through the wrong host client", async () => {
    const client = await createOctokitGitHubClient({
      accountId: "account-1",
      credentialProvider: credentialProvider(),
      host: createGitHubHostProfile({ kind: "github-cloud" }),
      userAgent: "maximal-test/0.0.0",
      fetch: vi.fn<typeof globalThis.fetch>(),
    });

    await expect(
      client.getRepository({
        hostId: "github.corp.example",
        owner: "octo",
        name: "repo",
      }),
    ).rejects.toMatchObject({
      failure: { code: "unsupported_by_host" },
    });
  });
});

describe("normalizeGitHubError", () => {
  test("separates SSO and primary rate-limit failures", () => {
    expect(
      normalizeGitHubError({
        status: 403,
        message: "SSO required",
        response: {
          headers: {
            "x-github-sso": "required; url=https://github.com/orgs/acme/sso",
          },
        },
      }),
    ).toMatchObject({
      code: "sso_required",
      ssoUrl: "https://github.com/orgs/acme/sso",
    });

    expect(
      normalizeGitHubError({
        status: 403,
        message: "rate limited",
        response: {
          headers: {
            "x-ratelimit-remaining": "0",
            "retry-after": "60",
          },
        },
      }),
    ).toMatchObject({
      code: "primary_rate_limited",
      retryAfterSeconds: 60,
    });
  });

  test("separates secondary limits and policy restrictions", () => {
    expect(
      normalizeGitHubError({
        status: 429,
        message: "slow down",
        response: { headers: { "retry-after": "30" } },
      }),
    ).toMatchObject({
      code: "secondary_rate_limited",
      retryAfterSeconds: 30,
    })

    expect(
      normalizeGitHubError({
        status: 451,
        message: "blocked by policy",
      }),
    ).toMatchObject({
      code: "policy_restricted",
      retryable: false,
    })
  })

  test("exposes normalized failures through GitHubRequestError", () => {
    const failure: GitHubFailure = {
      code: "policy_restricted",
      message: "Enterprise policy denied this operation",
      retryable: false,
    };
    expect(new GitHubRequestError(failure)).toMatchObject({ failure });
  });
});
