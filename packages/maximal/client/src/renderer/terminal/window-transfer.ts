import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  decodeTabTransfer,
  isTerminalPane,
  TAB_TRANSFER_MIME,
  terminalPaneSessionIds,
  type TerminalLaunchResult,
  type TerminalPane,
  type TabDetachPosition,
  type TabTransfer,
} from 'stuffbucket-electron/renderer'

import type { TerminalWindowRequest } from '../../shared/bridge-types'
import type { AppTab } from '../frame/AppFrame'

export interface DetachedTerminal {
  sessionId: string
  title: string
  canRunInBackground: boolean
  pane?: TerminalPane
}

export function readDetachedTerminal(): DetachedTerminal | undefined {
  const query = new URLSearchParams(window.location.search)
  const sessionId = query.get('terminalSessionId')
  if (!sessionId) return undefined
  const encodedPane = query.get('terminalPane')
  let pane: TerminalPane | undefined
  if (encodedPane) {
    try {
      const candidate: unknown = JSON.parse(encodedPane)
      if (isTerminalPane(candidate)) pane = candidate
    } catch {
      pane = undefined
    }
  }
  return {
    sessionId,
    title: query.get('terminalTitle') ?? 'Terminal',
    canRunInBackground: query.get('terminalCanRunInBackground') === 'true',
    ...(pane ? { pane } : {}),
  }
}

export function useTerminalWindowTransfer({
  tabs,
  setTabs,
  activeTab,
  setActiveTab,
  detachedWindow,
  initialTerminalTab,
  makeTerminalTab,
  onError,
}: {
  tabs: AppTab[]
  setTabs: Dispatch<SetStateAction<AppTab[]>>
  activeTab: string
  setActiveTab: Dispatch<SetStateAction<string>>
  detachedWindow?: DetachedTerminal
  initialTerminalTab?: AppTab
  makeTerminalTab: (result: TerminalLaunchResult) => AppTab
  onError: (message: string) => void
}) {
  const [frameId, setFrameId] = useState('')
  const tabsRef = useRef(tabs)
  const [panes] = useState(new Map<string, TerminalPane>(
    initialTerminalTab && detachedWindow?.pane
      ? [[initialTerminalTab.id, detachedWindow.pane]]
      : [],
  ))
  const [paneRevisions] = useState(new Map<string, number>())

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  const getTabs = useCallback(() => tabsRef.current, [])

  const terminalWindowRequest = useCallback((
    tab: AppTab,
    position: TabDetachPosition = {
      screenX: window.screenX + 100,
      screenY: window.screenY + 100,
    },
  ): TerminalWindowRequest | undefined => {
    if (tab.kind !== 'terminal' || !tab.sessionId) return undefined
    const pane = panes.get(tab.id)
    return {
      id: tab.sessionId,
      cols: 80,
      rows: 24,
      x: position.screenX,
      y: position.screenY,
      title: tab.title,
      canRunInBackground: tab.canRunInBackground ?? false,
      sessionIds: terminalPaneSessionIds(pane ?? { sessionId: tab.sessionId }),
      ...(pane ? { pane } : {}),
    }
  }, [panes])

  const receiveTab = useCallback((transfer: TabTransfer) => {
    if (!transfer.sessionId || frameId === '') return
    const existing = tabsRef.current.find((candidate) =>
      candidate.kind === 'terminal' && candidate.sessionId === transfer.sessionId)
    if (existing) {
      setActiveTab(existing.id)
      return
    }
    void window.maximal.terminal.redock({
      id: transfer.sessionId,
      cols: 80,
      rows: 24,
      x: window.screenX,
      y: window.screenY,
      sourceFrameId: transfer.sourceFrameId,
      targetFrameId: frameId,
      title: transfer.title ?? 'Terminal',
      canRunInBackground: transfer.canRunInBackground ?? false,
      sessionIds: transfer.pane
        ? terminalPaneSessionIds(transfer.pane)
        : [transfer.sessionId],
      pane: transfer.pane,
    }).then((moved) => {
      if (!moved) onError('The terminal could not be moved into this window.')
    }).catch(() => {
      onError('The terminal could not be moved into this window.')
    })
  }, [frameId, onError, setActiveTab])

  useEffect(() => {
    void window.maximal.terminal.frameId().then(setFrameId)
    const stopRedocked = window.maximal.terminal.onTabRedocked((message) => {
      const tab = makeTerminalTab({
        sessionId: message.id,
        label: message.title,
        canRunInBackground: message.canRunInBackground,
      })
      if (message.pane && isTerminalPane(message.pane)) panes.set(tab.id, message.pane)
      setTabs((current) => current.some((candidate) => candidate.id === tab.id)
        ? current
        : [...current, { ...tab, customTitle: true }])
      setActiveTab(tab.id)
    })
    const stopPaneChanged = window.maximal.terminal.onPaneChanged((message) => {
      const tab = tabsRef.current.find((candidate) =>
        candidate.kind === 'terminal' && candidate.sessionId === message.id)
      if (!tab || !isTerminalPane(message.pane)) return
      if (message.revision <= (paneRevisions.get(tab.id) ?? 0)) return
      panes.set(tab.id, message.pane)
      paneRevisions.set(tab.id, message.revision)
      setTabs((current) => [...current])
    })
    return () => {
      stopRedocked()
      stopPaneChanged()
    }
  }, [makeTerminalTab, paneRevisions, panes, setActiveTab, setTabs])

  useEffect(() => {
    if (detachedWindow && !tabs.some((tab) => tab.kind === 'terminal')) window.close()
  }, [detachedWindow, tabs])

  useEffect(() => {
    if (detachedWindow) {
      document.title = tabs.find((tab) => tab.id === activeTab)?.title ?? 'Terminal'
    }
  }, [activeTab, detachedWindow, tabs])

  useEffect(() => {
    if (detachedWindow || frameId === '') return
    const onDragOver = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes(TAB_TRANSFER_MIME)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
    const onDrop = (event: DragEvent): void => {
      const encoded = event.dataTransfer?.getData(TAB_TRANSFER_MIME)
      if (!encoded) return
      const transfer = decodeTabTransfer(encoded)
      if (!transfer || transfer.sourceFrameId === frameId) return
      event.preventDefault()
      receiveTab(transfer)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [detachedWindow, frameId, receiveTab])

  return {
    frameId,
    getTabs,
    panes,
    paneRevisions,
    receiveTab,
    terminalWindowRequest,
  }
}
