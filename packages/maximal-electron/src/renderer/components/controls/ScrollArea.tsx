import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type UIEvent,
} from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

const SCROLLBAR_HIDE_DELAY_MS = 800;

const SCROLL_AREA_STYLES = `
.sb-shell {
  --shell-scrollbar-size: 10px;
  --shell-scrollbar-inset: 3px;
}
.sb-shell .scroll-area {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.sb-shell .scroll-area:hover,
.sb-shell .scroll-area:focus-within,
.sb-shell .scroll-area[data-scrollbar-visible='true'] {
  scrollbar-color: var(--maximal-color-border-strong) transparent;
}
.sb-shell .scroll-area::-webkit-scrollbar {
  width: var(--shell-scrollbar-size);
  height: var(--shell-scrollbar-size);
}
.sb-shell .scroll-area::-webkit-scrollbar-thumb {
  border: var(--shell-scrollbar-inset) solid transparent;
  border-radius: var(--shell-radius-pill);
  background: transparent;
  background-clip: content-box;
  transition: background-color var(--shell-duration-fast) var(--shell-ease-out);
}
.sb-shell .scroll-area:hover::-webkit-scrollbar-thumb,
.sb-shell .scroll-area:focus-within::-webkit-scrollbar-thumb,
.sb-shell .scroll-area[data-scrollbar-visible='true']::-webkit-scrollbar-thumb {
  background-color: var(--maximal-color-border-strong);
}
.sb-shell .scroll-area::-webkit-scrollbar-thumb:hover {
  background-color: var(--maximal-color-icon-secondary);
}
.sb-shell .scroll-area::-webkit-scrollbar-track {
  background: transparent;
}
.sb-shell .scroll-area[data-surface='canvas'] {
  background: var(--maximal-color-bg-secondary);
}
`;

interface ScrollAreaProps extends ComponentPropsWithoutRef<'div'> {
  as?: 'div' | 'nav';
  surface?: 'canvas';
}

/** A scroll region whose scrollbar remains visible briefly after interaction. */
export function ScrollArea({
  as: Component = 'div',
  className,
  children,
  onScroll,
  surface,
  tabIndex = 0,
  ...props
}: ScrollAreaProps): ReactElement {
  useComponentStyles('scroll-area', SCROLL_AREA_STYLES);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const classes = ['scroll-area'];
  if (className) classes.push(className);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  function showScrollbar(event: UIEvent<HTMLDivElement>): void {
    const area = event.currentTarget;
    area.dataset.scrollbarVisible = 'true';
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      delete area.dataset.scrollbarVisible;
    }, SCROLLBAR_HIDE_DELAY_MS);
    onScroll?.(event);
  }

  return (
    <Component
      className={classes.join(' ')}
      data-surface={surface}
      onScroll={showScrollbar}
      tabIndex={tabIndex}
      {...props}
    >
      {children}
    </Component>
  );
}