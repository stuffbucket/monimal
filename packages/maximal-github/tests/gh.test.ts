import { describe, expect, test } from "vitest";

import {
  detectGhCli,
  getGhAccountToken,
  type GhRunner,
  isReadOnlyGhArgs,
} from "../src/gh.js";

function runner(
  responses: Readonly<Record<string, Partial<Awaited<ReturnType<GhRunner>>>>>,
): GhRunner {
  return (args) => {
    const response = responses[args.join(" ")] ?? {};
    return Promise.resolve({
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
      code: response.code ?? 0,
      notFound: response.notFound ?? false,
    });
  };
}

test("discovers multiple gh accounts across hosts", async () => {
  const status = await detectGhCli(
    runner({
      "--version": { stdout: "gh version 2.101.0 (2026-09-24)\n" },
      "auth status --json hosts": {
        stdout: JSON.stringify({
          hosts: {
            "github.com": [
              {
                state: "success",
                active: true,
                login: "personal",
                scopes: "repo, read:org",
              },
              {
                state: "success",
                active: false,
                login: "managed_corp",
                scopes: "repo",
              },
            ],
            "github.corp.example": [
              {
                state: "success",
                active: true,
                login: "enterprise",
                scopes: "repo",
              },
            ],
          },
        }),
      },
    }),
  );

  expect(status).toEqual({
    installed: true,
    version: "2.101.0",
    accounts: [
      {
        login: "personal",
        host: "github.com",
        active: true,
        scopes: ["repo", "read:org"],
      },
      {
        login: "managed_corp",
        host: "github.com",
        active: false,
        scopes: ["repo"],
      },
      {
        login: "enterprise",
        host: "github.corp.example",
        active: true,
        scopes: ["repo"],
      },
    ],
  });
});

describe("read-only gh boundary", () => {
  test("allows only version, status, and token reads", () => {
    expect(isReadOnlyGhArgs(["--version"])).toBe(true);
    expect(isReadOnlyGhArgs(["auth", "status", "--json", "hosts"])).toBe(true);
    expect(
      isReadOnlyGhArgs([
        "auth",
        "token",
        "--hostname",
        "github.com",
        "--user",
        "octocat",
      ]),
    ).toBe(true);
    expect(isReadOnlyGhArgs(["auth", "switch"])).toBe(false);
    expect(isReadOnlyGhArgs(["api", "user"])).toBe(false);
    expect(
      isReadOnlyGhArgs(["auth", "status", "--json", "hosts", "--show-token"]),
    ).toBe(false);
    expect(
      isReadOnlyGhArgs([
        "auth",
        "token",
        "--hostname",
        "--show-token",
        "--user",
        "octocat",
      ]),
    ).toBe(false);
  });

  test("reads a selected account token without changing gh state", async () => {
    const token = await getGhAccountToken(
      "managed_corp",
      "github.com",
      runner({
        "auth token --hostname github.com --user managed_corp": {
          stdout: "gho_secret\n",
        },
      }),
    );
    expect(token).toBe("gho_secret");
  });

  test("rejects account values that could be parsed as gh options", async () => {
    await expect(
      getGhAccountToken("--show-token", "github.com", runner({})),
    ).rejects.toThrow("safe values");
  });
});
