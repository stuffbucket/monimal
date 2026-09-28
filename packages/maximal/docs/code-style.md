# Code Style

Scoped to the root composition (`src/`). The
[`maximal-desktop`](../../../apps/desktop/package.json) Electron app and
[`@maximal/maximal-client`](../../maximal-client/package.json) product UI are separate
TypeScript projects with their own pnpm lint and test scripts.

- **Imports:** Use `~/` alias for `src/` (e.g., `import { foo } from '~/lib/foo'`)
- **TypeScript:** Strict mode — no `any`, `noUnusedLocals`, `noUnusedParameters`
- **Modules:** ESNext only, no CommonJS
- **Naming:** `camelCase` for functions/variables, `PascalCase` for types/interfaces
- **Error handling:** Route handlers catch and call `forwardError(c, error)`; use `HTTPError` from `src/lib/errors/error.ts`
- **Streaming:** All three API flows support both streaming (SSE via `streamSSE`) and non-streaming, switching on `payload.stream`
