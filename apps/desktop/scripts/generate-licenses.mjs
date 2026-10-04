import { resolve } from 'node:path'

import { renderPlainTextLicenses } from './render-license-bundle.mjs'

await renderPlainTextLicenses(resolve(import.meta.dirname, '..'))
