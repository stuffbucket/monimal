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
  TextInput,
} from "@maximal/maximal-electron/renderer"
import { useState } from "react"

import type {
  ProjectMapComment,
  ProjectMapMessage,
  ProjectMapTool,
} from "./model.ts"
import type { ProjectMapPage, ProjectMapPresence } from "./store.ts"

import { ProjectMapDiscussion } from "./ProjectMapDiscussion.tsx"

interface ToolEntry {
  tool: ProjectMapTool
  label: string
  shortcut: string
}

interface ProjectMapChromeProps {
  panelId: string
  query: string
  onQueryChange: (value: string) => void
  pages: Array<ProjectMapPage>
  pageId: string
  onPageChange: (pageId: string) => void
  onAddPage: () => void
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
  onAddComment: (body: string) => void
  onAddMessage: (body: string) => void
}

function PresenceActions({
  chrome,
  shareOpen,
  onShareOpenChange,
}: {
  chrome: ProjectMapChromeProps
  shareOpen: boolean
  onShareOpenChange: (open: boolean) => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const showSearch = () => {
    onShareOpenChange(false)
    chrome.onCommentsOpenChange(false)
    chrome.onChatOpenChange(false)
    setSearchOpen((current) => !current)
  }
  const showComments = () => {
    setSearchOpen(false)
    onShareOpenChange(false)
    chrome.onChatOpenChange(false)
    chrome.onCommentsOpenChange(!chrome.commentsOpen)
  }
  const showChat = () => {
    setSearchOpen(false)
    onShareOpenChange(false)
    chrome.onCommentsOpenChange(false)
    chrome.onChatOpenChange(!chrome.chatOpen)
  }
  const showShare = () => {
    setSearchOpen(false)
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
      {searchOpen ?
        <TextInput
          aria-label="Search projects"
          value={chrome.query}
          placeholder="Search projects"
          onChange={chrome.onQueryChange}
        />
      : null}
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
  onShareOpenChange,
}: {
  chrome: ProjectMapChromeProps
  shareOpen: boolean
  onShareOpenChange: (open: boolean) => void
}) {
  return (
    <SpatialCanvasTopBar>
      <SpatialCanvasCorner>
        <Menu
          trigger={
            <SpatialCanvasHeaderAction kind="menu" label="Maximal menu" />
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
          pages={chrome.pages}
          activePageId={chrome.pageId}
          panelId={chrome.panelId}
          onPageChange={chrome.onPageChange}
          onAddPage={chrome.onAddPage}
        />
      </SpatialCanvasCorner>
      <PresenceActions
        chrome={chrome}
        shareOpen={shareOpen}
        onShareOpenChange={onShareOpenChange}
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

  return (
    <>
      <MapHeader
        chrome={chrome}
        shareOpen={shareOpen}
        onShareOpenChange={setShareOpen}
      />
      <MapControls chrome={chrome} />
      {chrome.commentsOpen ?
        <ProjectMapDiscussion
          kind="comments"
          comments={chrome.comments}
          messages={chrome.messages}
          onClose={() => chrome.onCommentsOpenChange(false)}
          onToggleComment={chrome.onToggleComment}
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
