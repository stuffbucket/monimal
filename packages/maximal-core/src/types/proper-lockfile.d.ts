declare module "proper-lockfile" {
  interface RetryOptions {
    retries: number
    factor?: number
    minTimeout?: number
    maxTimeout?: number
    randomize?: boolean
  }

  interface LockOptions {
    stale?: number
    update?: number
    realpath?: boolean
    retries?: number | RetryOptions
    onCompromised?: (error: Error) => void
  }

  type AsyncRelease = () => Promise<void>
  type SyncRelease = () => void

  interface ProperLockfile {
    lock(filePath: string, options?: LockOptions): Promise<AsyncRelease>
    lockSync(filePath: string, options?: LockOptions): SyncRelease
  }

  const properLockfile: ProperLockfile
  export default properLockfile
}
