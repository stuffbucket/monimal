import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import * as componentSubpath from '@maximal/maximal-design-system/components'

import * as packageRoot from '../index'
import * as componentBarrel from './index'

const components = [
  'Accordion',
  'Autocomplete',
  'Avatar',
  'Callout',
  'Card',
  'Checkbox',
  'Collapsible',
  'ContextMenu',
  'Dialog',
  'Field',
  'Fieldset',
  'Icon',
  'Menu',
  'Menubar',
  'NumberInput',
  'Popover',
  'Radio',
  'RadioGroup',
  'ScrollArea',
  'Select',
  'Separator',
  'Slider',
  'Switch',
  'Tab',
  'Tabs',
  'Toast',
  'ToggleGroup',
  'Toolbar',
  'Tooltip',
  'UnitValueInput',
] as const

describe('component stories', () => {
  const storyFiles = readdirSync(new URL('.', import.meta.url), {
    encoding: 'utf8',
    recursive: true,
  }).filter((file) => file.endsWith('.stories.tsx'))

  it.each(components)('%s owns a state-complete Storybook entry', (component) => {
    const storyFile = storyFiles.find(
      (file) => file.split('/').at(-1) === `${component}.stories.tsx`,
    )

    expect(storyFile).toBeDefined()
    if (storyFile === undefined) throw new Error(`Missing ${component} stories`)

    const story = readFileSync(new URL(storyFile, import.meta.url), 'utf8')
    expect(story).toContain(`title: 'Components/${component}'`)
    expect(story.match(/^export const \w+:/gm)?.length ?? 0).toBeGreaterThan(1)
  })

  it('does not retain grouped component showcases', () => {
    for (const file of [
      'FormControls.stories.tsx',
      'NavigationControls.stories.tsx',
      'Overlays.stories.tsx',
      'Surfaces.stories.tsx',
    ]) {
      expect(storyFiles.some((storyFile) => storyFile.endsWith(file))).toBe(false)
    }
  })

  it('re-exports every component barrel symbol from the package root', () => {
    expect(Object.hasOwn(componentBarrel, 'ToastProvider')).toBe(true)
    expect(Object.hasOwn(componentBarrel, 'ToastViewport')).toBe(true)

    for (const [exportName, component] of Object.entries(componentBarrel)) {
      expect(
        Reflect.get(packageRoot, exportName),
        `${exportName} must retain its package-root export`,
      ).toBe(component)
      expect(
        Reflect.get(componentSubpath, exportName),
        `${exportName} must retain its components-subpath export`,
      ).toBe(component)
    }
  })

  it('publishes the component barrel as a package subpath', () => {
    const manifest = readFileSync(
      new URL('../../package.json', import.meta.url),
      'utf8',
    )

    expect(manifest)
      .toContain('"./components": "./src/components/index.ts"')
  })
})
