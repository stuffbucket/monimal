export {
  acknowledgePty,
  copyPty,
  copyPtyOwnership,
  configurePty,
  defaultShell,
  discoverTerminalTargets,
  grantPtyProjection,
  killAllPtys,
  killPty,
  launchTerminal,
  listTerminalProfiles,
  listPtys,
  resizePty,
  spawnPty,
  stagePtyOwnership,
  syncPtyPane,
  transferPty,
  transferPtyOwnership,
  transferPtyProjection,
  writePty,
  type PtyOwnershipTransaction,
} from '../main/native/pty/index.js';

export {
  TERMINAL_PROGRAM,
  TERMINAL_SESSION_PREFIX,
} from '../main/terminal-identity.js';