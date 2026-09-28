/** Renders an ISO timestamp as a locale-formatted date + time, or an em dash
 *  when the value is absent (some fields, e.g. `connected_since`, are
 *  optional — the account may predate that field being recorded). */
export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}