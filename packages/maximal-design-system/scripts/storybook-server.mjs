#!/usr/bin/env node

import { main } from '@maximal/maximal-storybook/storybook-server'

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
