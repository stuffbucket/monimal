export function exportTargets(exports: Record<string, unknown> | undefined): string[]
export function relativeImports(source: string): string[]
export function missingArtifacts(
  packageRoot: string,
  exports: Record<string, unknown> | undefined,
): string[]
export function verifyExports(packageRoot?: string): string[]