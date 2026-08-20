# @stuffbucket/llama-server

Scaffold for an independently buildable adapter to the standalone
[llama.cpp](https://github.com/ggml-org/llama.cpp) HTTP server. The package
currently exports only the backend descriptor that fixes its process boundary
and native model format.

This is separate from `maximal-electron`'s embedded `node-llama-cpp` utility
process. It does not import or replace that path. It also does not bundle
llama.cpp, discover an installation, launch a process, issue requests, or manage
prompt-cache slots yet.

From the workspace root:

```sh
pnpm --filter @stuffbucket/llama-server run build
pnpm --filter @stuffbucket/llama-server run typecheck
pnpm --filter @stuffbucket/llama-server run lint
pnpm --filter @stuffbucket/llama-server run test
```
