const ADDED_VIA_LABEL = {
  'device-code': 'Signed in here',
  'gh-cli': 'GitHub CLI',
  migration: 'Migrated account',
} as const

export function addedViaLabel(addedVia: keyof typeof ADDED_VIA_LABEL): string {
  return ADDED_VIA_LABEL[addedVia]
}