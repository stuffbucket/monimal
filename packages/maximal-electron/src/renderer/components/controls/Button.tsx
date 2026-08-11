import * as Tooltip from '@radix-ui/react-tooltip';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { useShellPortalContainer } from './Overlays.js';

/**
 * Buttons.
 *
 * Before this there was no button. There were five hand-rolled ones: two
 * inspector actions wearing `className="row"` (the dense-list-row class), the
 * overlay's `.approval__button`, and the fixture's `.approval__allow` and
 * `.approval__deny` — the last two being different names for the same thing in
 * stylesheets that cannot see each other.
 */

export type ButtonVariant = 'default' | 'primary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Anything not named here is forwarded to the `<button>`, including `ref`.
 *
 * That is not tidiness. Radix's `asChild` clones its child and hands it props
 * and a ref, so a button that accepts only its own props silently drops them:
 * `Menu` rendered a trigger that did nothing at all, and the story that would
 * have caught it was itself passing for the wrong reason. A primitive that
 * cannot be composed is not a primitive.
 */
export function Button({
  children,
  variant = 'default',
  size = 'md',
  block,
  type = 'button',
  testId,
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fill the width of the container. */
  block?: boolean;
  testId?: string;
} & Omit<ComponentPropsWithRef<'button'>, 'type'> & {
    type?: 'button' | 'submit';
  }) {
  // The default variant is the base `.btn`, and no stylesheet writes a rule
  // for `.btn--default`. Named rather than interpolated, so the reader in
  // `tests/class-names.ts` sees which modifiers exist.
  const classes = ['btn', `btn--${size}`];
  if (variant === 'primary') classes.push('btn--primary');
  if (variant === 'danger') classes.push('btn--danger');
  if (block) classes.push('btn--block');
  if (className) classes.push(className);

  return (
    <button
      {...rest}
      type={type === 'submit' ? 'submit' : 'button'}
      className={classes.join(' ')}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/**
 * An icon button with a tooltip.
 *
 * Radix `Tooltip.Root` needs a `Tooltip.Provider` above it. `ShellLayout`
 * supplies one; the overlay document does not, and forgetting it renders
 * nothing rather than throwing. Use `Button` there.
 */
export function IconButton({
  label,
  children,
  active,
  danger,
  testId,
  ...rest
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  testId?: string;
} & ComponentPropsWithRef<'button'>) {
  const container = useShellPortalContainer();

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          {...rest}
          type="button"
          className={`icon-button${danger ? ' icon-button--danger' : ''}`}
          aria-label={label}
          data-active={active ? 'true' : undefined}
          data-testid={testId}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal container={container}>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
