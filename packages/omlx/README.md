# @stuffbucket/omlx

Scaffold for an independently buildable adapter to the
[oMLX](https://github.com/jundot/omlx) HTTP server. The package currently
exports only the backend descriptor that fixes its process boundary and native
model format.

It does not bundle Python or oMLX, discover an installation, launch a process,
issue requests, or manage the KV cache yet.

From the workspace root:

```sh
pnpm --filter @stuffbucket/omlx run build
pnpm --filter @stuffbucket/omlx run typecheck
pnpm --filter @stuffbucket/omlx run lint
pnpm --filter @stuffbucket/omlx run test
```
