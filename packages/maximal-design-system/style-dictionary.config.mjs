import StyleDictionary from 'style-dictionary'
import { fileHeader, formattedVariables } from 'style-dictionary/utils'

const ELEVATION_LEVELS = [100, 200, 300, 400, 500]
const FORMAT = 'maximal/css-variables'
const FONT_FACE = `@font-face {
  font-family: 'Lil Grotesk';
  src: url('../../tokens/fonts/lil-grotesk-variable.woff2') format('woff2-variations');
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}`

function elevationAliases(mode, resolution) {
  return ELEVATION_LEVELS
    .map((level) => {
      const reference = `--${['elevation', 'reference', String(level), mode, resolution].join('-')}`
      return `  --elevation-${String(level)}: var(${reference});`
    })
    .join('\n')
}

StyleDictionary.registerFormat({
  name: FORMAT,
  format: async ({ dictionary, file, options }) => {
    const header = await fileHeader({ file })
    const variables = formattedVariables({
      format: 'css',
      dictionary,
      outputReferences: options.outputReferences,
      usesDtcg: true,
    })
    return `${header}${FONT_FACE}\n\n:root {\n${variables}\n}\n\n[data-theme='light'] {\n${elevationAliases('light', 'standard')}\n}\n\n[data-theme='dark'] {\n${elevationAliases('dark', 'standard')}\n}\n\n@media (max-resolution: 1dppx) {\n  :root,\n  [data-theme='dark'] {\n${elevationAliases('dark', 'low-resolution').replaceAll('  ', '    ')}\n  }\n\n  [data-theme='light'] {\n${elevationAliases('light', 'low-resolution').replaceAll('  ', '    ')}\n  }\n}\n`
  },
})

export default {
  usesDtcg: true,
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.css',
          format: FORMAT,
          options: { outputReferences: true },
        },
      ],
    },
    json: {
      transformGroup: 'js',
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested',
        },
      ],
    },
  },
}
