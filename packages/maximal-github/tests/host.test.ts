import { describe, expect, test } from "vitest";

import { createGitHubHostProfile } from "../src/index.js";

describe("createGitHubHostProfile", () => {
  test("builds GitHub.com endpoints", () => {
    expect(createGitHubHostProfile({ kind: "github-cloud" })).toEqual({
      id: "github.com",
      kind: "github-cloud",
      hostname: "github.com",
      webBaseUrl: "https://github.com",
      restBaseUrl: "https://api.github.com",
      graphqlUrl: "https://api.github.com/graphql",
      oauthBaseUrl: "https://github.com",
      restApiVersion: "2022-11-28",
    });
  });

  test("builds GHE.com data-residency endpoints", () => {
    expect(
      createGitHubHostProfile({
        kind: "github-cloud-data-residency",
        hostname: "octocorp.ghe.com",
      }),
    ).toMatchObject({
      id: "octocorp.ghe.com",
      restBaseUrl: "https://api.octocorp.ghe.com",
      graphqlUrl: "https://api.octocorp.ghe.com/graphql",
    });
  });

  test("builds GHES endpoints without guessing from the hostname", () => {
    expect(
      createGitHubHostProfile({
        kind: "github-enterprise-server",
        hostname: "github.corp.example",
      }),
    ).toMatchObject({
      id: "github.corp.example",
      restBaseUrl: "https://github.corp.example/api/v3",
      graphqlUrl: "https://github.corp.example/api/graphql",
    });
  });

  test("rejects URLs where a bare hostname is required", () => {
    expect(() =>
      createGitHubHostProfile({
        kind: "github-enterprise-server",
        hostname: "https://github.example/api/v3",
      }),
    ).toThrow("bare DNS hostname");
  });
});
