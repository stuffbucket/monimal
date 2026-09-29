import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  checkMutationScope,
  mutationScope as scopeOf,
} from '../../../scripts/mutation-scope.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFERRED = new Map()

export const mutationScope = () =>
  scopeOf({ root, roots: ['src'], deferred: DEFERRED })

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMutationScope({ root, roots: ['src'], deferred: DEFERRED })
}
