# The overlay agent

The overlay runs the pi coding agent: `@earendil-works/pi-ai` for the provider,
and `@earendil-works/pi-agent-core` for the loop and tools. Both at `^0.83.0`.
They come from `badlogic/pi-mono`. `badlogic/pi` is a different project, a vLLM
deployment CLI, and is easy to vendor by mistake.

- **Never add an API key.** Discovery finds maximal or Ollama on localhost. A
  key in this repository is a defect.
- The tool bridge in `buildTools` exists because `AgentHarnessTool.execute`
  takes its context as a fifth argument, and plain `Agent` does not pass one.
  Do not simplify it away.
- Tools give the agent a shell. Keep that behind the `agentTools` preference.
- A run streams. `overlay:ask` returns once the run starts, and text arrives as
  `agent:delta` events. Do not make it block.

## The provider chain

`discoverProvider` ranks backends by quality, not convenience:

1. **maximal** on `localhost:4141`, when it is up. A proxy backed by a real
   subscription beats any local model.
2. **Ollama** on `localhost:11434`, when it has a model pulled. The model comes
   from `/api/tags`, so `discoverProvider` names only something installed.
3. **embedded**, always. `node-llama-cpp` runs Qwen3 0.6B in a child process.

Rules:

- **Embedded is the floor, not the default.** It exists so the application
  works offline and with nothing installed.
- **Never name a model that might not exist.** The old code pinned
  `llama3.2`, which was both absent on most machines and the worst tested
  model for restraint.
- The weights are **not** in the package. `src/main/native/llama.ts` fetches
  them once into `userData` on first use.
- `STUFFBUCKET_PROVIDER` pins one backend: `maximal`, `ollama`, or `embedded`.
  Without it the embedded path is unreachable on any machine running a proxy,
  which is every machine that develops this. A pin that does not answer reports
  `unavailable` rather than quietly becoming a different backend.
- `STUFFBUCKET_MODEL_PATH` points at existing weights.

### Moving an endpoint

`STUFFBUCKET_PROVIDER_URL` replaces the base URL of the pinned backend.
`src/main/native/provider-endpoint.ts` holds both rules, and both are narrow:

- It is read **only when `STUFFBUCKET_PROVIDER` names `maximal` or `ollama`**.
  A value on its own changes nothing, so moving discovery is asked for twice.
- The address must be `http` or `https` on `localhost`, `127.0.0.1`, or `[::1]`.
  Discovery finds a provider on this machine; an override that could name
  another one would make that untrue. Anything else is refused rather than
  repaired.

**It cannot reach the approval gate.** `beforeToolCall` runs against whatever
answered, and no environment variable is read anywhere near it, so pointing the
agent at another endpoint cannot make a tool call skip the question.

The end-to-end suite is the caller. `e2e/model-server.ts` serves a scripted
backend on a loopback port, which is how the overlay's agent scenarios run on a
runner with no model. See `docs/testing.md` for what a scripted reply proves and
what it does not.

## Two engines, one gate

The embedded provider does not use pi's `Agent`. `node-llama-cpp` owns its own
loop and constrains sampling to the tool grammar, which is most of why a 0.6B
model can call tools at all. `src/main/native/embedded.ts` is that path.

**It runs in another process**, because a native abort is not catchable and
took the whole application with it. `src/main/llama-worker.ts` is the engine
and the only file that loads the library; `src/main/native/llama-host.ts`
supervises it. See `docs/architecture.md` and issue #133.

What both paths share is not optional, and the boundary was designed around
keeping it:

- **The same approval gate**, through the same `approve` callback and the same
  risk classification. Two ways to reach a shell, one way to permit it. The
  engine cannot hold the callback, so a tool call becomes a message the main
  process answers and the gate never moves.
- **The same sink.** The overlay does not know which engine ran. A token is
  posted across the boundary as it is produced, so nothing accumulates a
  response on either side.

`src/main/native/grammar.ts` translates between the two schema dialects. pi uses
TypeBox, which writes a closed set of strings as `anyOf: [{const: 'a'}]`;
llama.cpp wants `enum: ['a']` and throws `Unknown immutable type undefined`
otherwise. That failure is quiet: the tool never becomes callable and it looks
like a model too small to follow instructions. A schema it cannot express means
the tool is **dropped and logged**, never passed through unconstrained.

## The approval gate

`beforeToolCall` in `src/main/native/agent.ts` is the only thing between a local
model and the user's shell. Four rules:

1. **The gate denies on every edge.** Timeout, abort, a dismissed card, and a
   failed run all end as a refusal. Never add a path that falls through to
   allow.
2. **`src/main/native/approval.ts` stays free of `electron`.** It is in the
   `stryker.conf.json` mutate list, and it decides what to gate. That logic must
   be mutation tested.
3. **`riskOf` sends an unrecognised tool to `dangerous`.** A toolset may declare
   its own risk; anything else falls through `BUILT_IN_RISK` to `dangerous`, so
   adding a tool cannot widen what runs unattended.
4. **Remember applies to an allow only**, and only for the current run. A
   remembered deny would break the rest of a run with no way to see why. Nothing
   about a decision is persisted.

`preferences.ts` validates `agentApproval` against the three literals rather
than casting. A hand-edited file must not be able to land on `none`.

## Quitting with native work in flight

The embedded model runs on a worker thread, in the engine process. Tear a Node
environment down while any of that is outstanding, and the addon completes into
an environment that no longer exists. It calls `ThrowAsJavaScriptException`
against it, and the process aborts inside ggml's terminate handler.

That is now the engine's process rather than the application's, which is most
of the point. The rules still hold, because an abort during quit is still a
crash report a user can see.

- **Never start native work during `before-quit`.** An earlier version disposed
  of a model there without awaiting the result. Every embedded run aborted on
  exit.
- **Nothing frees the weights.** The process is ending and the operating system
  reclaims the memory, so there is no reason to ask. `llama-host.ts` kills the
  engine on `will-quit` instead.
- `before-quit` defers the quit through `shutdownAgent` when a run is in flight,
  then quits again. The guard flag is what stops that looping.
- Close an application under test with `closeApp` from `e2e/harness.ts`, not
  `app.close()`. A crash during teardown happens after the last assertion, so
  Playwright reports the run as passed. That hid this bug through four
  consecutive green runs. The only evidence was in the operating system's crash
  reports.
