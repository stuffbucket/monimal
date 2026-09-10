# @stuffbucket/llama-server

Cordis/DSH runner plugin for the standalone
[llama.cpp](https://github.com/ggml-org/llama.cpp) HTTP server. Its runtime
contracts live in `src/index.ts` and the modules exported there.

This remains separate from `maximal-electron`'s embedded `node-llama-cpp`
utility process and does not import or replace that path.

From the workspace root:

```sh
pnpm --filter @stuffbucket/llama-server run build
pnpm --filter @stuffbucket/llama-server run typecheck
pnpm --filter @stuffbucket/llama-server run lint
pnpm --filter @stuffbucket/llama-server run test
```
