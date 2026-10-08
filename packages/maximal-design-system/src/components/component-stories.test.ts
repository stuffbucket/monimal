import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
  it.each(components)('%s owns a state-complete Storybook entry', (component) => {
    const storyUrl = new URL(`${component}.stories.tsx`, import.meta.url)

    expect(existsSync(storyUrl)).toBe(true)

    const story = readFileSync(storyUrl, 'utf8')
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
      expect(existsSync(new URL(file, import.meta.url))).toBe(false)
    }
  })
})
