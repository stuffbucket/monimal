import {
  Button,
  Menu,
  Note,
  SpatialCanvasAvatar,
  SpatialCanvasControlGroup,
  SpatialCanvasCorner,
  SpatialCanvasFloatingPanel,
  SpatialCanvasHeaderAction,
  SpatialCanvasPages,
  SpatialCanvasPresence,
  SpatialCanvasSidePanel,
  SpatialCanvasToolButton,
  SpatialCanvasTopBar,
  SpatialCanvasZoomControls,
} from "@maximal/maximal-electron/renderer"
import { useEffect, useState } from "react"

import type {
  ProjectMapComment,
  ProjectMapMessage,
  ProjectMapProject,
  ProjectMapTool,
} from "./model.ts"
import type { ProjectMapPage, ProjectMapPresence } from "./store.ts"

import { ProjectMapDiscussion } from "./ProjectMapDiscussion.tsx"
import { ProjectMapSearchPanel } from "./ProjectMapSearchPanel.tsx"

interface ToolEntry {
  tool: ProjectMapTool
  label: string
  shortcut: string
}

interface ProjectMapChromeProps {
  panelId: string
  query: string
  onQueryChange: (value: string) => void
  projects: Array<ProjectMapProject>
  busy: boolean
  onOpenProject: (project: ProjectMapProject) => void
  projectName: string
  onProjectRename: (name: string) => void
  pages: Array<ProjectMapPage>
  pageId: string
  onPageChange: (pageId: string) => void
  onAddPage: () => void
  onPageRename: (pageId: string, name: string) => void
  onPageMove: (pageId: string, targetPageId: string) => void
  presence: Array<ProjectMapPresence>
  comments: Array<ProjectMapComment>
  activeCommentId?: string
  onSelectComment: (commentId: string) => void
  messages: Array<ProjectMapMessage>
  commentsOpen: boolean
  onCommentsOpenChange: (open: boolean) => void
  chatOpen: boolean
  onChatOpenChange: (open: boolean) => void
  onAddFolder: () => void
  tools: ReadonlyArray<ToolEntry>
  tool: ProjectMapTool
  onToolChange: (tool: ProjectMapTool) => void
  onOpenSettings: () => void
  error?: string
  zoom: number
  onZoom: (factor: number) => void
  onResetCamera: () => void
  onToggleComment: (commentId: string) => void
  onDeleteComment: (commentId: string) => void
  onAddComment: (body: string) => void
  onAddMessage: (body: string) => void
}

function PresenceActions({
  chrome,
  shareOpen,
  searchOpen,
  onShareOpenChange,
  onSearchOpenChange,
}: {
  chrome: ProjectMapChromeProps
  shareOpen: boolean
  searchOpen: boolean
  onShareOpenChange: (open: boolean) => void
  onSearchOpenChange: (open: boolean) => void
}) {
  const showSearch = () => {
    onShareOpenChange(false)
    chrome.onCommentsOpenChange(false)
    chrome.onChatOpenChange(false)
    onSearchOpenChange(!searchOpen)
  }
  const showComments = () => {
    onSearchOpenChange(false)
    onShareOpenChange(false)
    chrome.onChatOpenChange(false)
    chrome.onCommentsOpenChange(!chrome.commentsOpen)
  }
  const showChat = () => {
    onSearchOpenChange(false)
    onShareOpenChange(false)
    chrome.onCommentsOpenChange(false)
    chrome.onChatOpenChange(!chrome.chatOpen)
  }
  const showShare = () => {
    onSearchOpenChange(false)
    chrome.onCommentsOpenChange(false)
    chrome.onChatOpenChange(false)
    onShareOpenChange(!shareOpen)
  }

  return (
    <SpatialCanvasPresence>
      {chrome.presence.map((person) => (
        <SpatialCanvasAvatar
          key={person.viewId}
          initials={person.initials}
          color={person.color}
          title={`${person.name} · ${person.kind}`}
        />
      ))}
      <SpatialCanvasHeaderAction
        kind="search"
        label={searchOpen ? "Close project search" : "Search projects"}
        active={searchOpen}
        onClick={showSearch}
      />
      <SpatialCanvasHeaderAction
        kind="comments"
        label={`Comments (${chrome.comments.filter((comment) => !comment.resolved).length})`}
        active={chrome.commentsOpen}
        onClick={showComments}
      />
      <SpatialCanvasHeaderAction
        kind="chat"
        label="Chat"
        active={chrome.chatOpen}
        onClick={showChat}
      />
      <SpatialCanvasHeaderAction
        kind="share"
        label="Share"
        active={shareOpen}
        onClick={showShare}
      />
    </SpatialCanvasPresence>
  )
}

function MapHeader({
  chrome,
  shareOpen,
  searchOpen,
  onShareOpenChange,
  onSearchOpenChange,
}: {
  chrome: ProjectMapChromeProps
  shareOpen: boolean
  searchOpen: boolean
  onShareOpenChange: (open: boolean) => void
  onSearchOpenChange: (open: boolean) => void
}) {
  return (
    <SpatialCanvasTopBar>
      <SpatialCanvasCorner>
        <Menu
          trigger={
            <SpatialCanvasHeaderAction
              className="spatial-canvas__project-menu-trigger"
              kind="menu"
              label="Maximal menu"
            />
          }
          items={[
            {
              id: "add-folder",
              label: "Add project folder",
              onSelect: chrome.onAddFolder,
            },
            {
              id: "settings",
              label: "Project settings",
              onSelect: chrome.onOpenSettings,
            },
          ]}
        />
        <SpatialCanvasPages
          projectName={chrome.projectName}
          onProjectRename={chrome.onProjectRename}
          pages={chrome.pages}
          activePageId={chrome.pageId}
          panelId={chrome.panelId}
          onPageChange={chrome.onPageChange}
          onAddPage={chrome.onAddPage}
          onPageRename={chrome.onPageRename}
          onPageMove={chrome.onPageMove}
        />
      </SpatialCanvasCorner>
      <PresenceActions
        chrome={chrome}
        shareOpen={shareOpen}
        searchOpen={searchOpen}
        onShareOpenChange={onShareOpenChange}
        onSearchOpenChange={onSearchOpenChange}
      />
    </SpatialCanvasTopBar>
  )
}

function MapControls({ chrome }: { chrome: ProjectMapChromeProps }) {
  return (
    <>
      <SpatialCanvasControlGroup label="Project map tools">
        {chrome.tools.map((entry) => (
          <SpatialCanvasToolButton
            key={entry.tool}
            tool={entry.tool}
            label={entry.label}
            shortcut={entry.shortcut}
            active={chrome.tool === entry.tool}
            onClick={() => chrome.onToolChange(entry.tool)}
          />
        ))}
      </SpatialCanvasControlGroup>
      {chrome.error ?
        <SpatialCanvasFloatingPanel label="Map error">
          <Note status="failed" live="assertive">
            {chrome.error}
          </Note>
        </SpatialCanvasFloatingPanel>
      : null}
      <SpatialCanvasZoomControls
        zoom={chrome.zoom}
        onZoomOut={() => chrome.onZoom(1 / 1.2)}
        onReset={chrome.onResetCamera}
        onZoomIn={() => chrome.onZoom(1.2)}
      />
    </>
  )
}

export function ProjectMapChrome(chrome: ProjectMapChromeProps) {
  const [shareOpen, setShareOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (!chrome.commentsOpen && !chrome.chatOpen) return
    setSearchOpen(false)
    setShareOpen(false)
  }, [chrome.chatOpen, chrome.commentsOpen])

  return (
    <>
      <MapHeader
        chrome={chrome}
        shareOpen={shareOpen}
        searchOpen={searchOpen}
        onShareOpenChange={setShareOpen}
        onSearchOpenChange={setSearchOpen}
      />
      <MapControls chrome={chrome} />
      {searchOpen ?
        <ProjectMapSearchPanel
          query={chrome.query}
          projects={chrome.projects}
          busy={chrome.busy}
          onQueryChange={chrome.onQueryChange}
          onOpenProject={chrome.onOpenProject}
          onClose={() => setSearchOpen(false)}
        />
      : null}
      {chrome.commentsOpen ?
        <ProjectMapDiscussion
          kind="comments"
          comments={chrome.comments}
          messages={chrome.messages}
          onClose={() => chrome.onCommentsOpenChange(false)}
          onToggleComment={chrome.onToggleComment}
          onDeleteComment={chrome.onDeleteComment}
          {...(chrome.activeCommentId ?
            { activeCommentId: chrome.activeCommentId }
          : {})}
          onSelectComment={chrome.onSelectComment}
          onSubmit={chrome.onAddComment}
        />
      : null}
      {chrome.chatOpen ?
        <ProjectMapDiscussion
          kind="chat"
          comments={chrome.comments}
          messages={chrome.messages}
          onClose={() => chrome.onChatOpenChange(false)}
          onToggleComment={chrome.onToggleComment}
          onDeleteComment={chrome.onDeleteComment}
          onSelectComment={chrome.onSelectComment}
          onSubmit={chrome.onAddMessage}
        />
      : null}
      {shareOpen ?
        <SpatialCanvasSidePanel
          label="Share project map"
          title="Share project map"
          onClose={() => setShareOpen(false)}
        >
          <Note>Invite people, harnesses, and agents through the host.</Note>
          <Button size="sm" onClick={() => setShareOpen(false)}>
            Done
          </Button>
        </SpatialCanvasSidePanel>
      : null}
    </>
  )
}
