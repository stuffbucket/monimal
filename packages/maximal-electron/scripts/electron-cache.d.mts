/**
 * Types for `electron-cache.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately. This
 * declaration exists so the unit tests keep their types without dragging the
 * script into a build step.
 */

export interface ElectronDownload {
  version: string;
  platform: string;
  arch: string;
}

export interface CacheRootInput {
  platform: string;
  home: string;
  env: Record<string, string | undefined>;
}

export declare function defaultCacheRoot(input: CacheRootInput): string;
export declare function resolveCacheRoot(input: CacheRootInput): string;

export declare function cacheKeys(text: string): string[];
export declare function keyOmissions(key: string): string[];

export declare function parseDownload(name: string): ElectronDownload | undefined;

export declare function inspectCache(input: {
  names: string[];
  version: string;
  platform: string;
  arch: string;
}): {
  downloads: ElectronDownload[];
  wanted: ElectronDownload[];
};
