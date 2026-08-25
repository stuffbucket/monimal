// src/lib/start/boot-status.ts
import { z } from "zod";
var BOOT_STATUS_MARKER = "@@MAXIMAL_STATUS@@";
function emitBootStatus(message) {
  if (!process.env.MAXIMAL_SIDECAR_PARENT_PID) return;
  process.stdout.write(`${BOOT_STATUS_MARKER} ${message}
`);
}
var READY_MARKER = "@@MAXIMAL_READY@@";
var READY_LINE_VERSION = 1;
var port = z.number().int().min(0).max(65535);
var readyLineSchema = z.object({
  /**
   * Schema version — see `READY_LINE_VERSION`. Always **>= 1**: a running engine
   * always states its version, and this bound is what keeps the synthesised
   * `v: 0` of a normalised legacy line from validating as a current one.
   *
   * Do **not** widen this to `min(0)` to make a parser's return type fit. Emit
   * and parse are different contracts — `ParsedReadyLine` is the one with the
   * wider version — and widening here would let the engine emit a `v: 0` line
   * that means "I am a pre-split engine", which is a lie on the wire rather than
   * just in a type.
   */
  v: z.number().int().min(1),
  /** The **control plane** port: JSON-RPC, subscriptions, config, auth. This is
   *  what a supervising host connects to. Load-bearing: a supervisor asks for
   *  port 0, so this is the only way it learns where to connect. */
  controlPort: port,
  /** The **public data plane** port serving `/v1` for third-party tools. Not
   *  necessarily the requested 4141 — a busy port falls back (maximal-core#10),
   *  so a host that wants to advertise this URL must read it here. */
  proxyPort: port,
  /** The sidecar's pid — the key a client uses to invalidate cached
   *  `server/discover` results when the process is replaced (maximal-core#8). */
  pid: z.number().int()
});
var readyLineV0Schema = z.object({ port, pid: z.number().int() }).transform((line) => ({
  v: 0,
  controlPort: line.port,
  proxyPort: line.port,
  pid: line.pid
}));
var anyReadyLineSchema = z.union([readyLineSchema, readyLineV0Schema]);
function emitReadyLine(ready) {
  if (!process.env.MAXIMAL_SIDECAR_PARENT_PID) return false;
  process.stdout.write(`${READY_MARKER} ${JSON.stringify(ready)}
`);
  return true;
}
var QUIT_REQUEST_MARKER = "@@MAXIMAL_QUIT@@";
function emitQuitRequest() {
  if (!process.env.MAXIMAL_SIDECAR_PARENT_PID) return false;
  process.stdout.write(`${QUIT_REQUEST_MARKER}
`);
  return true;
}
var UPDATE_REQUEST_MARKER = "@@MAXIMAL_UPDATE@@";
function emitUpdateRequest() {
  if (!process.env.MAXIMAL_SIDECAR_PARENT_PID) return false;
  process.stdout.write(`${UPDATE_REQUEST_MARKER}
`);
  return true;
}

export {
  BOOT_STATUS_MARKER,
  emitBootStatus,
  READY_MARKER,
  READY_LINE_VERSION,
  anyReadyLineSchema,
  emitReadyLine,
  QUIT_REQUEST_MARKER,
  emitQuitRequest,
  UPDATE_REQUEST_MARKER,
  emitUpdateRequest
};
