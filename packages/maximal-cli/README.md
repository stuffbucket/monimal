# Maximal command contract

`@maximal/maximal-cli` owns Maximal's transport-neutral command contract and
its conformance suites.

## Layers

1. Operations MUST declare Standard Schema validation and JSON Schema
   projection for input and output.
2. Operations MUST consume an injected `CommandContext`; they MUST NOT assume a
   shell, terminal, process-global stream, or MCP session exists.
3. Adapters MUST validate input and output through the declared schemas.
4. CLI, stdio, and MCP adapters MUST project the same operation semantics.
5. Conformance MUST be established at each layer before a product command uses
   that layer.

## Projections

One `CommandDefinition` MAY be registered in a live `CommandCatalog` and
projected without command-specific adapter code:

| Projection | Input | Success output | Failure output | Framing |
| --- | --- | --- | --- | --- |
| Direct | JavaScript value | `CommandOutcome` | `CommandOutcome` | In-process |
| CLI human | `argv`, inline JSON, or stdin JSON | Pretty JSON data on stdout | Code and message on stderr | Process |
| CLI `--json` | `argv`, inline JSON, or stdin JSON | Complete outcome on stdout | Complete outcome on stdout | One UTF-8 JSON document |
| JSON stdio | One invocation document | Complete outcome on stdout | Complete outcome on stdout | One UTF-8 JSON document |
| JSON Lines stdio | Invoke and cancel records | Completion-ordered outcomes | Completion-ordered outcomes | UTF-8 JSON Lines |
| MCP | MCP tool arguments | Text plus structured content | MCP tool error plus Maximal outcome metadata | SDK-owned JSON-RPC |

- The generic CLI form MUST accept exactly one command name.
- `--input <json>` and `--input=<json>` MUST provide inline object input.
- `--input -` MUST read one JSON object from stdin.
- Omitted `--input` MUST provide an empty object.
- `--json` MUST emit the complete stable command outcome on stdout.
- The generic CLI projection MUST NOT infer flat flags from arbitrary nested
  schemas.
- JSON, JSON Lines, and MCP JSON-RPC are distinct projections. JSON Lines MUST
  NOT be described as JSON-RPC, and Maximal MUST NOT own MCP framing.
- Catalog additions, replacements, and removals MUST be visible to long-lived
  JSON Lines and MCP projections.
- Independent JSON Lines invocations MAY complete out of input order.
- JSON Lines cancellation MUST address an invocation ID and MUST be
  cooperative through its `AbortSignal`.

## Streams

- Machine stdout MUST contain only result data or the selected framing
  protocol.
- Diagnostics and interactive presentation MUST use stderr.
- JSON and JSON Lines output MUST be UTF-8 without a byte-order mark and MUST
  terminate records with LF.
- JSON Lines input MUST accept LF and CRLF.
- JSON Lines input MUST accept UTF-8, UTF-8 with a byte-order mark, and
  byte-order-marked UTF-16LE or UTF-16BE.
- Record parsing MUST NOT depend on stream chunk boundaries.
- Record sizes MUST be bounded.
- Blank JSON Lines records MUST be rejected.
- Binary data MUST remain bytes in the operation layer. Text adapters MUST use
  an explicit encoding such as base64 rather than shell-dependent transcoding.

## PowerShell

- PowerShell 7 native pipelines SHOULD use UTF-8 JSON Lines.
- Windows PowerShell 5.1 file redirection MAY produce UTF-16LE with a
  byte-order mark; the JSON Lines decoder MUST accept that representation.
- Exact binary pipelines MUST bypass shell text cmdlets on every PowerShell
  version.
- Invocation MUST use an executable plus an argument array. Adapters MUST NOT
  construct shell command strings.

## Interaction

- An operation MUST request interaction through `InteractionProvider`.
- Non-interactive contexts MUST reject interaction with
  `MAXIMAL_INTERACTION_REQUIRED`.
- Machine output modes MUST be non-interactive unless the transport explicitly
  provides a protocol-level interaction capability.
- A prompt MUST have an equivalent explicit input field before automation can
  invoke the operation.

## Diagnostics and errors

- Diagnostic levels MUST be `trace`, `debug`, `info`, `warn`, `error`, or
  `fatal`.
- Diagnostic severity numbers MUST use the OpenTelemetry range starts 1, 5, 9,
  13, 17, and 21.
- Consumers MUST branch on stable error codes and MUST NOT branch on messages.
- Portable process exit codes MUST remain in the range 0 through 125.
- MCP adapters MUST represent operation failures as MCP tool errors and MUST
  leave process exit status to the MCP host.

## MCP

- MCP support MUST use the official Model Context Protocol SDK.
- Maximal MUST NOT implement a second MCP framing or lifecycle stack.
- MCP stdio servers MUST use the SDK's dual-era `serveStdio` boundary so one
  server factory supports modern discovery and legacy initialization.
- MCP tools MUST advertise the operation's projected input and output schemas.
- MCP structured output MUST equal the operation result.
- MCP command contexts MUST derive invocation identity from the protocol
  request ID.
- MCP tool failures MUST retain the complete command outcome under
  `_meta["dev.maximal.command/outcome"]`.
- MCP conformance MUST include discovery, successful invocation, invalid input,
  cancellation, modern stdio negotiation, and legacy stdio initialization.

## Toolchain and isolation

- Local commands MUST use the repository's mise-managed toolchain.
- Native tests MUST enter through the root test wrapper.
- Linux pipe and process conformance SHOULD be rerun through the repository's
  pinned Docker test boundary.
- Windows PowerShell behavior MUST be validated on the native Windows CI job;
  a Linux PowerShell container MUST NOT be treated as Windows PowerShell 5.1
  evidence.
- Native Windows conformance MUST create UTF-16LE input with Windows PowerShell
  5.1 and send its raw bytes through a child-process stdin pipe.
- Docker coverage of Windows-style encodings MUST be labeled emulation rather
  than native Windows evidence.
