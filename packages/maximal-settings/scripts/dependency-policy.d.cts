export function verifyLockfile(lockfile: unknown): void
export function verifyPackage(manifest: unknown): unknown
export function readPackage(manifest: unknown): unknown
export const review: {
  schemaVersion: number
  packages: Record<
    string,
    {
      license: string
      integrity: string
      dependencies: Record<string, string>
      lifecycle: Record<string, string>
      reviewedTarballSha512?: string
    }
  >
}
