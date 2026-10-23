# vLLM deployment connections

- Operators MUST explicitly configure each deployment and select its served model IDs.
- Deployments MUST support the native `/v1/messages` streaming API.
- Consumers MUST use the connector's advertised `messages` operation; they MUST NOT infer Chat Completions, Responses, embeddings, vision, or tool compatibility from the backend name.
- Model IDs returned by a server MUST NOT be treated as verified artifact variants or merged on the basis of similar names.
- Execution location MUST be `device`, `lan`, or `cloud`; an SSH tunnel MUST NOT turn a remote deployment into `device`.
- Connection configuration MUST NOT be treated as proof that a model is loaded or healthy.
- Connecting MUST NOT install packages, load a model, publish inventory, or enable sharing.
- Future hosts, including Domovyk and Iskra, MUST be configured separately; cluster discovery and access grants MUST remain separate work.

## Development profile

Operators MUST build the reviewed workspace artifacts before creating a development profile:

```sh
pnpm exec turbo run build --filter=@maximal/maximal-runtime-vllm...
node packages/model-runtimes/vllm/examples/create-workspace-profile.mjs vllm-perun
```

Operators MUST retain the returned `profileDirectory` for the live check below. Development profiles MUST NOT be used as distributable runtime packages; their symlinks refer to the current checkout.

Operators MUST provide a connection document using the following shape. They MUST replace `TUNNEL_ORIGIN` with the held loopback HTTP origin of an authenticated SSH tunnel, not a guessed port. The served ID MUST be confirmed against the configured server's model list.

```json
{
  "instances": [{
    "provider": "vllm-perun",
    "displayName": "Perun · vLLM",
    "endpointId": "endpoint/perun/vllm",
    "runnerId": "runner/perun/vllm",
    "baseURL": "TUNNEL_ORIGIN",
    "location": "lan",
    "authType": "none",
    "models": [{
      "id": "qwen3.6-brain",
      "targetId": "deployment/perun/qwen3.6-brain"
    }]
  }]
}
```

- `authType: none` MUST omit `apiKey` and MUST use an IPv4 loopback literal endpoint.
- Non-loopback connections MUST use `authType: authorization` with a credential accepted by that endpoint; operators MUST protect connection documents containing keys.
- Network exposure beyond an authenticated tunnel MUST receive its own access-control and transport review.
- Each additional deployment MUST have its own provider alias and target IDs. Reusing the same served model ID on another host MUST NOT collapse the targets.
- Optional `contextWindow` values MUST come from reviewed configuration or observed runtime limits; missing limits MUST remain unknown.

## Explicit real-runtime check

Operators MUST supply the profile directory, connection document, provider alias, and selected model explicitly:

```sh
node packages/model-runtimes/vllm/examples/check-connection.mjs \
  "$PROFILE_DIRECTORY" "$CONNECTION_DOCUMENT" vllm-perun qwen3.6-brain
```

Reports MUST distinguish this fixed synthetic gateway check from isolated contract tests, desktop acceptance, managed setup, performance measurements, and standing sharing. The check MUST terminate its provider host; operators MUST separately close any tunnel they started.

To activate the same connection in an existing Core deployment, operators MUST use the existing provider-profile configuration path, bind `providerPlugins.vllm.config` to the connection document's contents, and preserve unrelated provider settings. They MUST NOT switch a legacy deployment to plugin mode without provisioning its other required adapters.
