import { describe, expect, test } from "bun:test"

import { getDeviceCode } from "~/services/github/get-device-code"

const RUN_LIVE_GITHUB_OAUTH = process.env.MAXIMAL_GITHUB_NETWORK_TESTS === "1"

describe.skipIf(!RUN_LIVE_GITHUB_OAUTH)(
  "live GitHub OAuth (opt-in: MAXIMAL_GITHUB_NETWORK_TESTS=1)",
  () => {
    test("requests one short-lived device code without polling or persisting it", async () => {
      const response = await getDeviceCode()

      expect(response.device_code.length).toBeGreaterThan(0)
      expect(response.user_code.length).toBeGreaterThan(0)
      expect(response.verification_uri).toBe("https://github.com/login/device")
      expect(response.expires_in).toBeGreaterThan(0)
      expect(response.interval).toBeGreaterThanOrEqual(0)
    })
  },
)
