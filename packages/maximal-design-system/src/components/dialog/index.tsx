import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ComponentPropsWithRef, ReactNode, RefObject } from 'react'

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
  testId?: string
  container?:
    | HTMLElement
    | ShadowRoot
    | RefObject<HTMLElement | ShadowRoot | null>
    | null
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
  testId,
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
      <BaseDialog.Portal container={container}>
        <BaseDialog.Backdrop
          className={[
            'maximal-dialog__backdrop',
            overlayClassName,
          ].filter(Boolean).join(' ')}
        />
        <BaseDialog.Viewport
          className={[
            'maximal-dialog__viewport',
            viewportClassName,
          ].filter(Boolean).join(' ')}
        >
          <BaseDialog.Popup
            aria-modal={modal === true ? true : undefined}
            className={['maximal-dialog', className].filter(Boolean).join(' ')}
            data-testid={testId}
            finalFocus={finalFocus}
            initialFocus={initialFocus}
            onKeyDown={onKeyDown}
          >
            <BaseDialog.Title
              className={[
                'maximal-dialog__title',
                !showTitle && 'maximal-visually-hidden',
              ].filter(Boolean).join(' ')}
            >
              {title}
            </BaseDialog.Title>
            {description ? (
              <BaseDialog.Description
                className={[
                  'maximal-dialog__description',
                  !showDescription && 'maximal-visually-hidden',
                ].filter(Boolean).join(' ')}
              >
                {description}
              </BaseDialog.Description>
            ) : null}
            {children}
            {modal ? (
              <BaseDialog.Close
                aria-label="Close dialog"
                className="maximal-visually-hidden"
              >
                Close dialog
              </BaseDialog.Close>
            ) : null}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
