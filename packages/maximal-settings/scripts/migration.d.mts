export function scanSettingsReaders(options: {
  root: string
  patterns?: Array<string>
}): Record<string, number>
export function compareSettingsReaders(
  current: Record<string, number>,
  approved: Record<string, number>,
): { added: Array<string>; removed: Array<string> }
