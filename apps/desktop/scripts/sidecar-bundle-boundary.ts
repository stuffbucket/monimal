// Concrete provider runtimes load as external plugins; none may be compiled
// into the sidecar.
const FORBIDDEN_INPUT_MARKERS = [
  '/packages/model-runtimes/anthropic/',
  '/packages/model-runtimes/omlx/',
  '/../anthropic-provider/',
  '/../omlx/',
  '/@maximal/anthropic-provider/',
  '/@maximal/omlx/',
  '/@deepseek-ai/dsh-llm/',
  '/@deepseek-ai/schemastery/',
  '/@maximal+anthropic-provider@',
  '/@maximal+omlx@',
  '/@deepseek-ai+dsh-llm@',
  '/@deepseek-ai+schemastery@',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeInput(input: string): string {
  return `/${input.replaceAll('\\', '/').replace(/^\.?\//u, '')}`
}

export function assertGenericProviderBundle(metafile: unknown): void {
  if (!isRecord(metafile) || !isRecord(metafile.inputs)) {
    throw new TypeError('Bun did not produce a valid build metafile.')
  }
  const forbidden = Object.keys(metafile.inputs).filter((input) => {
    const normalized = normalizeInput(input)
    return FORBIDDEN_INPUT_MARKERS.some((marker) => normalized.includes(marker))
  })
  if (forbidden.length > 0) {
    throw new Error(
      `Concrete or external provider runtime code entered the Maximal bundle:\n${forbidden.join('\n')}`,
    )
  }
}
