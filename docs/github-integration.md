# GitHub Integration

Status: Stage 0 foundation implemented

## Decision

`@maximal/maximal-github` MUST be the shared GitHub integration boundary for
Maximal applications and services.

The package has four responsibilities:

1. runtime-neutral contracts for hosts, accounts, repositories, pages, and
   normalized failures;
2. explicit host profiles for GitHub.com, GitHub Enterprise Cloud with data
   residency, and GitHub Enterprise Server;
3. a trusted-process Octokit REST adapter; and
4. read-only GitHub CLI account discovery and explicit token import.

REST MUST be the default API. GraphQL MAY be added for aggregate views or
GraphQL-only features through package-owned, operation-specific methods.
Octokit request and response types MUST NOT appear in the root contracts.

Native Git MUST continue to own clone, fetch, pull, push, status, diff, index,
commit, branch, worktree, and remote configuration. GitHub API Git object
endpoints MUST NOT become an alternate implementation of local Git.

## Package surfaces

| Export                              | Runtime                       | Purpose                                           |
| ----------------------------------- | ----------------------------- | ------------------------------------------------- |
| `@maximal/maximal-github`           | Any modern JavaScript runtime | Host factory and serializable contracts           |
| `@maximal/maximal-github/contracts` | Renderer-safe                 | Types only; no token or Node dependencies         |
| `@maximal/maximal-github/octokit`   | Trusted Node/Electron main    | Authenticated GitHub API adapter                  |
| `@maximal/maximal-github/gh`        | Trusted Node/Electron main    | Read-only `gh` account discovery and token import |

Consumers SHOULD depend on operation-specific `GitHubClient` methods rather
than on Octokit. The package MAY expose an explicit GraphQL operation in the
future, but MUST NOT expose an unbounded renderer-to-Octokit proxy.

## Host profiles

Host kind MUST be explicit. A non-`github.com` domain is not enough to
distinguish Enterprise Cloud data residency from GHES.

| Kind                             | Web                      | REST                         | GraphQL                              |
| -------------------------------- | ------------------------ | ---------------------------- | ------------------------------------ |
| GitHub.com and EMU on GitHub.com | `https://github.com`     | `https://api.github.com`     | `https://api.github.com/graphql`     |
| Enterprise Cloud data residency  | `https://TENANT.ghe.com` | `https://api.TENANT.ghe.com` | `https://api.TENANT.ghe.com/graphql` |
| GHES                             | `https://HOST`           | `https://HOST/api/v3`        | `https://HOST/api/graphql`           |

The package uses REST API version `2022-11-28` by default for broad GHES
compatibility. A host profile MAY select a newer supported version after
capability discovery or administrator configuration. API-version policy MUST
be centralized by host rather than chosen independently at each call site.

GHES support is incomplete until the package has explicit proxy, custom CA,
server-version, and endpoint-capability handling. A GitHub.com OAuth client ID
MUST NOT be assumed to work on an arbitrary GHES instance.

## Accounts and credentials

Account identity SHOULD migrate from mutable `login@host` keys toward an
opaque local ID associated with the immutable API user ID and host. Login
remains display and routing metadata.

The Octokit adapter receives tokens from an injected
`GitHubCredentialProvider`. Tokens MUST NOT appear in:

- runtime-neutral account objects;
- IPC payloads or renderer state;
- logs, telemetry, errors, or cache keys;
- URLs or Git command arguments; or
- repository remote URLs.

Stage 0 continues using the existing Core account store. A later credential
migration MUST separate ordinary account metadata from secret material stored
through an OS-protected credential provider.

Interactive user authentication MUST use device flow with a Maximal-owned
OAuth App or GitHub App registration. It MUST require only the registration's
client ID and MUST NOT ship or request a client secret. After authorization,
the package MUST resolve `/user` and bind the returned token to that verified
host and login before persisting it through the credential provider.

Other credential sources SHOULD be preferred in this order when device flow is
not the applicable authentication method:

1. GitHub App installation or user tokens for an organization-approved
   product;
2. fine-grained PATs for manual enterprise configuration;
3. classic PATs only where a required endpoint or GHES version needs them; and
4. explicitly imported GitHub CLI OAuth tokens as a convenience.

Device flow MUST be owned by this package. During the initial migration,
`requestGitHubDeviceCode` owns request construction and response validation
while Core injects its guarded `sendRequestJson` transport and retains its
existing poller. This transitional split MUST move into a package-owned
end-to-end flow through `@octokit/auth-oauth-device`. The final flow MUST expose
authorization instructions and polling progress without exposing a token to
the renderer. GitHub App installation authentication MAY add
`@octokit/auth-app` when installation operations are implemented.

The GitHub CLI source publishes its OAuth client ID and an embedded client
secret because a distributed native client cannot keep either value
confidential. Its build also supports replacing them through
`GH_OAUTH_CLIENT_ID` and `GH_OAUTH_CLIENT_SECRET`. Maximal MAY reuse the
MIT-licensed flow design, tests, and behavioral lessons, but MUST NOT use the
GitHub CLI OAuth app identifiers in production. The source-code license does
not grant Maximal the right to present itself to users or GitHub as the
GitHub CLI OAuth application.

Maximal MUST register and use its own OAuth App or GitHub App. The client ID
MAY be compiled into the desktop application. Maximal MUST use the device-code
exchange and MUST NOT implement a local callback server or browser redirect
handler for sign-in. Host-specific GHES authentication MUST use an application
registration accepted by that host.

## GitHub CLI interoperability

The package MAY run only:

```text
gh --version
gh auth status --json hosts
gh auth token --hostname HOST --user LOGIN
```

It MUST NOT change the user's GitHub CLI state through `auth login`, `logout`,
`switch`, `refresh`, `setup-git`, or `config set`. It MUST NOT parse
`hosts.yml` or access the CLI keyring directly.

Account selection MUST include both hostname and login. Depending on the
currently active account is incorrect when several accounts share one host.

An imported token becomes a Maximal credential. Logging out of `gh` does not
remove that copy, although server-side revocation affects both.

`gh repo clone` and `gh pr checkout` MAY remain optional transitional
conveniences because they implement useful fork and checkout behavior. They
MUST be explicit actions rather than hidden dependencies of API reads.

## Enterprise Managed Users

EMU is a policy and capability dimension, not a separate protocol. Managed
users use the normal GitHub.com or GHE.com APIs.

The package MUST NOT infer EMU from a login suffix. It MUST NOT infer mutation
permission from token scopes alone. Enterprise, organization, IdP, SAML, and
repository policy can still reject an otherwise valid token.

The adapter MUST tolerate:

- enterprise-bound interaction restrictions;
- `403` policy or permission failures;
- privacy-preserving `404` responses;
- SAML SSO authorization requirements;
- organization approval requirements for fine-grained PATs; and
- absent public avatar conventions.

The current client preserves API-provided avatar URLs. Consumers MUST NOT
synthesize `github.com/<login>.png`.

Generic API responses cannot always prove that a failure is specifically an
EMU policy restriction. The adapter SHOULD return a conservative normalized
failure unless an API response provides a reliable policy signal.

SCIM and enterprise provisioning require separately permissioned
administrative credentials and MUST be a later administration surface, not
part of the normal user client.

## Octokit composition

The initial implementation uses exact MIT-licensed dependencies:

| Package                      | Version | Purpose                                                            |
| ---------------------------- | ------: | ------------------------------------------------------------------ |
| `@octokit/rest`              |  22.0.1 | REST methods, core request, GraphQL transport, and REST pagination |
| `@octokit/plugin-retry`      |   8.1.1 | Bounded transient retry support                                    |
| `@octokit/plugin-throttling` |  11.0.5 | Primary and secondary rate-limit pacing                            |

The umbrella `octokit` package is not used because it also composes GitHub App,
OAuth App, and webhook machinery outside the current scope.

The package MUST NOT separately add `@octokit/core`,
`@octokit/auth-token`, `@octokit/plugin-rest-endpoint-methods`, or
`@octokit/plugin-paginate-rest` while `@octokit/rest` already owns them.

Automatic retries MUST be conservative:

- safe reads MAY retry a bounded transient or primary-rate-limit failure;
- secondary-rate-limit responses MUST pause and surface rather than loop;
- mutations MUST NOT be replayed unless the operation is proven idempotent or
  reconciles the first attempt; and
- authentication, permission, SSO, policy, validation, and not-found failures
  MUST NOT be retried blindly.

## Operation ownership

### Stage 0: foundation

Implemented:

- GitHub.com, GHE.com, and GHES host profiles;
- authenticated viewer lookup;
- repository metadata lookup;
- normalized authentication, SSO, permission, rate, validation, conflict,
  cancellation, and transport failures;
- credential invalidation after `401`;
- read-only `gh` account discovery and explicit token import; and
- fixture-based tests without live credentials.

### Stage 1: read-heavy operations

The package SHOULD next add:

- paged repositories, organizations, and teams;
- issues and pull requests;
- checks and commit statuses as distinct concepts;
- Actions workflows, runs, jobs, artifacts, and logs;
- releases and streamed assets;
- search with its separate rate and incompleteness semantics;
- ETag caching isolated by host, account, API version, media type, and URL; and
- selective package-owned GraphQL queries for review threads or aggregate
  dashboards.

Every list operation SHOULD offer a page or async-iterator form. It MUST NOT
force callers to materialize an unbounded account or enterprise inventory.

### Stage 2: mutations

Mutations SHOULD be added only with explicit capability, confirmation, and
idempotency policy:

- issue and pull-request creation or editing;
- review and comment operations;
- workflow dispatch, rerun, and cancellation; and
- release creation and asset upload.

### Stage 3: advanced enterprise

Later enterprise work MAY include:

- GitHub App installation and user authentication;
- GHES version and capability discovery;
- custom CA and proxy configuration;
- GHE.com data-residency validation; and
- separately permissioned enterprise administration and SCIM.

## Errors and rate limits

Public failures are a discriminated vocabulary:

```text
unauthenticated
sso_required
permission_denied
policy_restricted
not_found
validation
conflict
primary_rate_limited
secondary_rate_limited
unsupported_by_host
transport
cancelled
```

Failures MAY include HTTP status, request ID, retry delay, and SSO URL. They
MUST NOT include credentials or arbitrary response bodies.

Rate state MUST be tracked per host, account, and resource bucket when that
surface is added. Response headers are authoritative. Search, GraphQL, Actions,
SCIM, and other APIs may use separate buckets.

## Cache requirements

Conditional GET caching MAY be added behind an injected cache interface.

Cache keys MUST include:

- host;
- authenticated account or visibility boundary;
- API version;
- media type; and
- complete normalized URL.

Private responses MUST NOT be shared across accounts. Authentication,
permission, or policy failures, signed download URLs, and token-bearing data
MUST NOT be cached.

## Testing

Normal CI MUST NOT require live GitHub credentials.

Tests MUST cover:

- GitHub.com, GHE.com, and GHES endpoint construction;
- multiple users on one host and multiple hosts in `gh`;
- missing, old, malformed, locked, or absent `gh`;
- authorization header confinement to the configured origin;
- missing, expired, and revoked credentials;
- SSO, fine-grained permission shortfalls, policy denial, and
  privacy-preserving `404`;
- primary and secondary limits, bounded retry, and cancellation;
- pagination, GraphQL partial errors, and ETag `304`;
- account-isolated caches; and
- the absence of Octokit types from runtime-neutral exports.

A manually configured smoke suite MAY exercise GitHub.com and GHES, but it
MUST remain separate from ordinary tests.

## References

- [Octokit REST](https://github.com/octokit/rest.js)
- [Octokit retry plugin](https://github.com/octokit/plugin-retry.js)
- [Octokit throttling plugin](https://github.com/octokit/plugin-throttling.js)
- [GitHub CLI multiple accounts](https://docs.github.com/en/github-cli/github-cli/using-multiple-accounts)
- [GitHub CLI OAuth flow source](https://github.com/cli/cli/blob/1cd39adbf03b0afc7c4600ad829fd3f196335800/internal/authflow/flow.go)
- [GitHub CLI build-time OAuth overrides](https://github.com/cli/cli/blob/1cd39adbf03b0afc7c4600ad829fd3f196335800/script/build.go)
- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
- [GitHub Enterprise Cloud REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/getting-started-with-the-rest-api)
- [GitHub Enterprise Server REST API](https://docs.github.com/en/enterprise-server@3.22/rest/using-the-rest-api/getting-started-with-the-rest-api)
- [GitHub Enterprise Server GraphQL endpoint](https://docs.github.com/en/enterprise-server@3.22/graphql/guides/forming-calls-with-graphql)
- [Managed user account restrictions](https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/understanding-iam-for-enterprises/abilities-and-restrictions-of-managed-user-accounts)
- [Authorizing a PAT for SAML SSO](https://docs.github.com/en/authentication/authenticating-with-single-sign-on/authorizing-a-personal-access-token-for-use-with-single-sign-on)
- [GitHub Apps compared with OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
- [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
