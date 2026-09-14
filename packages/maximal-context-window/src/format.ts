export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value)
}

/**
 * Formats a token count compactly (e.g. "8.2K", "200K", "1.2M") regardless
 * of magnitude, for use in space-constrained capacity summaries.
 */
export function formatTokensCompact(value: number | null): string {
  if (value === null) return "Not available"
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatPercent(value: number | null): string {
  if (value === null) return "Not available"
  const percentage = value * 100
  return `${percentage < 10 ? percentage.toFixed(1) : String(Math.round(percentage))}%`
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
}
