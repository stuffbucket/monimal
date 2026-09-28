import { resolve } from 'node:path'

import { renderPlainTextLicenses } from '../../../packages/maximal/scripts/render-license-bundle.mjs'

await renderPlainTextLicenses(resolve(import.meta.dirname, '../../../packages/maximal'), {
  outputPath: resolve(import.meta.dirname, '../THIRD-PARTY-LICENSES.txt'),
})
