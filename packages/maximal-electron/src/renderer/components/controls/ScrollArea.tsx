import type { ComponentPropsWithoutRef, ReactElement } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

const SCROLL_AREA_STYLES = `
.sb-shell .scroll-area {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
`;

/** A scroll region that retains the platform scrollbar's fade and colour scheme. */
export function ScrollArea({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'>): ReactElement {
  useComponentStyles('scroll-area', SCROLL_AREA_STYLES);
  const classes = ['scroll-area'];
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} {...props}>
      {children}
    </div>
  );
}