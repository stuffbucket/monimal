# Maximal configurators

## Pi CLI

- Operators MUST use this integration only with an already configured Maximal proxy and reviewed provider connections.
- The running proxy MUST implement `GET /v1/models?format=maximal` with `schemaVersion: 1`. A separately installed `maximal` binary MUST NOT be assumed to include this checkout's API; a successful standard OpenAI model list MUST NOT count as selector-catalog compatibility.
- Operators MUST NOT treat inventory discovery or model selection as Connect approval, runtime installation, model loading, sharing approval, or isolation evidence.
- Operators MUST use Pi's existing `/model` selector; this extension MUST NOT install another picker or write Pi settings, credentials, or `models.json`.

### Build and isolated smoke

Run from the repository root:

```sh
pnpm exec turbo run build --filter=@maximal/maximal-configurators
pnpm pi:smoke
```

- The smoke MUST use installed Pi and Bun executables, isolated temporary client state, and synthetic credentials.
- Smoke reports MUST distinguish real Pi/Core processes and loopback sockets from the synthetic inference upstream. They MUST NOT claim live deployment, LAN, GPU, native desktop, or production consent acceptance.
- To check a different installed Pi executable, pass its absolute path: `pnpm pi:smoke /absolute/path/to/pi`.
- Automated workflows MUST pin their Pi executable version rather than resolving a new release.

### Review the proxy destination

Create a JSON file explicitly and set its absolute path:

```sh
export MAXIMAL_PI_CONFIG="$HOME/.config/maximal/pi.json"
```

Use this schema, replacing the origin with the **reviewed Maximal proxy origin**, not a discovered backend URL:

```json
{
  "schemaVersion": 1,
  "origin": "https://your-maximal-proxy.example.test",
  "apiKeyEnv": "MAXIMAL_API_KEY",
  "overrides": []
}
```

- Operators MUST provide `MAXIMAL_API_KEY` through the environment; config MUST contain only its environment-variable name, never its value or a shell command.
- Remote origins MUST use HTTPS and an explicit API-key environment reference. Unauthenticated local proxies MAY use `apiKeyEnv: null` with literal IPv4 loopback HTTP (`127.0.0.1`). IPv6 and hostname-based proxies MUST use HTTPS.
- Origins MUST NOT contain credentials, paths, query strings, or fragments. Redirects MUST NOT receive the configured credential.
- Changes to the origin or API-key reference MUST require restarting Pi; catalog refresh MUST NOT change the credential destination.

### Inspect without inference

```sh
pnpm pi:models --config "$MAXIMAL_PI_CONFIG"
```

- Operators MUST inspect `providers` and `skipped` before selecting a model.
- Consumers MUST treat exit code `0` as eligible inventory, `3` as no eligible chat models, and `1` as invalid configuration or discovery failure.
- Missing limits or prices MUST remain skipped rather than receiving Pi's default metadata.
- Reviewed `overrides` MAY supply `contextWindowTokens`, `maxOutputTokens`, and `cost` for an exact `(source, provider, id)`; omitting `id` MUST mean a deliberate provider-wide default. Exact overrides MUST take precedence over provider-wide defaults.
- Operators MUST replace every identity, limit, and price in this illustrative override with reviewed facts before using it:

```json
{
  "source": "provider",
  "provider": "your-configured-provider-id",
  "id": "your-served-alias",
  "contextWindowTokens": 32768,
  "maxOutputTokens": 2048,
  "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
}
```

- Cost fields MUST use USD per million tokens. Zero MUST be explicit and reviewed, for example for an unbilled local service; missing pricing MUST NOT become zero automatically.
- Overrides MUST NOT introduce a model, change its proxy route, enable an unadvertised operation, or assert capabilities.
- Unknown capabilities MUST remain disabled in Pi's boolean feature projection, not asserted as supported.

### Use Pi's selector

```sh
pi -e "$PWD/packages/maximal-configurators/dist/pi.js"
```

- Use `/model` to select an eligible Maximal model.
- Use `/maximal-models` to inspect the last projection and skip reasons without inference.
- Use `/maximal-refresh` after an approved connection or inventory change to reconcile provider groups. Pi's native `refreshModels` callback MUST refresh existing groups; newly introduced groups MUST be discovered through `/maximal-refresh` or a new Pi session.
- After a failed refresh, managed providers MUST be withdrawn without touching unrelated providers; static catalogs MUST NOT act as a fallback.
- For print mode, copy the exact provider ID and served model ID from `pi:models`, then run:

```sh
pi -e "$PWD/packages/maximal-configurators/dist/pi.js" \
  --provider YOUR_PROJECTED_PROVIDER_ID --model YOUR_SERVED_MODEL_ID \
  --print 'Reply with a short greeting.'
```

- Duplicate served aliases MUST retain distinct `maximal-{source}-{encoded-provider}` identities and provider-qualified proxy routes.
- Implementations MUST delegate streaming and tool replay to Pi's supported Anthropic Messages, OpenAI Responses, or OpenAI Chat Completions API. Classifier-only offerings MUST NOT enter the chat selector.
- Validation reports MUST distinguish Messages text/tool-replay smoke coverage from unverified Responses/Chat Completions live-provider behavior.
