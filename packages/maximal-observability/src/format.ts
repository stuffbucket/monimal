export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value)
}

export function formatDuration(value: number | null): string {
  if (value === null) return "Not available"
  if (value < 1_000) return `${String(Math.round(value))} ms`
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`
}

export function formatBytes(value: number | null): string {
  if (value === null) return "Not available"
  if (value < 1_024) return `${String(value)} B`
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`
  return `${(value / 1_048_576).toFixed(1)} MB`
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
}

export function displayValue(value: string | number | null): string {
  return value === null ? "Not available" : String(value)
}
