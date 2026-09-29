const ADDED_VIA_LABEL = {
  'device-code': 'Added with device flow',
  'gh-cli': 'GitHub CLI',
  migration: 'Migrated account',
} as const

export function addedViaLabel(addedVia: keyof typeof ADDED_VIA_LABEL): string {
  return ADDED_VIA_LABEL[addedVia]
}