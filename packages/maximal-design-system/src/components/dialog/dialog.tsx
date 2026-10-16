import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ComponentPropsWithRef, ReactNode } from 'react'

import {
  DialogFrame,
  type DialogFramePopupProps,
  type DialogPortalContainer,
} from './dialog-frame'

export type { DialogFramePopupProps, DialogPortalContainer } from './dialog-frame'

type DialogRootProps = ComponentPropsWithRef<typeof BaseDialog.Root>
type DialogPopupProps = ComponentPropsWithRef<typeof BaseDialog.Popup>
type DialogChangeDetails = Parameters<
  NonNullable<DialogRootProps['onOpenChange']>
>[1]

export interface DialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  overlayClassName?: string
  viewportClassName?: string
  modal?: DialogRootProps['modal']
  disablePointerDismissal?: boolean
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onKeyDown?: DialogPopupProps['onKeyDown']
  onPointerDownOutside?: (event: Event) => void
  initialFocus?: DialogPopupProps['initialFocus']
  finalFocus?: DialogPopupProps['finalFocus']
  showTitle?: boolean
  showDescription?: boolean
  popupProps?: DialogFramePopupProps
  container?: DialogPortalContainer
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  overlayClassName,
  viewportClassName,
  modal = true,
  disablePointerDismissal = false,
  onEscapeKeyDown,
  onKeyDown,
  onPointerDownOutside,
  initialFocus,
  finalFocus,
  showTitle = false,
  showDescription = false,
  popupProps,
  container,
}: DialogProps) {
  const handleOpenChange = (nextOpen: boolean, details: DialogChangeDetails) => {
    if (!nextOpen && details.reason === 'escape-key') {
      onEscapeKeyDown?.(details.event as KeyboardEvent)
    }
    if (!nextOpen && details.reason === 'outside-press') {
      onPointerDownOutside?.(details.event)
    }
    if (details.event.defaultPrevented) details.cancel()
    if (!details.isCanceled) onOpenChange?.(nextOpen)
  }

  return (
    <BaseDialog.Root
      disablePointerDismissal={disablePointerDismissal}
      modal={modal}
      onOpenChange={handleOpenChange}
      open={open}
    >
      <DialogFrame
        className={className}
        container={container}
        description={description}
        finalFocus={finalFocus}
        initialFocus={initialFocus}
        modal={modal === true}
        onKeyDown={onKeyDown}
        overlayClassName={overlayClassName}
        popupProps={popupProps}
        showDescription={showDescription}
        showTitle={showTitle}
        title={title}
        viewportClassName={viewportClassName}
      >
        {children}
        {modal ? (
          <BaseDialog.Close
            aria-label="Close dialog"
            className="maximal-visually-hidden"
          >
            Close dialog
          </BaseDialog.Close>
        ) : null}
      </DialogFrame>
    </BaseDialog.Root>
  )
}
