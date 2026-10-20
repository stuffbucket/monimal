import { CloseIcon, MaximizeIcon, MinimizeIcon } from '../icons'
import { IconButton } from '../primitives/button'

export interface WindowControlsProps {
  /** Reserves the controls' footprint for platform-drawn window buttons. */
  native?: boolean
  onClose?: () => void
  onMinimize?: () => void
  onMaximize?: () => void
}

export function WindowControls({
  native = false,
  onClose,
  onMinimize,
  onMaximize,
}: WindowControlsProps) {
  if (native) {
    return <div aria-hidden className="maximal-window-controls" data-native="" />
  }
  return (
    <div className="maximal-window-controls" role="group" aria-label="Window controls">
      <IconButton label="Close window" onClick={onClose}>
        <CloseIcon />
      </IconButton>
      <IconButton label="Minimize window" onClick={onMinimize}>
        <MinimizeIcon />
      </IconButton>
      <IconButton label="Maximize window" onClick={onMaximize}>
        <MaximizeIcon />
      </IconButton>
    </div>
  )
}
