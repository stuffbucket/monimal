export declare const OPTIONAL_LLAMA_BACKENDS: readonly string[];
export declare const LLAMA_BACKENDS_VARIABLE: string;
export declare const LLAMA_WORKER_FILENAME: string;
export declare const LLAMA_SOURCE_INPUTS: readonly string[];

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
