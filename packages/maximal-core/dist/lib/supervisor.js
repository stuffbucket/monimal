import {
  BOOT_STATUS_MARKER,
  QUIT_REQUEST_MARKER,
  READY_MARKER,
  UPDATE_REQUEST_MARKER,
  anyReadyLineSchema
} from "./chunk-7GPE5USJ.js";

// src/lib/live/supervisor.ts
function withOutput(message, output) {
  const trimmed = output?.trim();
  return trimmed ? `${message}
${trimmed}` : message;
}
var SidecarReadyTimeoutError = class extends Error {
  constructor(timeoutMs, output) {
    super(
      withOutput(
        `Sidecar did not emit a ready-line within ${timeoutMs}ms`,
        output
      )
    );
    this.name = "SidecarReadyTimeoutError";
  }
};
var SidecarExitedError = class extends Error {
  constructor(output) {
    super(
      withOutput(
        "Sidecar stdout closed before it emitted a ready-line",
        output
      )
    );
    this.name = "SidecarExitedError";
  }
};
function parseReadyLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith(`${READY_MARKER} `)) return null;
  try {
    const parsed = anyReadyLineSchema.safeParse(
      JSON.parse(trimmed.slice(READY_MARKER.length + 1))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function parseBootStatus(line) {
  const withoutTerminator = line.replace(/\r?\n$/u, "");
  const prefix = `${BOOT_STATUS_MARKER} `;
  if (!withoutTerminator.startsWith(prefix)) return null;
  return withoutTerminator.slice(prefix.length);
}
var DEFAULT_READY_TIMEOUT_MS = 3e4;
function flushTrailing(buffer, onLine) {
  if (!onLine) return;
  for (const line of buffer.split("\n")) {
    if (line.trim()) onLine(line);
  }
}
async function awaitReadyLine(stdout, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new SidecarReadyTimeoutError(timeoutMs)),
      timeoutMs
    );
  });
  const scan = async () => {
    const decoder = new TextDecoder();
    const iterator = stdout[Symbol.asyncIterator]();
    let buffer = "";
    for (; ; ) {
      const next = await iterator.next();
      if (next.done === true) throw new SidecarExitedError();
      const chunk = next.value;
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const ready = parseReadyLine(line);
        if (ready) {
          flushTrailing(buffer, options.onLine);
          return ready;
        }
        if (line.trim()) options.onLine?.(line);
        newline = buffer.indexOf("\n");
      }
    }
  };
  try {
    return await Promise.race([scan(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function sidecarSpawnEnv(parentPid = process.pid) {
  return { MAXIMAL_SIDECAR_PARENT_PID: String(parentPid) };
}
export {
  BOOT_STATUS_MARKER,
  QUIT_REQUEST_MARKER,
  SidecarExitedError,
  SidecarReadyTimeoutError,
  UPDATE_REQUEST_MARKER,
  awaitReadyLine,
  parseBootStatus,
  parseReadyLine,
  sidecarSpawnEnv
};
