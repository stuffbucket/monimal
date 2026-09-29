import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { checkMutationReport } from '../../../scripts/mutation-report.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const MUTANT_FLOOR = 268
export const IGNORED_CEILING = 0

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMutationReport({
    root,
    mutantFloor: MUTANT_FLOOR,
    ignoredCeiling: IGNORED_CEILING,
    allowEmptyStatic: true,
    reportDirectory: process.env.MONIMAL_MUTATION_REPORT_DIRECTORY,
  })
}
