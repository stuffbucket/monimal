import { describe, expect, it } from 'vitest'
import type { ConfigEnv, PluginOption, UserConfig } from 'vite'

import configExport from '../vite.renderer.config.mjs'

const env = (command: ConfigEnv['command']): ConfigEnv => ({
  command,
  mode: 'development',
  isSsrBuild: false,
  isPreview: false,
})

async function configFor(command: ConfigEnv['command']): Promise<UserConfig> {
  if (typeof configExport !== 'function') {
    throw new TypeError('Renderer Vite config must vary by command')
  }
  return configExport(env(command))
}

function hasPlugin(options: PluginOption[] | undefined, name: string): boolean {
  return (options ?? []).some((option) => (
    option !== null
    && typeof option === 'object'
    && !Array.isArray(option)
    && 'name' in option
    && option.name === name
  ))
}

describe('renderer Vite configuration', () => {
  it('does not prebundle the linked renderer entrypoint', async () => {
    const config = await configFor('serve')

    expect(config.optimizeDeps?.exclude).toContain(
      'stuffbucket-electron/renderer',
    )
  })

  it('enables source inspection only for development servers', async () => {
    const serveConfig = await configFor('serve')
    const buildConfig = await configFor('build')

    expect(hasPlugin(serveConfig.plugins, 'react-click-to-component')).toBe(true)
    expect(hasPlugin(buildConfig.plugins, 'react-click-to-component')).toBe(false)
  })
})
