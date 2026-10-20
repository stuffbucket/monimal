import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ComponentPropsWithRef, ReactNode, RefObject } from 'react'

import type { DataAttributes } from '../element-attributes'

type DialogPopupProps = ComponentPropsWithRef<typeof BaseDialog.Popup>

export type DialogPortalContainer =
  | HTMLElement
  | ShadowRoot
  | RefObject<HTMLElement | ShadowRoot | null>
  | null

export type DialogFramePopupProps = Omit<
  DialogPopupProps,
  'children' | 'finalFocus' | 'initialFocus' | 'onKeyDown'
> & DataAttributes

export interface DialogFrameProps {
  title: ReactNode
  description?: ReactNode | undefined
  children: ReactNode
  showTitle: boolean
  showDescription: boolean
  modal: boolean
  className?: string | undefined
  overlayClassName?: string | undefined
  viewportClassName?: string | undefined
  onKeyDown?: DialogPopupProps['onKeyDown'] | undefined
  initialFocus?: DialogPopupProps['initialFocus'] | undefined
  finalFocus?: DialogPopupProps['finalFocus'] | undefined
  popupProps?: DialogFramePopupProps | undefined
  container?: DialogPortalContainer | undefined
}

function classNames(...names: ReadonlyArray<string | false | undefined>): string {
  return names.filter(Boolean).join(' ')
}

/**
 * Portal, backdrop, viewport, and popup shared by `Dialog` and `AlertDialog`.
 * Base UI's alert-dialog parts are its dialog parts, so either root supplies
 * the context these render within.
 */
export function DialogFrame({
  title,
  description,
  children,
  showTitle,
  showDescription,
  modal,
  className,
  overlayClassName,
  viewportClassName,
  onKeyDown,
  initialFocus,
  finalFocus,
  popupProps,
  container,
}: DialogFrameProps) {
  return (
    <BaseDialog.Portal container={container}>
      <BaseDialog.Backdrop
        className={classNames('maximal-dialog__backdrop', overlayClassName)}
      />
      <BaseDialog.Viewport
        className={classNames('maximal-dialog__viewport', viewportClassName)}
      >
        <BaseDialog.Popup
          {...popupProps}
          aria-modal={modal ? true : undefined}
          className={classNames(
            'maximal-dialog',
            className,
            typeof popupProps?.className === 'string' ? popupProps.className : undefined,
          )}
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          onKeyDown={onKeyDown}
        >
          <BaseDialog.Title
            className={classNames(
              'maximal-dialog__title',
              !showTitle && 'maximal-visually-hidden',
            )}
          >
            {title}
          </BaseDialog.Title>
          {description ? (
            <BaseDialog.Description
              className={classNames(
                'maximal-dialog__description',
                !showDescription && 'maximal-visually-hidden',
              )}
            >
              {description}
            </BaseDialog.Description>
          ) : null}
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  )
}
