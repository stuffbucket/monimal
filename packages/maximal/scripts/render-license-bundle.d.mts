export interface LicenseBundleOptions {
  fallbackPath?: string | null
  outputPath?: string
  sbomPath?: string
}

export function renderPlainTextLicenses(
  packageRoot: string,
  options?: LicenseBundleOptions,
): Promise<void>