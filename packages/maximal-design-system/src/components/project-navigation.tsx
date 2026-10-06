import { useState } from 'react'

import {
  AiIcon,
  ChevronDownIcon,
  CodeIcon,
  CommandIcon,
  DesignIcon,
  GridIcon,
  PlusIcon,
  SearchIcon,
  SidebarIcon,
} from '../icons'
import { ControlButton, IconButton } from '../primitives/button'
import { CompactControlCluster } from './control-cluster'
import { SidebarSection, SidebarSectionSplit } from './sidebar-sections'

interface ProjectPage {
  id: string
  label: string
}

const INITIAL_PAGES: readonly ProjectPage[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'workspace-shell', label: 'Workspace shell' },
  { id: 'load-balance', label: 'Load balance' },
  { id: 'share-our-view', label: 'Share our view' },
]
const INITIAL_SELECTED_PAGE_ID = 'cover'

const LAYERS = [
  '12 week',
  'Work work work work',
  '6 week',
  'Studio',
  'Tech area - old',
  'Group 2018784765',
  'Clémentine',
] as const

export interface ProjectNavigationProps {
  pagesHeight?: number
  onPagesHeightChange?: (height: number) => void
}

export function ProjectDetails() {
  return (
    <div className="maximal-sidebar-project-details">
      <div className="maximal-project-information">
        <div>
          <h3>Maximal workspace</h3>
          <p>Design system spike</p>
        </div>
      </div>
      <div className="maximal-project-status">
        <CodeIcon />
        <span>Ready for dev</span>
        <span>2</span>
      </div>
    </div>
  )
}

export function ProjectNavigation({
  pagesHeight,
  onPagesHeightChange,
}: ProjectNavigationProps) {
  const [pages, setPages] = useState<ProjectPage[]>(() =>
    INITIAL_PAGES.map((page) => ({ ...page })),
  )
  const [selectedPage, setSelectedPage] = useState(INITIAL_SELECTED_PAGE_ID)
  const [editingPage, setEditingPage] = useState<string>()
  const [pageNameDraft, setPageNameDraft] = useState('')

  const beginPageRename = (id: string, label: string) => {
    setSelectedPage(id)
    setEditingPage(id)
    setPageNameDraft(label)
  }

  const finishPageRename = () => {
    const nextName = pageNameDraft.trim()
    if (nextName) {
      setPages((currentPages) =>
        currentPages.map((page) =>
          page.id === editingPage ? { ...page, label: nextName } : page,
        ),
      )
    }
    setEditingPage(undefined)
  }

  return (
    <div className="maximal-project-navigation">
      <SidebarSectionSplit
        label="Resize Pages section"
        onPrimarySizeChange={onPagesHeightChange}
        primary={
          <SidebarSection
            actions={
              <>
                <IconButton label="Search pages">
                  <SearchIcon />
                </IconButton>
                <IconButton label="Add page">
                  <PlusIcon />
                </IconButton>
              </>
            }
            className="maximal-project-pages"
            leading={<ChevronDownIcon />}
            title="Pages"
          >
            <nav aria-label="Project pages">
              {pages.map((page) => (
                <div
                  className="maximal-project-page-row"
                  data-current={page.id === selectedPage ? '' : undefined}
                  data-editing={page.id === editingPage ? '' : undefined}
                  key={page.id}
                >
                  {page.id === editingPage ? (
                    <input
                      aria-label={`Rename ${page.label}`}
                      autoFocus
                      onBlur={finishPageRename}
                      onChange={(event) => setPageNameDraft(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          finishPageRename()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          setEditingPage(undefined)
                        }
                      }}
                      value={pageNameDraft}
                    />
                  ) : (
                    <ControlButton
                      aria-current={page.id === selectedPage ? 'page' : undefined}
                      onClick={() => setSelectedPage(page.id)}
                      onDoubleClick={() => beginPageRename(page.id, page.label)}
                      type="button"
                    >
                      <span>{page.label}</span>
                    </ControlButton>
                  )}
                </div>
              ))}
            </nav>
          </SidebarSection>
        }
        primarySize={pagesHeight}
        secondary={
          <SidebarSection
            className="maximal-project-content"
            scroll="horizontal"
            title="Content"
          >
            <div className="maximal-project-content__group">
              <h4>Maps</h4>
              <ControlButton type="button">
                <DesignIcon />
                <span>Workspace relationships</span>
              </ControlButton>
            </div>
            <div className="maximal-project-content__group">
              <h4>Layers</h4>
              {LAYERS.map((layer) => (
                <ControlButton key={layer} type="button">
                  <GridIcon />
                  <span>{layer}</span>
                </ControlButton>
              ))}
            </div>
            <div className="maximal-project-content__group">
              <h4>Resources</h4>
              <ControlButton type="button">
                <CommandIcon />
                <span>Commands</span>
              </ControlButton>
              <ControlButton type="button">
                <AiIcon />
                <span>Agent sessions</span>
              </ControlButton>
            </div>
          </SidebarSection>
        }
      />
    </div>
  )
}

export function CompactProjectCluster({ onOpen }: { onOpen: () => void }) {
  return (
    <CompactControlCluster
      className="maximal-compact-project-cluster"
      label="Project controls"
    >
      <div className="maximal-compact-project-cluster__identity">
        <DesignIcon />
        <span>Maximal workspace</span>
      </div>
      <IconButton label="Open sidebars" onClick={onOpen}>
        <SidebarIcon />
      </IconButton>
    </CompactControlCluster>
  )
}
