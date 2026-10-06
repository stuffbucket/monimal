import { Popover } from '@base-ui/react/popover'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  AiIcon,
  BellIcon,
  ChevronDownIcon,
  CommentIcon,
  DesignIcon,
  FolderIcon,
  HandIcon,
  HelpIcon,
  MoveIcon,
  MinimizeIcon,
  PenIcon,
  PlusIcon,
  SearchIcon,
  SectionIcon,
  ShapesIcon,
  StampIcon,
  StickyIcon,
  TableIcon,
  TextIcon,
  WidgetIcon,
} from '../icons'
import { Button, ControlButton, IconButton } from '../primitives/button'
import { stepCanvasZoom } from './canvas-zoom'
import {
  CompactControlCluster,
  CompactControlGroup,
} from './control-cluster'
import type { TabBarItem } from './tab-bar'

export interface TabSearchProps {
  tabs: readonly TabBarItem[]
  activeTab: string
  onActiveTabChange: (tab: string) => void
}

export function TabSearch({
  tabs,
  activeTab,
  onActiveTabChange,
}: TabSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filteredTabs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return tabs
    return tabs.filter((tab) =>
      tab.label.toLocaleLowerCase().includes(normalizedQuery),
    )
  }, [query, tabs])

  const selectTab = (tab: string) => {
    onActiveTabChange(tab)
    setOpen(false)
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger
        aria-label="Search tabs"
        className="maximal-icon-button maximal-tab-search__trigger"
      >
        <FolderIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="maximal-tab-search__positioner"
          sideOffset={4}
        >
          <Popover.Popup className="maximal-tab-search">
            <label className="maximal-tab-search__input">
              <SearchIcon />
              <span className="maximal-visually-hidden">Search tabs</span>
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tabs"
                type="search"
                value={query}
              />
              <kbd>⇧⌘Y</kbd>
            </label>
            <section aria-labelledby="tabs-in-window-title">
              <h3 id="tabs-in-window-title">Tabs in this window</h3>
              <div className="maximal-tab-search__list">
                {filteredTabs.map((tab) => (
                  <ControlButton
                    aria-current={tab.id === activeTab ? 'page' : undefined}
                    key={tab.id}
                    onClick={() => selectTab(tab.id)}
                    type="button"
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </ControlButton>
                ))}
              </div>
            </section>
            <section aria-labelledby="recent-tabs-title">
              <h3 id="recent-tabs-title">Recently closed</h3>
              <div className="maximal-tab-search__list">
                <ControlButton type="button">
                  <DesignIcon />
                  <span>Design system exploration</span>
                  <kbd>⇧⌘T</kbd>
                </ControlButton>
                <ControlButton type="button">
                  <WidgetIcon />
                  <span>Workspace architecture</span>
                </ControlButton>
              </div>
            </section>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function CollaboratorPopover() {
  const [query, setQuery] = useState('')
  const people = ['Sage Green', 'Coral Rose', 'Morgan Slate']
  const visiblePeople = people.filter((person) =>
    person.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="View collaborators"
        className="maximal-surface-cluster__participants"
      >
        <span data-avatar="sage">SG</span>
        <span data-avatar="coral">CR</span>
        <span data-avatar="slate">MS</span>
        <ChevronDownIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          className="maximal-collaborators__positioner"
          sideOffset={4}
        >
          <Popover.Popup className="maximal-collaborators">
            <header>
              <span data-avatar="slate">MS</span>
              <strong>Morgan Slate (THEY / THEM)</strong>
            </header>
            <div className="maximal-collaborators__spotlight">
              <Button variant="primary">Spotlight me</Button>
              <IconButton label="Open audio settings">
                <AiIcon />
              </IconButton>
            </div>
            <label className="maximal-collaborators__search">
              <SearchIcon />
              <span className="maximal-visually-hidden">Find a collaborator</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find someone..."
                type="search"
                value={query}
              />
            </label>
            <section>
              <h3>Currently viewing</h3>
              {visiblePeople.map((person, index) => (
                <div className="maximal-collaborators__person" key={person}>
                  <span data-avatar={index === 0 ? 'sage' : index === 1 ? 'coral' : 'slate'}>
                    {person.split(' ').map((part) => part[0]).join('')}
                  </span>
                  <span>{person}</span>
                </div>
              ))}
            </section>
            <section>
              <h3>Previously viewed</h3>
              <div className="maximal-collaborators__person" data-muted>
                <span data-avatar="slate">JP</span>
                <span>Jannis Peponoulas<br /><small>9 hours ago</small></span>
              </div>
            </section>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export interface CanvasToolbarProps {
  showSecondary?: boolean
}

export function CanvasToolbar({
  showSecondary = true,
}: CanvasToolbarProps) {
  const [selectedTool, setSelectedTool] = useState('select')
  const [selectedColor, setSelectedColor] = useState('green')

  const toolButton = (
    id: string,
    label: string,
    icon: ReactNode,
  ) => (
    <IconButton
      aria-pressed={selectedTool === id}
      key={id}
      label={label}
      onClick={() => setSelectedTool(id)}
      selected={selectedTool === id}
    >
      {icon}
    </IconButton>
  )

  return (
    <div className="maximal-canvas-toolbars">
      {showSecondary ? (
        <CompactControlCluster
          className="maximal-canvas-toolbar maximal-canvas-toolbar--secondary"
          label="Tool colors"
        >
          {[
            'white',
            'grey',
            'persimmon',
            'orange',
            'yellow',
            'green',
            'teal',
            'blue',
            'purple',
            'pink',
          ].map((color) => (
            <ControlButton
              aria-label={`Use ${color}`}
              aria-pressed={selectedColor === color}
              className="maximal-canvas-toolbar__color"
              data-color={color}
              key={color}
              onClick={() => setSelectedColor(color)}
              type="button"
            >
              <span />
            </ControlButton>
          ))}
        </CompactControlCluster>
      ) : null}
      <CompactControlCluster
        className="maximal-canvas-toolbar maximal-canvas-toolbar--primary"
        label="Canvas tools"
      >
        <CompactControlGroup label="Selection and navigation tools">
          {toolButton('select', 'Select', <MoveIcon />)}
          {toolButton('hand', 'Hand tool', <HandIcon />)}
        </CompactControlGroup>
        <CompactControlGroup label="Creation tools">
          {toolButton('pen', 'Pen tool', <PenIcon />)}
          {toolButton('sticky', 'Sticky note', <StickyIcon />)}
          {toolButton('shapes', 'Shapes and connectors', <ShapesIcon />)}
        </CompactControlGroup>
        <CompactControlGroup label="Content tools">
          {toolButton('text', 'Text', <TextIcon />)}
          {toolButton('section', 'Section', <SectionIcon />)}
          {toolButton('table', 'Table', <TableIcon />)}
          {toolButton('stamp', 'Stamp', <StampIcon />)}
          {toolButton('comment', 'Comment', <CommentIcon />)}
          {toolButton('resources', 'Resources', <WidgetIcon />)}
          <IconButton label="More tools" variant="grounded">
            <PlusIcon />
          </IconButton>
        </CompactControlGroup>
      </CompactControlCluster>
    </div>
  )
}

export interface ShellStatusControlsProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  showNotification?: boolean
}

export function ShellStatusControls({
  zoom,
  onZoomChange,
  showNotification = true,
}: ShellStatusControlsProps) {
  const [notificationVisible, setNotificationVisible] = useState(true)

  return (
    <div className="maximal-shell-status-controls">
      {showNotification && notificationVisible ? (
        <div className="maximal-shell-notification" role="status">
          <BellIcon />
          <p>Turn on notifications for all comments in this file?</p>
          <div>
            <ControlButton onClick={() => setNotificationVisible(false)} type="button">
              Turn on
            </ControlButton>
            <ControlButton onClick={() => setNotificationVisible(false)} type="button">
              Dismiss
            </ControlButton>
          </div>
        </div>
      ) : null}
      <CompactControlCluster
        className="maximal-zoom-split"
        label="Canvas zoom controls"
      >
        <IconButton
          label="Zoom out"
          onClick={() => onZoomChange(stepCanvasZoom(zoom, -1))}
        >
          <MinimizeIcon />
        </IconButton>
        <IconButton
          label="Zoom in"
          onClick={() => onZoomChange(stepCanvasZoom(zoom, 1))}
        >
          <PlusIcon />
        </IconButton>
      </CompactControlCluster>
      <IconButton label="Help" variant="grounded">
        <HelpIcon />
      </IconButton>
    </div>
  )
}
