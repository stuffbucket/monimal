import type { ComponentPropsWithoutRef, ReactElement } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

const SCROLL_AREA_STYLES = `
.sb-shell .scroll-area {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.sb-shell .scroll-area[data-surface='canvas'] {
  background: var(--shell-canvas);
}
`;

interface ScrollAreaProps extends ComponentPropsWithoutRef<'div'> {
  surface?: 'canvas';
}

/** A scroll region that retains the platform scrollbar's fade and colour scheme. */
export function ScrollArea({
  className,
  children,
  surface,
  ...props
}: ScrollAreaProps): ReactElement {
  useComponentStyles('scroll-area', SCROLL_AREA_STYLES);
  const classes = ['scroll-area'];
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} data-surface={surface} {...props}>
      {children}
    </div>
  );
}