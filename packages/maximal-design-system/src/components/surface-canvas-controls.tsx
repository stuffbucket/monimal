import { Menu } from '@base-ui/react/menu'
import { useEffect, useRef, useState } from 'react'

import {
  ChevronDownIcon,
  EyeIcon,
  PlusIcon,
} from '../icons'
import { Button, IconButton, ToggleButton } from '../primitives/button'
import {
  CANVAS_ZOOM,
  normalizeCanvasZoom,
  stepCanvasZoom,
} from '../utilities/canvas-zoom'
import { CollaboratorPopover } from './shell-overlays'
import { CompactControlCluster } from './control-cluster'

export interface ZoomMenuProps {
  value: number
  onValueChange: (value: number) => void
}

export function ZoomMenu({ value, onValueChange }: ZoomMenuProps) {
  const [pixelGrid, setPixelGrid] = useState(true)
  const [snapToPixelGrid, setSnapToPixelGrid] = useState(true)
  const [multiplayerCursors, setMultiplayerCursors] = useState(true)
  const [additionalLabels, setAdditionalLabels] = useState(true)
  const [comments, setComments] = useState(true)
  const [annotations, setAnnotations] = useState(true)

  const setBoundedZoom = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return
    onValueChange(normalizeCanvasZoom(nextValue))
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Canvas zoom, ${String(value)} percent`}
        className="maximal-zoom-trigger"
      >
        <span>{value}%</span>
        <ChevronDownIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          align="end"
          className="maximal-zoom-menu__positioner"
          sideOffset={4}
        >
          <Menu.Popup className="maximal-zoom-menu">
            <label className="maximal-zoom-menu__input">
              <span className="maximal-visually-hidden">Zoom percentage</span>
              <input
                inputMode="numeric"
                max={CANVAS_ZOOM.maximum}
                min={CANVAS_ZOOM.minimum}
                onChange={(event) => setBoundedZoom(Number(event.target.value))}
                type="number"
                value={value}
              />
              <span>%</span>
            </label>
            <div className="maximal-zoom-menu__separator" role="separator" />
            <Menu.Item
              className="maximal-zoom-menu__item"
              onClick={() => onValueChange(stepCanvasZoom(value, 1))}
            >
              <span>Zoom in</span>
              <kbd>⌘+</kbd>
            </Menu.Item>
            <Menu.Item
              className="maximal-zoom-menu__item"
              onClick={() => onValueChange(stepCanvasZoom(value, -1))}
            >
              <span>Zoom out</span>
              <kbd>⌘−</kbd>
            </Menu.Item>
            <Menu.Item
              className="maximal-zoom-menu__item"
              onClick={() => onValueChange(CANVAS_ZOOM.default)}
            >
              <span>Zoom to fit</span>
              <kbd>⇧1</kbd>
            </Menu.Item>
            {CANVAS_ZOOM.presets.map((preset) => (
              <Menu.Item
                className="maximal-zoom-menu__item"
                key={preset}
                onClick={() => onValueChange(preset)}
              >
                <span>Zoom to {preset}%</span>
                {preset === CANVAS_ZOOM.default ? <kbd>⌘0</kbd> : null}
              </Menu.Item>
            ))}
            <div className="maximal-zoom-menu__separator" role="separator" />
            <Menu.Item className="maximal-zoom-menu__item">
              <span>Pixel preview</span>
              <span aria-hidden="true">›</span>
            </Menu.Item>
            <ZoomCheckbox checked={pixelGrid} onCheckedChange={setPixelGrid}>
              Pixel grid
            </ZoomCheckbox>
            <ZoomCheckbox
              checked={snapToPixelGrid}
              onCheckedChange={setSnapToPixelGrid}
            >
              Snap to pixel grid
            </ZoomCheckbox>
            <Menu.Item className="maximal-zoom-menu__item">
              <span>Layout guides</span>
              <kbd>⇧G</kbd>
            </Menu.Item>
            <Menu.Item className="maximal-zoom-menu__item">
              <span>Rulers</span>
              <kbd>⇧R</kbd>
            </Menu.Item>
            <Menu.Item className="maximal-zoom-menu__item">
              <span>Outlines</span>
              <span aria-hidden="true">›</span>
            </Menu.Item>
            <ZoomCheckbox
              checked={multiplayerCursors}
              onCheckedChange={setMultiplayerCursors}
            >
              Multiplayer cursors
            </ZoomCheckbox>
            <ZoomCheckbox
              checked={additionalLabels}
              onCheckedChange={setAdditionalLabels}
            >
              Additional labels
            </ZoomCheckbox>
            <div className="maximal-zoom-menu__separator" role="separator" />
            <ZoomCheckbox checked={comments} onCheckedChange={setComments}>
              Comments
            </ZoomCheckbox>
            <ZoomCheckbox checked={annotations} onCheckedChange={setAnnotations}>
              Annotations
            </ZoomCheckbox>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function ZoomCheckbox({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: string
}) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      className="maximal-zoom-menu__item maximal-zoom-menu__checkbox"
      onCheckedChange={onCheckedChange}
    >
      <Menu.CheckboxItemIndicator
        className="maximal-zoom-menu__check"
        keepMounted
      />
      <span>{children}</span>
    </Menu.CheckboxItem>
  )
}

export interface SurfaceCanvasClusterProps extends ZoomMenuProps {
  compact?: boolean
}

export function SurfaceCanvasCluster({
  compact = false,
  value,
  onValueChange,
}: SurfaceCanvasClusterProps) {
  const content = (
    <>
      <CollaboratorPopover />
      {!compact ? (
        <div className="maximal-surface-cluster__modes" aria-label="Canvas mode" role="group">
          <ToggleButton selected type="button">Design</ToggleButton>
          <ToggleButton selected={false} type="button">Prototype</ToggleButton>
        </div>
      ) : null}
      <ZoomMenu onValueChange={onValueChange} value={value} />
      <Button variant="primary">Share</Button>
    </>
  )

  return compact ? (
    <CompactControlCluster
      className="maximal-compact-surface-cluster maximal-surface-cluster"
      label="Surface controls"
    >
      {content}
    </CompactControlCluster>
  ) : (
    <div className="maximal-surface-cluster">{content}</div>
  )
}

export interface PageControlsProps {
  color: string
  onColorChange: (color: string) => void
  visible: boolean
  onVisibleChange: (visible: boolean) => void
}

export function PageControls({
  color,
  onColorChange,
  visible,
  onVisibleChange,
}: PageControlsProps) {
  const [colorDraft, setColorDraft] = useState(color.slice(1).toUpperCase())
  const colorTextRef = useRef<HTMLInputElement>(null)
  const validColor = /^[0-9A-F]{6}$/.test(colorDraft)

  useEffect(() => {
    if (colorTextRef.current !== document.activeElement) {
      setColorDraft(color.slice(1).toUpperCase())
    }
  }, [color])

  const updateColorDraft = (nextDraft: string) => {
    const normalizedDraft = nextDraft.toUpperCase().replace(/^#/, '')
    setColorDraft(normalizedDraft)
    if (/^[0-9A-F]{6}$/.test(normalizedDraft)) {
      onColorChange(`#${normalizedDraft}`)
    }
  }

  return (
    <section className="maximal-page-controls" aria-labelledby="page-controls-title">
      <h3 id="page-controls-title">Page</h3>
      <div className="maximal-page-controls__row">
        <div
          aria-label="Content background color"
          className="maximal-page-controls__color"
          onClick={(event) => {
            if ((event.target as HTMLElement).matches('input[type="color"]')) return
            colorTextRef.current?.focus()
            colorTextRef.current?.select()
          }}
          role="group"
        >
          <span className="maximal-visually-hidden">Content background color</span>
          <input
            aria-label="Choose content background color"
            onChange={(event) => {
              const nextColor = event.target.value.toUpperCase()
              setColorDraft(nextColor.slice(1))
              onColorChange(nextColor)
            }}
            type="color"
            value={color}
          />
          <input
            aria-invalid={!validColor}
            aria-label="Content background hex color"
            maxLength={7}
            onChange={(event) => updateColorDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (validColor) event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setColorDraft(color.slice(1).toUpperCase())
                event.currentTarget.blur()
              }
            }}
            ref={colorTextRef}
            spellCheck={false}
            type="text"
            value={colorDraft}
          />
          <span className="maximal-page-controls__opacity">100%</span>
        </div>
        <IconButton
          aria-pressed={visible}
          className="maximal-page-controls__visibility"
          label={`${visible ? 'Hide' : 'Show'} content background`}
          onClick={() => onVisibleChange(!visible)}
          variant="toggle"
        >
          <EyeIcon />
        </IconButton>
      </div>
    </section>
  )
}

const COLOR_STYLES = [
  ['Americas Europe', 'sage'],
  ['EUR AMER IDC', 'coral'],
  ['EUR IDC', 'slate'],
  ['AMER IDC', 'sage'],
] as const

export function CanvasInspectorSections() {
  return (
    <div className="maximal-canvas-inspector">
      <section aria-labelledby="canvas-styles-title">
        <header>
          <h3 id="canvas-styles-title">Styles</h3>
          <IconButton label="Add style">
            <PlusIcon />
          </IconButton>
        </header>
        <h4>Color styles</h4>
        <ul>
          {COLOR_STYLES.map(([style, tone]) => (
            <li key={style}>
              <span data-color-style={tone} />
              {style}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="canvas-export-title">
        <header>
          <h3 id="canvas-export-title">Export</h3>
          <IconButton label="Add export">
            <PlusIcon />
          </IconButton>
        </header>
      </section>
      <section aria-labelledby="canvas-tools-title">
        <header>
          <h3 id="canvas-tools-title">Tools</h3>
        </header>
        <Button variant="secondary">Open ProtoFlow</Button>
      </section>
    </div>
  )
}
