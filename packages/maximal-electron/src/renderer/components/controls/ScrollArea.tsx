import type { ComponentPropsWithoutRef, ReactElement } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

const SCROLL_AREA_STYLES = `
.sb-shell .scroll-area {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--shell-text-muted) transparent;
  scrollbar-gutter: stable;
}
.sb-shell .scroll-area::-webkit-scrollbar {
  width: var(--shell-space-3);
  height: var(--shell-space-3);
}
.sb-shell .scroll-area::-webkit-scrollbar-thumb {
  border: var(--shell-space-1) solid transparent;
  border-radius: var(--shell-radius-pill);
  background: var(--shell-text-muted);
  background-clip: content-box;
}
.sb-shell .scroll-area::-webkit-scrollbar-thumb:hover {
  background: var(--shell-text);
  background-clip: content-box;
}
.sb-shell .scroll-area::-webkit-scrollbar-track { background: transparent; }
`;

/** A scroll region with stable geometry and shell-token scrollbar colours. */
export function ScrollArea({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'>): ReactElement {
  useComponentStyles('scroll-area', SCROLL_AREA_STYLES);

  return (
    <div className={['scroll-area', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}