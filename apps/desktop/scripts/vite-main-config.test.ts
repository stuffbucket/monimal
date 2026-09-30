import { describe, expect, it } from 'vitest'

import config from '../vite.main.config.mjs'

describe('main Vite configuration', () => {
  it('leaves native runtime packages external', () => {
    const external = config.build?.rollupOptions?.external

    expect(external).toEqual(expect.arrayContaining([
      'node-pty',
      'uiohook-napi',
    ]))
  })
})
