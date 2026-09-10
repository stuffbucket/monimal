export interface LlamaPackageCheck {
  name: string;
  ok: boolean;
}

export interface LlamaPrebuild {
  name: string;
  files: readonly string[];
}

export interface LlamaPackageInput {
  packedFiles: readonly string[];
  unpackedFiles: readonly string[];
  platform: string;
  arch: string;
  backends?: readonly string[];
  prebuilds: readonly LlamaPrebuild[];
  workerSource: string;
}

export declare function llamaPackageChecks(
  input: LlamaPackageInput,
): LlamaPackageCheck[];
