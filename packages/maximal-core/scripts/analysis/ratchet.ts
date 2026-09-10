export function ratchetChanges(
  current: string[],
  recorded: string[],
): { added: string[]; gone: string[] } {
  const currentSet = new Set(current)
  const recordedSet = new Set(recorded)
  return {
    added: current.filter((identity) => !recordedSet.has(identity)),
    gone: recorded.filter((identity) => !currentSet.has(identity)),
  }
}