import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog'
import { useRef, type ComponentPropsWithRef, type ReactNode } from 'react'

import { Button } from '../../primitives/button'
import {
  DialogFrame,
  type DialogFramePopupProps,
  type DialogPortalContainer,
} from './dialog-frame'

type AlertDialogRootProps = ComponentPropsWithRef<typeof BaseAlertDialog.Root>
type AlertDialogChangeDetails = Parameters<
  NonNullable<AlertDialogRootProps['onOpenChange']>
>[1]
type AlertDialogPopupProps = ComponentPropsWithRef<typeof BaseAlertDialog.Popup>

interface AlertDialogBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Always visible: states what happened or what is about to happen. */
  title: ReactNode
  /** Always visible and announced with the title. */
  description: ReactNode
  /** Supplementary content between the description and the responses. */
  children?: ReactNode
  /** Blocks every dismissal and disables the dismiss control while a response is running. */
  pending?: boolean
  /** Failure from the last response, announced as an alert. */
  error?: ReactNode
  className?: string
  finalFocus?: AlertDialogPopupProps['finalFocus']
  popupProps?: DialogFramePopupProps
  container?: DialogPortalContainer
}

/** Asks the user to choose between cancelling and one or more responses. */
export interface AlertDialogConfirmationProps extends AlertDialogBaseProps {
  /**
   * The primary response, placed last. Use a `primary` or `danger` `Button`,
   * and call `onOpenChange(false)` when its response completes.
   */
  action: ReactNode
  /**
   * Lower-priority responses, placed between Cancel and the primary response.
   * Use a lower-emphasis `Button` variant such as `secondary-danger` or `ghost`.
   */
  tertiaryActions?: ReactNode
  cancelLabel?: ReactNode
  /** Called when the dialog is cancelled by its cancel control or Escape. */
  onCancel?: () => void
  acknowledgeLabel?: never
  onAcknowledge?: never
}

/** Reports an outcome the user can only acknowledge. */
export interface AlertDialogAcknowledgementProps extends AlertDialogBaseProps {
  action?: never
  tertiaryActions?: never
  cancelLabel?: never
  onCancel?: never
  acknowledgeLabel?: ReactNode
  /** Called when the dialog is acknowledged by its control or Escape. */
  onAcknowledge?: () => void
}

export type AlertDialogProps =
  | AlertDialogConfirmationProps
  | AlertDialogAcknowledgementProps

/**
 * A modal that interrupts to confirm a consequential choice or to report an
 * outcome the user must acknowledge.
 *
 * Always modal and never dismissed by an outside press. A confirmation starts
 * focus on Cancel, its least destructive response; an acknowledgement, which
 * omits `action`, offers only OK and starts focus there. Escape takes the
 * dismiss response unless a response is pending.
 */
export function AlertDialog(props: AlertDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    children,
    pending = false,
    error,
    className,
    finalFocus,
    popupProps,
    container,
  } = props
  const dismissRef = useRef<HTMLButtonElement>(null)
  const acknowledgement = props.action === undefined
  const dismissLabel = acknowledgement
    ? props.acknowledgeLabel ?? 'OK'
    : props.cancelLabel ?? 'Cancel'
  const onDismiss = acknowledgement ? props.onAcknowledge : props.onCancel

  const handleOpenChange = (nextOpen: boolean, details: AlertDialogChangeDetails) => {
    if (!nextOpen && pending) {
      details.cancel()
      return
    }
    if (!nextOpen) onDismiss?.()
    onOpenChange(nextOpen)
  }

  return (
    <BaseAlertDialog.Root onOpenChange={handleOpenChange} open={open}>
      <DialogFrame
        className={['maximal-alert-dialog', className].filter(Boolean).join(' ')}
        container={container}
        description={description}
        finalFocus={finalFocus}
        initialFocus={dismissRef}
        modal
        popupProps={{ ...popupProps, 'aria-busy': pending || undefined }}
        showDescription
        showTitle
        title={title}
      >
        {children}
        {error ? (
          <p className="maximal-alert-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="maximal-alert-dialog__actions">
          <BaseAlertDialog.Close
            disabled={pending}
            ref={dismissRef}
            render={(
              <Button variant={acknowledgement ? 'primary' : 'secondary'}>
                {dismissLabel}
              </Button>
            )}
          />
          {props.tertiaryActions}
          {props.action}
        </div>
      </DialogFrame>
    </BaseAlertDialog.Root>
  )
}
