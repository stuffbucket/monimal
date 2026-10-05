export const ICON_SETS = {
  compact: {
    canvas: 16,
    count: 133,
    height: 3296,
    namespaces: ['icon.16'],
    source: 'compact/icons.sheet.svg',
    width: 5312,
  },
  prominent: {
    canvas: 24,
    count: 634,
    height: 6944,
    namespaces: ['icon.24', 'icon.16'],
    source: 'prominent/icons.sheet.svg',
    width: 8000,
  },
  'stroke-endpoints': {
    canvas: 16,
    count: 34,
    height: 1632,
    namespaces: ['icon.16.stroke'],
    source: 'stroke-endpoints/icons.sheet.svg',
    width: 3968,
  },
} as const

export type IconSetName = keyof typeof ICON_SETS
