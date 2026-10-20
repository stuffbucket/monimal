import type { Meta, StoryObj } from '@storybook/react-vite'
import { Folder, UserRound } from 'lucide-react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import {
  Combobox,
  Menu,
  MenuCheckboxItem,
  MenuFooter,
  MenuGroup,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuSubmenu,
} from '@maximal/maximal-design-system/components'
import { SearchIcon } from '@maximal/maximal-design-system/icons'
import { Button } from '@maximal/maximal-design-system/primitives'
import '@maximal/maximal-design-system/styles.css'
import './menu-stories.css'

const meta = {
  title: 'Components/Menu',
  component: Menu,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

const trigger = <Button>Open menu</Button>

export const Default: Story = {
  render: () => (
    <MenuRoot trigger={trigger}>
      <MenuItem trailing="⌘O">Open</MenuItem>
      <MenuItem trailing="⌘D">Duplicate</MenuItem>
      <MenuSeparator />
      <MenuSubmenu label="Move to">
        <MenuItem>Personal projects</MenuItem>
        <MenuItem>Team projects</MenuItem>
      </MenuSubmenu>
      <MenuItem disabled>Delete</MenuItem>
    </MenuRoot>
  ),
  play: async ({ canvasElement }) => {
    const triggerButton = within(canvasElement).getByRole('button', {
      name: 'Open menu',
    })

    await userEvent.click(triggerButton)
    const body = within(canvasElement.ownerDocument.body)
    const open = await body.findByRole('menuitem', { name: /Open/ })
    await userEvent.keyboard('{ArrowDown}')
    await expect(open).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect(triggerButton).toHaveFocus()
  },
}

export const OnOffStates: Story = {
  render: () => (
    <MenuRoot defaultOpen trigger={trigger}>
      <MenuCheckboxItem defaultChecked>Pixel preview</MenuCheckboxItem>
      <MenuCheckboxItem defaultChecked>Pixel grid</MenuCheckboxItem>
      <MenuCheckboxItem>Snap to pixel grid</MenuCheckboxItem>
      <MenuSeparator />
      <MenuCheckboxItem defaultChecked>Comments</MenuCheckboxItem>
      <MenuCheckboxItem>Prototypes</MenuCheckboxItem>
    </MenuRoot>
  ),
}

export const MultiSelect: Story = {
  render: () => (
    <MenuRoot defaultOpen trigger={trigger}>
      <MenuGroup label="Teams">
        <MenuCheckboxItem
          defaultChecked
          indicatorPosition="trailing"
          leading={<span className="maximal-story-menu-avatar">A</span>}
        >
          Team A
        </MenuCheckboxItem>
        <MenuCheckboxItem
          indicatorPosition="trailing"
          leading={<span className="maximal-story-menu-avatar">B</span>}
        >
          Team B
        </MenuCheckboxItem>
      </MenuGroup>
      <MenuGroup label="Organizations">
        <MenuCheckboxItem
          defaultChecked
          indicatorPosition="trailing"
          leading={<span className="maximal-story-menu-avatar maximal-story-menu-avatar--round">O</span>}
        >
          Org A
        </MenuCheckboxItem>
      </MenuGroup>
      <MenuFooter>
        <MenuItem className="maximal-menu-item--footer">Clear all</MenuItem>
      </MenuFooter>
    </MenuRoot>
  ),
}

const searchGroups = [
  {
    label: 'Projects',
    options: [{
      value: 'project',
      label: 'Project A',
      textValue: 'Project A',
      icon: <Folder aria-hidden size={16} />,
    }],
  },
  {
    label: 'People',
    options: [{
      value: 'person',
      label: 'Olivia Lai',
      textValue: 'Olivia Lai',
      icon: <UserRound aria-hidden size={16} />,
    }],
  },
] as const

export const SearchLead: Story = {
  render: () => (
    <Combobox
      groups={searchGroups}
      inline
      label="Projects, teams, or people"
      leading={<SearchIcon />}
      placeholder="Projects, teams, or people"
      showLabel={false}
    />
  ),
}

export const TrailVariations: Story = {
  render: () => (
    <MenuRoot defaultOpen trigger={trigger}>
      <MenuItem trailing="24">NY Designer</MenuItem>
      <MenuItem trailing="53">SF Designer</MenuItem>
      <MenuSeparator />
      <MenuItem
        leading={<span className="maximal-story-menu-avatar">A</span>}
        trailing={<span className="maximal-story-menu-badge">Menu</span>}
      >
        Acme Pro
      </MenuItem>
      <MenuSeparator />
      <MenuCheckboxItem
        defaultChecked
        indicatorPosition="trailing"
        trailing="24"
      >
        NY Designers
      </MenuCheckboxItem>
    </MenuRoot>
  ),
  play: async ({ canvasElement }) => {
    await expectNestedRow(canvasElement, '{Home}', 'NY Designer', 'Acme Pro')
    await expectNestedRow(canvasElement, '{End}', 'NY Designers', 'Acme Pro')

    const document = canvasElement.ownerDocument
    const menu = document.querySelector<HTMLElement>('.maximal-menu')
    if (menu === null) throw new Error('Menu popup did not render')
    const small = getComputedStyle(menu).getPropertyValue('--radius-small').trim()
    for (const selector of [
      '.maximal-story-menu-avatar',
      '.maximal-story-menu-badge',
    ]) {
      const element = document.querySelector<HTMLElement>(selector)
      if (element === null) throw new Error(`${selector} did not render`)
      await expectAllCorners(element, small)
    }
  },
}

export const HeadersAndRadioStates: Story = {
  render: () => (
    <MenuRoot defaultOpen trigger={trigger}>
      <MenuGroup label="Sort by">
        <MenuRadioGroup defaultValue="date">
          <MenuRadioItem value="date">Date</MenuRadioItem>
          <MenuRadioItem value="alphabetical">Alphabetical</MenuRadioItem>
          <MenuRadioItem value="unread">Unread</MenuRadioItem>
        </MenuRadioGroup>
      </MenuGroup>
      <MenuSeparator />
      <MenuGroup label="Filter">
        <MenuRadioGroup defaultValue="all">
          <MenuRadioItem value="all">All files</MenuRadioItem>
          <MenuRadioItem value="design">Design files</MenuRadioItem>
          <MenuRadioItem value="figjam">FigJam files</MenuRadioItem>
        </MenuRadioGroup>
      </MenuGroup>
    </MenuRoot>
  ),
}

export const Overflow: Story = {
  render: () => (
    <MenuRoot defaultOpen trigger={trigger}>
      {Array.from({ length: 40 }, (_, index) => (
        <MenuItem key={index}>Option {index + 1}</MenuItem>
      ))}
    </MenuRoot>
  ),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument
    const viewport = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.maximal-menu')
      if (element === null) throw new Error('Menu popup did not render')
      return element
    })
    const down = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.maximal-menu__scroll-arrow[data-direction="down"]')
      if (element === null) throw new Error('Down overflow row did not render')
      return element
    })

    const style = getComputedStyle(viewport)
    const borders = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
    await expect(viewport.offsetWidth - viewport.clientWidth - borders).toBe(0)
    await expect(document.querySelector('.maximal-menu__scroll-arrow[data-direction="up"]')).toBeNull()
    await expect(getComputedStyle(down).backgroundColor).toBe(getComputedStyle(viewport).backgroundColor)
    await userEvent.hover(down)
    await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0))
    const up = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.maximal-menu__scroll-arrow[data-direction="up"]')
      if (element === null) throw new Error('Up overflow row did not render')
      return element
    })
    await expect(getComputedStyle(up).backgroundColor).toBe(getComputedStyle(viewport).backgroundColor)
    await userEvent.unhover(down)
    viewport.scrollTop = 0
    await waitFor(() => expect(
      document.querySelector('.maximal-menu__scroll-arrow[data-direction="up"]'),
    ).toBeNull())
  },
}

const nestingRows = (
  <>
    <MenuItem trailing="⌘O">Open</MenuItem>
    <MenuItem trailing="⌘D">Duplicate</MenuItem>
    <MenuSeparator />
    <MenuItem>Rename</MenuItem>
    <MenuItem>Move to trash</MenuItem>
  </>
)

async function expectAllCorners(element: HTMLElement, expected: string) {
  const style = getComputedStyle(element)
  for (const corner of [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomLeftRadius,
    style.borderBottomRightRadius,
  ]) {
    await expect(corner).toBe(expected)
  }
}

async function expectNestedRow(
  canvasElement: HTMLElement,
  key: string,
  name: string,
  middleName = 'Rename',
) {
  const body = within(canvasElement.ownerDocument.body)
  const menu = await body.findByRole('menu')
  menu.focus()
  await userEvent.keyboard(key)
  const label = await body.findByText(name, { exact: true })
  const row = label.closest<HTMLElement>('.maximal-menu-item')
  if (row === null) throw new Error(`${name} did not render in a menu row`)
  await waitFor(() => expect(row).toHaveAttribute('data-highlighted'))
  const nested = getComputedStyle(menu).getPropertyValue('--radius-large-nested').trim()
  await expectAllCorners(row, nested)
  const middleLabel = await body.findByText(middleName, { exact: true })
  const middle = middleLabel.closest<HTMLElement>('.maximal-menu-item')
  if (middle === null) {
    throw new Error(`${middleName} did not render in a menu row`)
  }
  await expect(getComputedStyle(middle).borderTopLeftRadius)
    .toBe(getComputedStyle(menu).getPropertyValue('--radius-medium').trim())
}

export const LeadingRow: Story = {
  render: () => <MenuRoot defaultOpen trigger={trigger}>{nestingRows}</MenuRoot>,
  play: async ({ canvasElement }) => expectNestedRow(canvasElement, '{Home}', 'Open'),
}

export const TrailingRow: Story = {
  render: () => <MenuRoot defaultOpen trigger={trigger}>{nestingRows}</MenuRoot>,
  play: async ({ canvasElement }) => expectNestedRow(canvasElement, '{End}', 'Move to trash'),
}
