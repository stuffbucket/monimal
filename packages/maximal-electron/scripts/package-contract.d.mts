/**
 * Types for `package-contract.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/**
 * Fuse names, with the value the packaged binary must carry. Deliberately not
 * narrowed to the six names present: a seventh belongs in the module, not in
 * two places again.
 */
export declare const PACKAGE_FUSES: Readonly<Record<string, boolean>>;

export declare const RUNTIME_ICONS: readonly string[];

export declare function bundleIcon(platform: string): string;

export declare const OPTIONAL_LLAMA_BACKENDS: readonly string[];

export declare const LLAMA_BACKENDS_VARIABLE: string;

export declare function parseLlamaBackends(value: string | undefined): string[];

export declare function parseLlamaPackage(name: string): {
  os: string;
  arch: string;
  backend: string;
};

export interface LlamaPackageDecision {
  name: string;
  keep: boolean;
  reason: string;
}

export declare function llamaPackagePlan(
  present: readonly string[],
  platform: string,
  arch: string,
  backends: readonly string[],
): LlamaPackageDecision[];

export interface PackageContractIo {
  readPackageJson: (dir: string) => { dependencies?: Record<string, string> } | undefined;
  join: (...parts: string[]) => string;
}

export declare function hoistedDependencies(
  io: PackageContractIo,
  nodeModules: string,
  roots: readonly string[],
): string[];
