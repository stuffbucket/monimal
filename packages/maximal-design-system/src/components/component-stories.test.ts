import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import * as componentSubpath from '@maximal/maximal-design-system/components'
import * as compositionSubpath from '@maximal/maximal-design-system/compositions'
import * as iconSubpath from '@maximal/maximal-design-system/icons'
import * as primitiveSubpath from '@maximal/maximal-design-system/primitives'
import * as utilitySubpath from '@maximal/maximal-design-system/utilities'

import * as packageRoot from '../index'
import * as componentBarrel from './index'

const standaloneComponents = [
  'Accordion',
  'AlertDialog',
  'Autocomplete',
  'Avatar',
  'Button',
  'Callout',
  'Card',
  'Checkbox',
  'Collapsible',
  'Combobox',
  'ContextMenu',
  'CopyButton',
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
  'Scrollbar',
  'Select',
  'Separator',
  'Slider',
  'Switch',
  'Tab',
  'Tabs',
  'TextInput',
  'Toast',
  'ToggleGroup',
  'Toolbar',
  'Tooltip',
  'UnitValueInput',
] as const

const interactiveComponents = [
  'Accordion',
  'AlertDialog',
  'Autocomplete',
  'Button',
  'Callout',
  'Card',
  'Checkbox',
  'Collapsible',
  'Combobox',
  'ContextMenu',
  'CopyButton',
  'Dialog',
  'Field',
  'Menu',
  'Menubar',
  'NumberInput',
  'Popover',
  'Radio',
  'RadioGroup',
  'ScrollArea',
  'Scrollbar',
  'Select',
  'Slider',
  'Switch',
  'Tab',
  'Tabs',
  'TextInput',
  'Toast',
  'ToggleGroup',
  'Toolbar',
  'Tooltip',
  'UnitValueInput',
] as const

const workspaceShellStory = 'Spikes/Base UI/Workspace Shell'
const iconStory = 'Foundations/Icons'

const publicRuntimeCatalog: Record<string, string | null> = {
  Accordion: 'Components/Accordion',
  AiIcon: iconStory,
  AlertDialog: 'Components/AlertDialog',
  Autocomplete: 'Components/Autocomplete',
  Avatar: 'Components/Avatar',
  BellIcon: iconStory,
  Button: 'Components/Button',
  Callout: 'Components/Callout',
  CanvasInspectorSections: workspaceShellStory,
  CanvasToolbar: workspaceShellStory,
  Card: 'Components/Card',
  Checkbox: 'Components/Checkbox',
  ChevronDownIcon: iconStory,
  CloseIcon: iconStory,
  CodeIcon: iconStory,
  CollaboratorPopover: workspaceShellStory,
  CommandIcon: iconStory,
  CommentIcon: iconStory,
  Collapsible: 'Components/Collapsible',
  Combobox: 'Components/Combobox',
  CompactControlCluster: workspaceShellStory,
  CompactControlGroup: workspaceShellStory,
  CompactProjectCluster: workspaceShellStory,
  ContextMenu: 'Components/ContextMenu',
  ControlButton: 'Components/Button',
  CopyButton: 'Components/CopyButton',
  DesignIcon: iconStory,
  Dialog: 'Components/Dialog',
  EdgeResizer: workspaceShellStory,
  EyeIcon: iconStory,
  Field: 'Components/Field',
  Fieldset: 'Components/Fieldset',
  FolderIcon: iconStory,
  GridIcon: iconStory,
  HandIcon: iconStory,
  HelpIcon: iconStory,
  HomeIcon: iconStory,
  Icon: 'Components/Icon',
  IconButton: 'Components/Button',
  InspectorPanel: 'Components/InspectorPanel',
  MaximalMarkIcon: iconStory,
  MaximizeIcon: iconStory,
  Menu: 'Components/Menu',
  MenuCheckboxItem: 'Components/Menu',
  MenuFooter: 'Components/Menu',
  MenuGroup: 'Components/Menu',
  MenuItem: 'Components/Menu',
  MenuItemContent: 'Components/Menu',
  MenuRadioGroup: 'Components/Menu',
  MenuRadioItem: 'Components/Menu',
  MenuRoot: 'Components/Menu',
  MenuSeparator: 'Components/Menu',
  MenuSubmenu: 'Components/Menu',
  Menubar: 'Components/Menubar',
  MinimizeIcon: iconStory,
  MoveIcon: iconStory,
  NumberInput: 'Components/NumberInput',
  PageControls: workspaceShellStory,
  PenIcon: iconStory,
  PersonIcon: iconStory,
  PlayIcon: iconStory,
  Popover: 'Components/Popover',
  PlusIcon: iconStory,
  Property: 'Components/PropertyList',
  PropertyList: 'Components/PropertyList',
  ProjectDetails: workspaceShellStory,
  ProjectNavigation: workspaceShellStory,
  Radio: 'Components/Radio',
  RadioGroup: 'Components/RadioGroup',
  ScrollArea: 'Components/ScrollArea',
  Scrollbar: 'Components/Scrollbar',
  SearchIcon: iconStory,
  Select: 'Components/Select',
  Separator: 'Components/Separator',
  SectionIcon: iconStory,
  SettingsIcon: iconStory,
  ShellStatusControls: workspaceShellStory,
  Sidebar: workspaceShellStory,
  SidebarIcon: iconStory,
  SidebarSection: workspaceShellStory,
  SidebarSectionSplit: workspaceShellStory,
  Slider: 'Components/Slider',
  ShapesIcon: iconStory,
  StampIcon: iconStory,
  StickyIcon: iconStory,
  StatusChip: 'Components/StatusChip',
  SubmenuIndicator: 'Components/ContextMenu',
  SurfaceCanvasCluster: workspaceShellStory,
  Switch: 'Components/Switch',
  Tab: 'Components/Tab',
  TabBar: workspaceShellStory,
  TabSearch: workspaceShellStory,
  Tabs: 'Components/Tabs',
  TableIcon: iconStory,
  Terminal: workspaceShellStory,
  TextIcon: iconStory,
  TextInput: 'Components/TextInput',
  ToastProvider: 'Components/Toast',
  ToastViewport: 'Components/Toast',
  ToggleButton: 'Components/Button',
  ToggleGroup: 'Components/ToggleGroup',
  ToggleSidebar: workspaceShellStory,
  Toolbar: 'Components/Toolbar',
  ToolbarButton: 'Components/Toolbar',
  ToolbarGroup: 'Components/Toolbar',
  Tooltip: 'Components/Tooltip',
  UnitValueInput: 'Components/UnitValueInput',
  WindowControls: workspaceShellStory,
  WidgetIcon: iconStory,
  WorkspaceShell: workspaceShellStory,
  WorkspaceShellSpike: workspaceShellStory,
  ZoomMenu: workspaceShellStory,
  createToastManager: null,
  useToastManager: null,
}

describe('component stories', () => {
  const storyRoot = new URL('../../stories/', import.meta.url)
  const storyFiles = readdirSync(storyRoot, {
    encoding: 'utf8',
    recursive: true,
  }).filter((file) => file.endsWith('.stories.tsx'))
  const stories = storyFiles.map((file) => ({
    file,
    source: readFileSync(new URL(file, storyRoot), 'utf8'),
  }))

  it.each(standaloneComponents)('%s owns a state-complete Storybook entry', (component) => {
    const storyFile = storyFiles.find(
      (file) => file.split('/').at(-1) === `${component}.stories.tsx`,
    )

    expect(storyFile).toBeDefined()
    if (storyFile === undefined) throw new Error(`Missing ${component} stories`)

    const story = readFileSync(new URL(storyFile, storyRoot), 'utf8')
    expect(story).toContain(`title: 'Components/${component}'`)
    expect(story.match(/^export const \w+:/gm)?.length ?? 0).toBeGreaterThan(1)
  })

  it.each(interactiveComponents)('%s owns executable interaction evidence', (component) => {
    const story = stories.find(
      ({ file }) => file.split('/').at(-1) === `${component}.stories.tsx`,
    )

    expect(story, `Missing ${component} stories`).toBeDefined()
    expect(
      story?.source,
      `${component} needs a Storybook play function`,
    ).toMatch(/\bplay:\s*async\b/)
  })

  it('classifies every public runtime UI export and links it to owned evidence', () => {
    const runtimeExports = [
      ...Object.entries(componentSubpath),
      ...Object.entries(compositionSubpath),
      ...Object.entries(iconSubpath),
      ...Object.entries(primitiveSubpath),
    ]
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort()

    expect(runtimeExports).toEqual(Object.keys(publicRuntimeCatalog).sort())

    const storyTitles = stories.flatMap(({ source }) =>
      [...source.matchAll(/title: '([^']+)'/g)].map((match) => match[1]),
    )
    expect(new Set(storyTitles).size).toBe(storyTitles.length)

    for (const [name, owner] of Object.entries(publicRuntimeCatalog)) {
      if (owner === null) continue
      expect(
        storyTitles,
        `${name} must link to an existing Storybook entry`,
      ).toContain(owner)
    }
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
    expect(manifest)
      .toContain('"./compositions": "./src/compositions/index.ts"')
    expect(manifest)
      .toContain('"./primitives": "./src/primitives/index.ts"')
    expect(manifest)
      .toContain('"./utilities": "./src/utilities/index.ts"')
  })

  it('keeps runtime categories out of the component barrel', () => {
    expect(Object.hasOwn(componentBarrel, 'CANVAS_ZOOM')).toBe(false)
    expect(utilitySubpath).toHaveProperty('CANVAS_ZOOM')
    expect(primitiveSubpath).toHaveProperty('Button')
    expect(compositionSubpath).toHaveProperty('WorkspaceShell')

    for (const category of [
      compositionSubpath,
      primitiveSubpath,
      utilitySubpath,
    ]) {
      for (const [exportName, exported] of Object.entries(category)) {
        expect(
          Reflect.get(packageRoot, exportName),
          `${exportName} must retain its package-root export`,
        ).toBe(exported)
      }
    }
  })
})
