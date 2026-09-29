import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import type { BrowserHostBridge, BrowserSession } from '../contract.js';

export interface BrowserSurfaceProps {
  session: BrowserSession;
  bridge: BrowserHostBridge;
}

export function BrowserSurface({ session, bridge }: BrowserSurfaceProps): ReactElement {
  const [address, setAddress] = useState(session.url);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => setAddress(session.url), [session.url]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const show = (): void => {
      const bounds = element.getBoundingClientRect();
      void bridge.show(session.id, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    };
    const observer = new ResizeObserver(show);
    observer.observe(element);
    window.addEventListener('resize', show);
    show();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', show);
      void bridge.show(null);
    };
  }, [bridge, session.id]);

  const navigate = (event: FormEvent): void => {
    event.preventDefault();
    void bridge.navigate(session.id, address);
  };

  return (
    <section className="maximal-browser" aria-label={`Browser: ${session.title}`}>
      <form className="maximal-browser__toolbar" onSubmit={navigate}>
        <button disabled={session.control === 'agent-exclusive'} type="button" aria-label="Back" onClick={() => void bridge.command(session.id, 'back')}>←</button>
        <button disabled={session.control === 'agent-exclusive'} type="button" aria-label="Forward" onClick={() => void bridge.command(session.id, 'forward')}>→</button>
        <button disabled={session.control === 'agent-exclusive'} type="button" aria-label="Reload" onClick={() => void bridge.command(session.id, 'reload')}>↻</button>
        <input
          aria-label="Address"
          disabled={session.control === 'agent-exclusive'}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        {session.control !== 'user' ? (
          <span className="maximal-browser__agent-control">
            Agent control · {session.control === 'agent-exclusive' ? 'Exclusive' : 'Shared'}
            <button
              type="button"
              onClick={() => void bridge.setControl(
                session.id,
                session.control === 'agent-exclusive' ? 'agent-shared' : 'agent-exclusive',
              )}
            >
              {session.control === 'agent-exclusive' ? 'Share control' : 'Make exclusive'}
            </button>
            <button
              type="button"
              onClick={() => void bridge.setControl(session.id, 'user')}
            >
              Release
            </button>
          </span>
        ) : null}
      </form>
      <div ref={viewport} className="maximal-browser__viewport" />
    </section>
  );
}
