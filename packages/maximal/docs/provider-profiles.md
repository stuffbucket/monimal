# External provider profiles

Maximal can route provider-scoped Anthropic Messages requests through genuine
Cordis LLM adapter plugins. The rollout is deliberately reversible: the
existing built-in Anthropic passthrough remains the default `legacy` mode,
while `plugins` mode is opt-in.

Cordis supplies plugin lifecycle and dependency scoping. It is not a security
boundary. Every package installed in a provider profile is trusted in-process
code with Maximal's filesystem, network, environment, and OS-user authority.
Plugin mode is therefore explicit and opt-in.

IPC alone is not sufficient for untrusted packages. It can protect Maximal's
memory, module graph, and process lifetime, but a child process running as the
same user retains the user's filesystem and network authority. A future
isolated provider backend must combine a versioned streaming
`ProviderGateway` protocol with an OS-enforced least-privilege sandbox. It must
be implemented as a separate gateway backend so Core and the localhost API do
not depend on the execution model.

## Profile layout

A provider profile is a user-managed directory containing an ordinary
`package.json`, its installed dependency tree, and `providers.json`. Maximal
never installs, upgrades, removes, or rewrites profile packages.

Use exact versions in `package.json`. The supported initial runtime pair is
`@deepseek-ai/cordis@4.0.2` and `@deepseek-ai/dsh-llm@0.1.0-rc.8`.

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.2",
    "@deepseek-ai/dsh-llm": "0.1.0-rc.8",
    "@maximal/anthropic-provider": "<exact-version>",
    "@maximal/omlx": "<exact-version>"
  }
}
```

`providers.json` defines composition, not secrets or activation:

```json
{
  "schemaVersion": 3,
  "pluginApiVersion": 1,
  "runtime": {
    "cordis": "@deepseek-ai/cordis",
    "llm": "@deepseek-ai/dsh-llm"
  },
  "services": [],
  "plugins": [
    {
      "id": "anthropic",
      "kind": "provider",
      "package": "@maximal/anthropic-provider"
    },
    {
      "id": "omlx",
      "kind": "runner",
      "package": "@maximal/omlx"
    }
  ]
}
```

`schemaVersion` versions the JSON document shape. `pluginApiVersion` versions
the profile-to-host behavior contract independently, so a future document
format change does not imply a plugin ABI change. Maximal currently supports
plugin API version 1. Legacy schema versions 1 and 2 normalize to plugin API
version 1; schema version 3 requires the field explicitly. Unsupported plugin
API versions fail validation before any package is imported.

Package references must be bare package names declared directly in the
profile's exact dependencies. Relative paths, URLs, undeclared packages,
non-ESM entries, package-root escapes, and a second Cordis runtime identity
are rejected.

## Maximal activation

Maximal's application config selects the mode and supplies each plugin's
native configuration unchanged:

```json
{
  "providerHost": {
    "mode": "plugins",
    "profileDirectory": "/absolute/path/to/provider-profile"
  },
  "providerPlugins": {
    "omlx": {
      "enabled": true,
      "config": {
        "instances": {
          "local": {
            "baseUrl": "http://127.0.0.1:8000",
            "apiKey": "<omlx-api-key>"
          }
        }
      }
    }
  }
}
```

The `providerPlugins` key is the `id` from `providers.json`. Maximal treats
`config` as opaque data; the plugin's own Schemastery schema validates it.
Maximal must not log or expose that data. Protect `config.json` as a secret when
plugin configuration contains credentials.

The existing `providers` object remains a compatibility input during rollout.
In `plugins` mode, enabled `type: "anthropic"` entries are converted in memory to
the external Anthropic plugin's native instance configuration. Maximal does not
rewrite the file. An explicit `providerPlugins.anthropic.config` takes
precedence over the compatibility conversion. Other legacy provider types are
rejected with a bounded diagnostic rather than silently ignored.

## Live changes and restart boundary

These changes reconcile without rebuilding or restarting Maximal:

- adding, removing, enabling, or disabling already-installed entries in
  `providers.json`;
- changing `providerPlugins` configuration;
- switching explicitly between `legacy` and `plugins` mode.

A candidate composition is fully resolved and activated before publication. If
it fails, the active generation remains in service and the candidate's redacted
diagnostics are published. New requests capture one generation; streams already
in flight remain leased to their captured generation until completion or
cancellation.

Changing installed package code, versions, or dependency state requires a
provider-host restart. In-process ESM modules cannot be unloaded reliably, so
Maximal refuses to present cached code as the replacement. Restarting the whole
Maximal process is also the recovery boundary for a trusted plugin that leaks
timers, listeners, or other effects outside its Cordis scope.

Plugin mode never falls back to the legacy provider path. Unavailable or
invalid provider plugins return an explicit error. Rollback is an explicit
config change: set `providerHost.mode` to `legacy`. Neither rollback nor later
reactivation uninstalls packages or rewrites configuration.

## Live model registry

Cordis currently provides a live model registry through the LLM runtime mounted
at `context.llm`. The provider-plugin runtime reads `listProviders()` and
`listModels(provider)` and subscribes to `llm/adapters-updated` so committed
generations can publish current provider topology through `ProviderGateway`.
Core uses that topology for model listing and request routing.

Provider model discovery uses the shared runtime-neutral descriptor from
`@maximal/maximal-model-contract`. Providers may declare tokenizer identity,
supported operations, and optional runtime evidence for lifecycle, selection,
access, endpoints, full limits, capabilities, and unit-bearing pricing
independently of descriptive catalog metadata. Provider-specific residue uses a
discriminated details payload. The operation vocabulary reserves `systemone`
for the provider-neutral `POST /v1/systemone` contract; reserving the operation
does not mount that route or advertise it from providers that do not implement
it.

This registry is in-memory and advisory. It describes models available from
the active runtime generation; it is not durable, does not replace local model
manifests, and is separate from the reviewed model metadata released by
`stuffbucket/model-catalog`.

## Lifecycle and diagnostics

Maximal owns watchers, subscriptions, abort controllers, generation leases, and
the Cordis context. Disposal is idempotent and runs in reverse ownership order.
Cleanup failures are contained and reported as bounded
`provider-disposal-failed` diagnostics; they must not corrupt a still-active
last-known-good generation.

Provider status may expose only provider names, supported operations, state, and
redacted diagnostic text. It must never expose API keys, plugin configuration,
prompts, response bodies, model weights, generated authorization material,
logs, or settings.

## Temporary legacy removal gate

The built-in Anthropic passthrough is a temporary rollback path, not a second
plugin system. Remove it only in a separate reviewed change after all of these
are true:

1. The external Anthropic adapter has parity for JSON and SSE messages, tools,
   signed reasoning replay, model discovery, usage, cancellation, and bounded
   error mapping.
2. Stock Cordis and Maximal-hosted interoperability tests pass for external
   Anthropic and oMLX adapters.
3. The compiled CLI and Electron sidecar load an external profile without
   bundling any concrete provider.
4. Repeated `legacy -> plugins -> legacy` tests preserve responses, in-flight
   streams, and user configuration.
5. The rollout has completed its review and soak period with the license,
   security, package-boundary, and SBOM gates enabled.
