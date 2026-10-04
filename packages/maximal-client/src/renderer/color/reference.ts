/*
 * Reference ramps sampled from Figma's published colour system, steps 100 to
 * 1000. Each entry is the swatch's centre pixel averaged over 7x7 pixels; light
 * blue 500 samples as #0b99ff against Figma's published #0d99ff, so a value is
 * within about two sRGB units of its source.
 *
 * Step 500 is the anchor of every ramp: it carries the most chroma in every
 * hue and in both modes. The ramps in ./ramps.ts are calculated from an anchor
 * and these profiles, so this table is calibration data, not a palette.
 */
export const REFERENCE_HUES = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'violet', 'teal', 'persimmon'] as const
export type ReferenceHue = (typeof REFERENCE_HUES)[number]
export const REFERENCE_PALE_HUES = ['blue', 'purple', 'pink', 'red', 'yellow', 'green', 'violet', 'teal', 'persimmon'] as const satisfies readonly ReferenceHue[]
export type ReferencePaleHue = (typeof REFERENCE_PALE_HUES)[number]
export type ReferenceRamp = readonly [string, string, string, string, string, string, string, string, string, string]

const LIGHT: Record<ReferenceHue | 'grey', ReferenceRamp> = {
  grey: ['#f5f5f5', '#e6e6e6', '#d9d9d9', '#b3b3b3', '#757575', '#444444', '#383838', '#2c2c2c', '#1e1e1e', '#111111'],
  blue: ['#f2f9ff', '#e5f5ff', '#bde3ff', '#81caff', '#0b99ff', '#037be5', '#0668cf', '#044ac1', '#093077', '#0c193f'],
  purple: ['#f9f5ff', '#f1e5ff', '#e4ccff', '#dab8ff', '#9847ff', '#8638e5', '#7c2bda', '#681abb', '#4b0d87', '#2d0f46'],
  pink: ['#fef1fe', '#ffe0fc', '#ffbdf2', '#ff99e0', '#ff25bd', '#ea0eac', '#cb0b96', '#971272', '#5f114c', '#451138'],
  red: ['#fff5f5', '#ffe2e0', '#ffc7c2', '#ffafa3', '#f24722', '#dc3412', '#bd2914', '#9f1e18', '#771107', '#660e0b'],
  orange: ['#fff4e5', '#ffe0c2', '#fcd29c', '#ffc470', '#fea629', '#fc9e24', '#f79722', '#dd7c0d', '#ce7010', '#8a4810'],
  yellow: ['#fffbeb', '#fff1c2', '#ffe8a3', '#ffd966', '#ffcd2a', '#ffc219', '#fab914', '#eba610', '#de940f', '#b86200'],
  green: ['#ebffee', '#cff7d3', '#aff4c5', '#84e0a3', '#13ae5c', '#009951', '#008043', '#036839', '#034626', '#093a23'],
  violet: ['#f5f5ff', '#ebebff', '#d4d1ff', '#b5b2ff', '#4e49fc', '#443deb', '#3d32e2', '#3620df', '#2f15ac', '#1d1254'],
  teal: ['#ebfcff', '#cdf0f8', '#b6ecf7', '#75d7f0', '#00a2c2', '#0087a7', '#047195', '#095a78', '#0a3c53', '#0e2f43'],
  persimmon: ['#fff2eb', '#ffdfcb', '#ffbb9e', '#ffa27a', '#ff5c15', '#e24c0b', '#c53e0d', '#aa370c', '#842d0c', '#611d0a'],
}

const DARK: Record<ReferenceHue | 'grey', ReferenceRamp> = {
  grey: ['#f5f5f5', '#e6e6e6', '#d9d9d9', '#b3b3b3', '#757575', '#444444', '#383838', '#2c2c2c', '#1e1e1e', '#111111'],
  blue: ['#e2f1fd', '#cfe9fc', '#a7d7fa', '#7cc4f8', '#0c8ce9', '#086ec2', '#0e5cad', '#184591', '#1b335f', '#171e36'],
  purple: ['#f1e7fe', '#e2cffc', '#d6b6fb', '#d0a8ff', '#8a38f5', '#7a2dd6', '#652ca8', '#50297a', '#3d2654', '#1f1924'],
  pink: ['#fee2fb', '#fccaf8', '#fbb1ed', '#fd9be1', '#f317b0', '#d01b9c', '#96207a', '#68275e', '#45253e', '#241a21'],
  red: ['#fee7e7', '#fccdca', '#fabdb6', '#fca397', '#e03e19', '#c4381c', '#963323', '#7c2622', '#54211c', '#311817'],
  orange: ['#ffedd8', '#fdd9b5', '#fcc67f', '#fcb34a', '#de7d04', '#c86f03', '#ad5f05', '#985305', '#673807', '#371d07'],
  yellow: ['#fdf7dd', '#fbe8ad', '#f9df90', '#f7d15f', '#f3c11c', '#f2b50f', '#e4a712', '#c58012', '#925711', '#714410'],
  green: ['#ddfde2', '#beeec2', '#a0e8b9', '#79d297', '#188f51', '#088348', '#085c34', '#094c2d', '#092618', '#0b1e15'],
  violet: ['#f5f5ff', '#e6e5ff', '#cdccff', '#b9b8ff', '#3d38f5', '#3b34d5', '#382cc9', '#3927be', '#302579', '#1d1835'],
  teal: ['#ddf7fd', '#bce6f1', '#a4e2ef', '#67cbe4', '#067691', '#067691', '#0b5b76', '#0d455a', '#0d2937', '#0e1f2a'],
  persimmon: ['#ffe8db', '#fed2b8', '#ffb494', '#ffa27a', '#f65009', '#db4607', '#b94012', '#8e3210', '#59220d', '#43160a'],
}

/* The reference publishes one pale set for both modes. */
const PALE: Record<ReferencePaleHue, ReferenceRamp> = {
  blue: ['#f1f5f8', '#e3ecf2', '#d1dae4', '#aebccf', '#667899', '#536383', '#4a5878', '#394360', '#262d41', '#121721'],
  purple: ['#f5f1f8', '#ede7f3', '#e0d5ed', '#c5b2dc', '#7f699b', '#6b5884', '#604d75', '#473956', '#33293d', '#1a141f'],
  pink: ['#f7eef4', '#f2e3ee', '#e8cee1', '#dbaace', '#ab5998', '#85517a', '#724667', '#51344a', '#33252f', '#1b1318'],
  red: ['#faedeb', '#f8e5e2', '#f3cfc9', '#eba99d', '#d4593b', '#a65440', '#874537', '#60332a', '#412621', '#1f1514'],
  yellow: ['#fff5eb', '#feeece', '#f4dfa7', '#e8cd7d', '#ad7f00', '#906800', '#7a5800', '#5c4100', '#3a2a10', '#211a12'],
  green: ['#f1f8f2', '#daecdf', '#c4e0cc', '#9fc1aa', '#678e79', '#5d806d', '#517361', '#486656', '#2f483c', '#182b23'],
  violet: ['#f1f1f8', '#e7e7f3', '#d4d4ed', '#b3b2dc', '#6a699b', '#595884', '#4e4d75', '#393956', '#29293e', '#14141f'],
  teal: ['#f1f6f8', '#e3eef3', '#cedfe4', '#a3c2cc', '#518394', '#436c7a', '#3c606e', '#2f4c56', '#1f3138', '#101a1e'],
  persimmon: ['#faefea', '#f8e9e2', '#f3d6c9', '#ebb49d', '#d3693b', '#a55e40', '#864e36', '#603a2a', '#412b21', '#1f1714'],
}

export const REFERENCE_RAMPS = {
  light: LIGHT,
  dark: DARK,
} as const

export const REFERENCE_PALE_RAMPS = PALE

/* Opacity of #ffffff and #000000 at each step, identical in both modes. */
export const REFERENCE_WHITE_ALPHA = [0.05, 0.1, 0.2, 0.4, 0.7, 0.8, 0.85, 0.9, 0.95, 1] as const
export const REFERENCE_BLACK_ALPHA = [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 0.85, 0.9, 0.95, 1] as const
