import type { GitHubHostProfile, GitHubHostProfileInput } from "./contracts.js";

const DEFAULT_REST_API_VERSION = "2022-11-28";

function normalizeHostname(input: string): string {
  let value = input.trim().toLowerCase();
  while (value.endsWith(".")) value = value.slice(0, -1);
  if (!value) throw new Error("GitHub hostname must not be empty");
  if (
    value.includes("/") ||
    value.includes(":") ||
    value.includes("@") ||
    /\s/u.test(value)
  ) {
    throw new Error("GitHub hostname must be a bare DNS hostname");
  }
  return value;
}

export function createGitHubHostProfile(
  input: GitHubHostProfileInput,
): GitHubHostProfile {
  const restApiVersion =
    input.restApiVersion?.trim() || DEFAULT_REST_API_VERSION;

  if (input.kind === "github-cloud") {
    if (
      input.hostname !== undefined &&
      normalizeHostname(input.hostname) !== "github.com"
    ) {
      throw new Error("GitHub Cloud uses the github.com hostname");
    }
    return {
      id: "github.com",
      kind: input.kind,
      hostname: "github.com",
      webBaseUrl: "https://github.com",
      restBaseUrl: "https://api.github.com",
      graphqlUrl: "https://api.github.com/graphql",
      oauthBaseUrl: "https://github.com",
      restApiVersion,
    };
  }

  if (input.hostname === undefined) {
    throw new Error(`${input.kind} requires an explicit hostname`);
  }
  const hostname = normalizeHostname(input.hostname);

  if (input.kind === "github-cloud-data-residency") {
    if (!hostname.endsWith(".ghe.com")) {
      throw new Error("GitHub Cloud data-residency hosts must end in .ghe.com");
    }
    const apiHostname = `api.${hostname}`;
    return {
      id: hostname,
      kind: input.kind,
      hostname,
      webBaseUrl: `https://${hostname}`,
      restBaseUrl: `https://${apiHostname}`,
      graphqlUrl: `https://${apiHostname}/graphql`,
      oauthBaseUrl: `https://${hostname}`,
      restApiVersion,
    };
  }

  return {
    id: hostname,
    kind: input.kind,
    hostname,
    webBaseUrl: `https://${hostname}`,
    restBaseUrl: `https://${hostname}/api/v3`,
    graphqlUrl: `https://${hostname}/api/graphql`,
    oauthBaseUrl: `https://${hostname}`,
    restApiVersion,
  };
}
