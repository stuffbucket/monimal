import { Globe, Map as MapIcon, Minus, Plus, RotateCcw, SquareTerminal, X } from 'lucide-react'
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type WheelEvent,
} from 'react'
import { Dialog } from '@maximal/maximal-electron/renderer'

import type { AppTab } from '../frame/AppFrame'
import { workspaceMap, type WorkspaceMapPoint } from './model'

interface Viewport {
  x: number
  y: number
  scale: number
}

const INITIAL_VIEWPORT: Viewport = { x: 120, y: 110, scale: 0.9 }

export function WorkspaceMap({
  open,
  tabs,
  panes,
  onOpenChange,
  onFocus,
}: {
  open: boolean
  tabs: AppTab[]
  panes: ReadonlyMap<string, import('@maximal/maximal-terminal/renderer').TerminalPane>
  onOpenChange: (open: boolean) => void
  onFocus: (id: string) => void
}): ReactElement {
  const graph = useMemo(() => workspaceMap(tabs, panes), [panes, tabs])
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT)
  const [positions, setPositions] = useState<Record<string, WorkspaceMapPoint>>({})
  const interaction = useRef<{
    mode: 'node' | 'pan'
    id?: string
    startX: number
    startY: number
    origin: WorkspaceMapPoint
  } | undefined>(undefined)

  const point = (id: string): WorkspaceMapPoint =>
    positions[id] ?? graph.nodes.find((node) => node.id === id)?.position ?? { x: 0, y: 0 }

  const move = (event: PointerEvent<HTMLElement>): void => {
    const active = interaction.current
    if (!active) return
    const dx = event.clientX - active.startX
    const dy = event.clientY - active.startY
    if (active.mode === 'pan') {
      setViewport((current) => ({
        ...current,
        x: active.origin.x + dx,
        y: active.origin.y + dy,
      }))
    } else if (active.id) {
      setPositions((current) => ({
        ...current,
        [active.id!]: {
          x: active.origin.x + dx / viewport.scale,
          y: active.origin.y + dy / viewport.scale,
        },
      }))
    }
  }

  const end = (event: PointerEvent<HTMLElement>): void => {
    interaction.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const zoom = (next: number): void => {
    setViewport((current) => ({ ...current, scale: Math.min(2.5, Math.max(0.25, next)) }))
  }

  const wheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      zoom(viewport.scale * Math.exp(-event.deltaY * 0.002))
      return
    }
    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workspace map"
      description="A spatial map of terminals and associated browser tabs."
      className="workspace-map"
      overlayClassName="workspace-map__scrim"
      modal={false}
      testId="workspace-map"
    >
      <header className="workspace-map__header">
        <MapIcon size={16} />
        <strong>Workspace map</strong>
        <span className="workspace-map__hint">Grab to pan · ⌘/Ctrl+wheel to zoom · double-click to focus</span>
        <button className="workspace-map__action" type="button" aria-label="Zoom out" onClick={() => zoom(viewport.scale / 1.2)}><Minus size={16} /></button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <button className="workspace-map__action" type="button" aria-label="Zoom in" onClick={() => zoom(viewport.scale * 1.2)}><Plus size={16} /></button>
        <button className="workspace-map__action" type="button" aria-label="Reset map" onClick={() => {
          setViewport(INITIAL_VIEWPORT)
          setPositions({})
        }}><RotateCcw size={16} /></button>
        <button className="workspace-map__action" type="button" aria-label="Close map" onClick={() => onOpenChange(false)}><X size={16} /></button>
      </header>
      <div
        className="workspace-map__viewport"
        onWheel={wheel}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return
          event.currentTarget.setPointerCapture(event.pointerId)
          interaction.current = {
            mode: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            origin: { x: viewport.x, y: viewport.y },
          }
        }}
        onPointerMove={move}
        onPointerUp={end}
      >
        <div
          className="workspace-map__plane"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
        >
          <svg className="workspace-map__edges" width="4000" height="3000" aria-hidden="true">
            {graph.edges.map((edge) => {
              const from = point(edge.from)
              const to = point(edge.to)
              return <line key={`${edge.from}:${edge.to}`} x1={from.x + 110} y1={from.y + 54} x2={to.x + 110} y2={to.y + 54} />
            })}
          </svg>
          {graph.nodes.map((node) => {
            const position = point(node.id)
            const Icon = node.kind === 'terminal' ? SquareTerminal : Globe
            return (
              <button
                key={node.id}
                type="button"
                className="workspace-map__node"
                data-kind={node.kind}
                style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                onDoubleClick={() => {
                  onFocus(node.id)
                  onOpenChange(false)
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  interaction.current = {
                    mode: 'node',
                    id: node.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    origin: position,
                  }
                }}
                onPointerMove={move}
                onPointerUp={end}
              >
                <Icon size={16} />
                <span>
                  <strong>{node.title}</strong>
                  <small>{node.detail}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}
