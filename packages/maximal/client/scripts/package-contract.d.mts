/** Types for the plain-Node native package contract. */

export declare function admitsTarget(
  list: readonly string[] | string | undefined,
  value: string,
): boolean;

export interface PlatformPackage {
  path: string;
  os?: readonly string[] | string;
  cpu?: readonly string[] | string;
}

export interface PlatformPackageDecision {
  path: string;
  keep: boolean;
  reason: string;
}

export declare function platformPackagePlan(
  packages: readonly PlatformPackage[],
  platform: string,
  arch: string,
): PlatformPackageDecision[];

export interface PackageContractIo {
  readPackageJson: (dir: string) =>
    | { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
    | undefined;
  join: (...parts: string[]) => string;
  basename: (path: string) => string;
  /** Through symlinks, because Node resolves a package from its real path. */
  realpath: (path: string) => string;
  sep: string;
}

/** Every package the external modules reach, and where each one really is. */
export declare function externalClosure(
  io: PackageContractIo,
  nodeModules: string,
  roots: readonly string[],
  options?: { boundary?: string },
): { name: string; dir: string; path: string }[];

export declare function hoistedDependencies(
  io: PackageContractIo,
  nodeModules: string,
  roots: readonly string[],
  options?: { boundary?: string },
): string[];
