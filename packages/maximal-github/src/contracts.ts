export type GitHubHostKind =
  "github-cloud" | "github-cloud-data-residency" | "github-enterprise-server";

export interface GitHubHostProfile {
  id: string;
  kind: GitHubHostKind;
  hostname: string;
  webBaseUrl: string;
  restBaseUrl: string;
  graphqlUrl: string;
  oauthBaseUrl: string;
  restApiVersion: string;
}

export interface GitHubHostProfileInput {
  kind: GitHubHostKind;
  hostname?: string;
  restApiVersion?: string;
}

export type GitHubAuthKind =
  | "fine-grained-pat"
  | "classic-pat"
  | "oauth-user"
  | "github-app-user"
  | "github-app-installation"
  | "gh-import";

export interface GitHubAccount {
  id: string;
  hostId: string;
  login: string;
  authKind: GitHubAuthKind;
}

export interface GitHubRepositoryRef {
  hostId: string;
  owner: string;
  name: string;
}

export interface GitHubViewer {
  id: string;
  databaseId: number;
  login: string;
  avatarUrl?: string;
  displayName?: string;
  email?: string;
  htmlUrl: string;
  type: string;
  siteAdmin: boolean;
}

export interface GitHubRepository {
  id: string;
  databaseId: number;
  hostId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  visibility: string;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
}

export interface GitHubPage<T> {
  items: ReadonlyArray<T>;
  next?: string;
  incomplete?: boolean;
}

export type GitHubErrorCode =
  | "unauthenticated"
  | "sso_required"
  | "permission_denied"
  | "policy_restricted"
  | "not_found"
  | "validation"
  | "conflict"
  | "primary_rate_limited"
  | "secondary_rate_limited"
  | "unsupported_by_host"
  | "transport"
  | "cancelled";

export interface GitHubFailure {
  code: GitHubErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
  requestId?: string;
  retryAfterSeconds?: number;
  ssoUrl?: string;
}

export interface GitHubCredentialProvider {
  getToken(accountId: string, signal?: AbortSignal): Promise<string>;
  invalidate(accountId: string, failure: GitHubFailure): Promise<void> | void;
}

export interface GitHubLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface GitHubClient {
  getViewer(signal?: AbortSignal): Promise<GitHubViewer>;
  getRepository(
    repository: GitHubRepositoryRef,
    signal?: AbortSignal,
  ): Promise<GitHubRepository>;
}
