export function isRuntimeExecPath(execPath: string): boolean {
  const basename =
    execPath
      .split(/[/\\]/u)
      .pop()
      ?.toLowerCase()
      .replace(/\.exe$/u, "") ?? ""
  return basename === "bun" || basename === "node"
}

export function resolveMainScript(): string | undefined {
  // casts-keep: Bun is an optional runtime global and is absent under Node.
  const bunMain = (globalThis as { Bun?: { main?: string } }).Bun?.main
  if (typeof bunMain === "string" && bunMain.length > 0) return bunMain
  return process.argv[1]
}
