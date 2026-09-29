import { describe, expect, test } from "vitest";

import {
  GitHubDeviceCodeResponseSchema,
  requestGitHubDeviceCode,
  type GitHubDeviceCodeRequestInit,
  type GitHubJsonRequester,
  type GitHubJsonValidator,
} from "../src/device-auth.js";

describe("GitHub device authentication", () => {
  test("constructs the device-code request and validates the response", async () => {
    const requests: Array<{
      url: string;
      init: GitHubDeviceCodeRequestInit;
      validator: GitHubJsonValidator<unknown>;
    }> = [];
    const requestJson: GitHubJsonRequester = (url, init, validator) => {
      requests.push({ url, init, validator });
      return Promise.resolve(
        validator.parse({
          device_code: "device-123",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 600,
          interval: 5,
        }),
      );
    };

    await expect(
      requestGitHubDeviceCode({
        oauthBaseUrl: "https://github.com",
        clientId: "client-123",
        scope: "repo read:org",
        headers: { accept: "application/json" },
        timeoutMs: 10_000,
        requestJson,
      }),
    ).resolves.toMatchObject({
      device_code: "device-123",
      user_code: "ABCD-1234",
    });

    expect(requests).toEqual([
      {
        url: "https://github.com/login/device/code",
        init: {
          method: "POST",
          headers: { accept: "application/json" },
          body: JSON.stringify({
            client_id: "client-123",
            scope: "repo read:org",
          }),
          errorMessage: "Failed to get device code",
          timeoutMs: 10_000,
        },
        validator: GitHubDeviceCodeResponseSchema,
      },
    ]);
  });

  test("defaults malformed polling bounds to finite RFC values", () => {
    const result = GitHubDeviceCodeResponseSchema.parse({
      device_code: "device-123",
      user_code: "ABCD-1234",
      verification_uri: "https://github.com/login/device",
      expires_in: Number.NaN,
      interval: -1,
    });

    expect(result.expires_in).toBe(900);
    expect(result.interval).toBe(5);
  });

  test("rejects a response without the required device identifiers", () => {
    expect(() =>
      GitHubDeviceCodeResponseSchema.parse({
        expires_in: 600,
        interval: 5,
      }),
    ).toThrow();
  });
});
