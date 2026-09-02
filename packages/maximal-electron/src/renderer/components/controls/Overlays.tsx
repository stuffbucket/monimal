import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useContext, type ComponentType, type ReactNode } from 'react';

import { SHELL_ROOT_CLASS, ShellRoot } from '../../lib/shell-root.js';

/**
 * Things that sit above the page.
 *
 * Both are Radix, on the same rule the rest of this repository follows: hand
 * roll nothing whose accessibility is hard. A modal needs a focus trap, an
 * accessible name, `aria-modal`, and inert content behind it; a menu needs
 * roving focus and typeahead. The overlay's hand-rolled modal had none of the
 * first four.
 */


/** Marks the element `shellPortalRoot` creates, so a second call finds it. */
const STANDALONE_ATTRIBUTE = 'data-sb-shell-portal-root';

/**
 * Publishes the element a portalled surface mounts into.
 *
 * Every rule in the shipped `structural.css` is scoped under `.sb-shell`, and
 * a Radix portal defaults to `document.body`, which is outside it. `ShellLayout`
 * owns that class, so it supplies the element here.
 */
export function ShellPortalRoot({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return <ShellRoot.Provider value={element}>{children}</ShellRoot.Provider>;
}

/**
 * A shell root for a surface with no `ShellLayout` above it.
 *
 * The Radix default of `document.body` is not merely unstyled. A standalone
 * `Dialog` there keeps the focus trap and the `aria-hidden` on the rest of the
 * document, and computes `position: static` with no scrim: modal behaviour
 * wearing the appearance of a paragraph. Measured; `docs/embedding.md` has the
 * numbers.
 *
 * Keyed on an attribute rather than a module variable, so a document served by
 * two copies of this module still gets one element.
 */
export function shellPortalRoot(target: Document): HTMLElement {
  const found = target.querySelector<HTMLElement>(`[${STANDALONE_ATTRIBUTE}]`);
  if (found !== null) return found;

  const created = target.createElement('div');
  created.className = SHELL_ROOT_CLASS;
  created.setAttribute(STANDALONE_ATTRIBUTE, '');
  target.body.append(created);
  return created;
}

/**
 * The element to portal into.
 *
 * `undefined` only where there is nothing to portal into: a server render, or
 * the single render before `ShellLayout`'s root attaches, and neither has an
 * open surface. Resolved during render rather than in an effect, because an
 * effect lands one commit later and a `Dialog` mounted already open would paint
 * once on `document.body` — the defect this exists to remove.
 */
export function useShellPortalContainer(): HTMLElement | undefined {
  const provided = useContext(ShellRoot);
  if (provided !== undefined) return provided ?? undefined;
  return typeof document === 'undefined' ? undefined : shellPortalRoot(document);
}

/**
 * A modal dialog.
 *
 * `title` and `description` are the accessible name and description, and both
 * are always hidden visually — draw the heading you want inside `children`.
 *
 * It portals, so it mounts outside whatever element carries `.sb-shell` unless
 * a root is in scope. `ShellLayout` provides one; without it the component
 * makes its own under `body`, which inherits from `body` rather than from your
 * container. Define the `--shell-*` properties on `:root` or `body`.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = 'dialog',
  overlayClassName = 'dialog__scrim',
  modal = true,
  onEscapeKeyDown,
  onKeyDown,
  onPointerDownOutside,
  onOpenAutoFocus,
  testId,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The accessible name. Always hidden visually; draw your own heading. */
  title: string;
  /** The accessible description. Hidden visually on the same terms. */
  description?: string;
  children: ReactNode;
  /** Overridable so a document with its own card styles can keep them. */
  className?: string;
  overlayClassName?: string;
  modal?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** On the content, so it sees a key before the fields inside it do. */
  onKeyDown?: (event: React.KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
  testId?: string;
}) {
  const container = useShellPortalContainer();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className={overlayClassName} />
        <DialogPrimitive.Content
          className={className}
          data-testid={testId}
          onEscapeKeyDown={onEscapeKeyDown}
          onKeyDown={onKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          </VisuallyHidden>
          {description && (
            <VisuallyHidden asChild>
              <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
            </VisuallyHidden>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A dropdown menu. The trigger is the caller's; the popup is not. */
export function Menu({
  trigger,
  header,
  items,
  align = 'start',
  testId,
}: {
  trigger: ReactNode;
  /**
   * Non-interactive content above the items.
   *
   * A `DropdownMenu.Label`, so roving focus steps over it rather than into it.
   * The profile menu is why: a menu that says who is signed in has to say it
   * inside the popup, and a disabled item reads as an action that is
   * unavailable rather than as a caption.
   */
  header?: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
  testId?: string;
}) {
  const container = useShellPortalContainer();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content className="menu" align={align} sideOffset={6} data-testid={testId}>
          {header !== undefined && (
            <DropdownMenu.Label className="menu__header">{header}</DropdownMenu.Label>
          )}
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenu.Item
                key={item.id}
                className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
                disabled={item.disabled}
                onSelect={item.onSelect}
                data-testid={`menu-${item.id}`}
              >
                {Icon && <Icon size={14} />}
                <span>{item.label}</span>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
