import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const hueFamilies = [
  {
    hue: 4,
    label: 'Crimson',
    names: [
      'Ember Mesa', 'Kyoto Maple', 'Ruby Camellia', 'Poppy Quarter',
      'Autumn Rowan', 'Coral Coast', 'Rose Granite', 'Dawn Azalea',
    ],
    sources: [
      'sunset over iron-rich mesas', 'Japanese maple leaves after rain',
      'camellia petals and lacquered wood', 'poppies against urban brick',
      'rowan berries in early autumn', 'coral shelves in clear coastal water',
      'rose granite mountain faces', 'azalea petals in first light',
    ],
  },
  {
    hue: 30,
    label: 'Amber',
    names: [
      'Volcanic Ochre', 'Namib Dune', 'Marigold Market', 'Citrus Arcade',
      'Autumn Persimmon', 'Copper Canyon', 'Terracotta Ridge', 'Desert Calendula',
    ],
    sources: [
      'ochre earth around volcanic fields', 'Namib dunes near sunset',
      'marigold garlands and market textiles', 'citrus stalls beneath shaded arcades',
      'ripe persimmon and autumn bark', 'oxidized copper and canyon walls',
      'terracotta rooflines on a dry ridge', 'calendula flowers after desert rain',
    ],
  },
  {
    hue: 55,
    label: 'Gold',
    names: [
      'Candlelit Ginkgo', 'Atlas Saffron', 'Golden Wattle', 'Marigold Courtyard',
      'Summer Sunflower', 'Alpine Larch', 'Pampas Gold', 'Spring Mimosa',
    ],
    sources: [
      'ginkgo leaves in warm evening light', 'saffron and Atlas mountain stone',
      'golden wattle against deep foliage', 'marigolds in a shaded courtyard',
      'sunflowers under high summer light', 'larch needles turning above the tree line',
      'pampas grass across an open plain', 'mimosa blossom in early spring',
    ],
  },
  {
    hue: 128,
    label: 'Leaf',
    names: [
      'Cedar Night', 'Moss Courtyard', 'Emerald Canopy', 'Monsoon Tea',
      'Bamboo Rain', 'Highland Meadow', 'Olive Grove', 'New Fern',
    ],
    sources: [
      'cedar silhouettes under a moonless sky', 'moss across shaded courtyard stone',
      'layered tropical forest canopy', 'tea terraces during monsoon season',
      'rain moving through bamboo leaves', 'highland grasses after snowmelt',
      'silver-green olive leaves in dry sun', 'new fern growth in diffuse light',
    ],
  },
  {
    hue: 182,
    label: 'Turquoise',
    names: [
      'Lagoon Night', 'Glacier Lake', 'Turquoise Tile', 'Island Tide',
      'Eucalyptus Mist', 'Patagonian Ice', 'Alpine Stream', 'Morning Lotus',
    ],
    sources: [
      'a sheltered lagoon after dark', 'mineral-blue water below a glacier',
      'turquoise glazed architectural tile', 'clear tide over pale volcanic sand',
      'mist through blue-green eucalyptus', 'blue ice fields in Patagonia',
      'snow-fed water over alpine stone', 'lotus leaves in cool morning light',
    ],
  },
  {
    hue: 220,
    label: 'Cobalt',
    names: [
      'Midnight Fjord', 'Seoul Rain', 'Cobalt Medina', 'Aegean Noon',
      'Blue Poppy', 'Blue Ridge', 'Canal Blue', 'Jacaranda Sky',
    ],
    sources: [
      'a deep fjord beneath winter night', 'rain-washed signs and asphalt in Seoul',
      'cobalt-painted lanes and geometric tile', 'Aegean water under clear noon light',
      'Himalayan blue poppy petals', 'layered mountain ridges at distance',
      'canal water reflecting painted facades', 'open sky behind jacaranda branches',
    ],
  },
  {
    hue: 270,
    label: 'Violet',
    names: [
      'Andes Twilight', 'Kyoto Iris', 'Amethyst Peak', 'Lavender Festival',
      'Wisteria Garden', 'Alpine Crocus', 'Lilac Stone', 'Violet Dawn',
    ],
    sources: [
      'high Andean slopes after sunset', 'iris petals beside dark garden water',
      'amethyst crystal and shadowed granite', 'lavender fields arranged in long rows',
      'wisteria blooms beneath a garden trellis', 'crocus flowers at the snow line',
      'lilac-gray stone in soft weather', 'violet light before sunrise',
    ],
  },
  {
    hue: 322,
    label: 'Magenta',
    names: [
      'Plum Night Market', 'Bougainvillea Dusk', 'Dragon Fruit Bloom', 'Fuchsia City Lights',
      'Peony Season', 'Rhododendron Pass', 'Orchid Mist', 'Cherry Blossom Rain',
    ],
    sources: [
      'dark plum fruit and night-market light', 'bougainvillea against a dusk wall',
      'dragon fruit skin and climbing blooms', 'fuchsia light across wet city streets',
      'peonies at the height of their season', 'rhododendrons along a mountain pass',
      'orchids emerging through greenhouse mist', 'cherry petals carried through rain',
    ],
  },
]

const cues = [
  { label: 'Nocturne', saturation: 34, lightness: 8, appearance: 'dark' },
  { label: 'Dusk', saturation: 46, lightness: 12, appearance: 'dark' },
  { label: 'Jewel', saturation: 60, lightness: 16, appearance: 'dark' },
  { label: 'Vivid', saturation: 68, lightness: 21, appearance: 'dark' },
  { label: 'Garden', saturation: 58, lightness: 76, appearance: 'light' },
  { label: 'Seasonal', saturation: 50, lightness: 80, appearance: 'light' },
  { label: 'Mineral', saturation: 42, lightness: 84, appearance: 'light' },
  { label: 'Luminous', saturation: 34, lightness: 87, appearance: 'light' },
]

const shaders = ['ink-wash', 'stardust', 'marble', 'halftone', 'cloth', 'water', 'paper', 'cel-sky']

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const section = ((hue % 360) + 360) % 360 / 60
  const x = chroma * (1 - Math.abs((section % 2) - 1))
  const [red, green, blue] =
    section < 1 ? [chroma, x, 0]
      : section < 2 ? [x, chroma, 0]
        : section < 3 ? [0, chroma, x]
          : section < 4 ? [0, x, chroma]
            : section < 5 ? [x, 0, chroma]
              : [chroma, 0, x]
  const match = l - chroma / 2
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('').toUpperCase()}`
}

function slug(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')
}

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(left, right) {
  const lighter = Math.max(luminance(left), luminance(right))
  const darker = Math.min(luminance(left), luminance(right))
  return (lighter + 0.05) / (darker + 0.05)
}

function accessibleAccent(hue, saturation, initialLightness, background, step) {
  let lightness = initialLightness
  let color = hslToHex(hue, saturation, lightness)
  while (contrastRatio(color, background) < 4.5 && lightness > 4 && lightness < 96) {
    lightness += step
    color = hslToHex(hue, saturation, lightness)
  }
  return color
}

function accessibleSurface(hue, saturation, initialLightness, text, step) {
  let lightness = initialLightness
  let color = hslToHex(hue, saturation, lightness)
  while (contrastRatio(color, text) < 7 && lightness > 4 && lightness < 96) {
    lightness += step
    color = hslToHex(hue, saturation, lightness)
  }
  return color
}

const themes = cues.flatMap((cue, cueIndex) =>
  hueFamilies.map((family, hueIndex) => {
    const dark = cue.appearance === 'dark'
    const accent = hslToHex(
      family.hue,
      Math.min(82, cue.saturation + 18),
      dark ? 72 : 24,
    )
    const companion = hslToHex(
      (family.hue + (cueIndex % 2 === 0 ? 32 : -28) + 360) % 360,
      Math.min(72, cue.saturation + 10),
      dark ? 58 : 34,
    )
    const name = family.names[cueIndex]
    const lightBackground = accessibleSurface(
      family.hue,
      dark ? Math.max(30, cue.saturation - 8) : cue.saturation,
      dark ? 86 : cue.lightness,
      '#0C0B10',
      1,
    )
    const lightSurface = accessibleSurface(
      family.hue,
      Math.max(20, cue.saturation - (dark ? 12 : 6)),
      dark ? 90 : cue.lightness + 4,
      '#0C0B10',
      1,
    )
    const darkBackground = accessibleSurface(
      family.hue,
      cue.saturation,
      dark ? cue.lightness : 11,
      '#FFF9F5',
      -1,
    )
    const darkSurface = accessibleSurface(
      family.hue,
      Math.max(24, cue.saturation - 8),
      dark ? cue.lightness + 5 : 16,
      '#FFF9F5',
      -1,
    )
    const lightAccent = accessibleAccent(
      family.hue,
      Math.min(78, cue.saturation + 12),
      28,
      lightBackground,
      -1,
    )
    const darkAccent = accessibleAccent(
      family.hue,
      Math.min(78, cue.saturation + 12),
      72,
      darkBackground,
      1,
    )
    const theme = {
      schema: 'https://maximal.dev/schemas/theme/v2',
      id: `board-${slug(name)}`,
      name,
      description: `${cue.label} ${family.label.toLowerCase()} balanced with an ${cueIndex % 2 === 0 ? 'analogous' : 'split-complementary'} supporting note.`,
      source: `Palette study inspired by ${family.sources[cueIndex]}`,
      category: cueIndex < 2
        ? 'heritage-inspired'
        : cueIndex < 5 ? 'nature' : 'studio',
      tags: [
        family.label.toLowerCase(),
        cue.label.toLowerCase(),
        ...name.toLowerCase().split(' '),
      ],
      appearance: cue.appearance,
      placement: { hue: hueIndex, cue: cueIndex },
      colors: {
        light: {
          background: lightBackground,
          surface: lightSurface,
          text: '#0C0B10',
          accent: lightAccent,
        },
        dark: {
          background: darkBackground,
          surface: darkSurface,
          text: '#FFF9F5',
          accent: darkAccent,
        },
      },
    }
    if (cueIndex === 1 || cueIndex === 5) {
      theme.shader = {
        material: shaders[hueIndex],
        strength: cueIndex === 1 ? 0.58 : 0.46,
        motion: cueIndex === 1 ? 0.24 : 0.16,
        gradient: {
          type: hueIndex % 2 === 0 ? 'radial' : 'linear',
          ...(hueIndex % 2 === 0 ? {} : { angle: 128 + hueIndex * 7 }),
          stops: [
            { color: accent, position: 0 },
            { color: companion, position: 52 },
            { color: dark ? darkBackground : lightBackground, position: 100 },
          ],
        },
      }
    }
    return theme
  }),
)

await writeFile(
  resolve(import.meta.dirname, '../src/renderer/themes/hue-board.json'),
  `${JSON.stringify(themes, null, 2)}\n`,
)
