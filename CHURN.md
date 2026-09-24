# Churn

- Maximal runtime logs MUST use `@stuffbucket/maximal-logging`; do not add parallel
  console or file logging.
- Before duplicating package code, agents MUST query the workspace export map;
  public code MUST be imported through its package entry point. See
  [docs/query-exports.md](docs/query-exports.md).
- Correctness MUST follow from explicit preconditions, not remembered
  conventions.
- Facts MUST have one owner; identity MUST come from that owner and other
  mentions MUST link to it. Knowledge MUST live in one subtree, except vendored
  package copies.
- Distinct states MUST have distinct names and assertions.
- Tests MUST establish facts explicitly; shared harness operations MUST
  establish those preconditions consistently.
- Repeated clauses SHOULD be lists.
- The tiered test workflow MUST be documented only in
  [docs/testing-in-docker.md](docs/testing-in-docker.md).
- Network host and port literals MUST be fixed protocol defaults; dynamic
  endpoints MUST use held runtime state.
